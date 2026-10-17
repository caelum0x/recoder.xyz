//! `terminal_manager.stream`: the output-stream/subscription half of the
//! `terminal_manager.*` seam (see `terminal_manager_ops.rs` for the
//! synchronous `open`/`write`/`status`/`close` methods and
//! `crate::terminal_manager` for the registry itself).
//!
//! Bidirectional on one connection, mirroring `pane_terminal_stream.rs`'s
//! shape: a dedicated thread forwards inbound `{"data_base64": "..."}` lines
//! into the pane's stdin while the main loop polls the pane's output ring
//! and pushes `terminal_manager.output` / `terminal_manager.exited` /
//! `terminal_manager.closed` lines back to the client.

use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use base64::Engine as _;
use interprocess::TryClone as _;
use tracing::{debug, warn};

use crate::api::schema::{
    ErrorBody, ErrorResponse, ResponseResult, SuccessResponse, TerminalManagerPaneTarget,
};
use crate::ipc::{poll_local_stream_read, set_local_stream_polling, LocalStream, LocalStreamRead};
use crate::terminal_manager::{self, PaneOutputEvent};

use super::terminal_manager_ops::terminal_manager_error_code;
use super::{
    write_json_line, write_json_line_allow_disconnect, CONNECTION_POLL_INTERVAL,
    MAX_INITIAL_REQUEST_BYTES,
};

pub(super) fn serve(
    stream: LocalStream,
    request_id: String,
    params: TerminalManagerPaneTarget,
    running: &Arc<AtomicBool>,
) -> io::Result<()> {
    let manager = terminal_manager::global();
    let initial_cursor = match manager.current_output_sequence(&params.pane_handle) {
        Ok(cursor) => cursor,
        Err(err) => {
            return write_open_error(
                stream,
                request_id,
                terminal_manager_error_code(&err),
                &err.to_string(),
            );
        }
    };

    let mut output = stream.try_clone()?;
    write_json_line(
        &mut output,
        &SuccessResponse {
            id: request_id,
            result: ResponseResult::TerminalManagerStreamStarted {
                pane_handle: params.pane_handle.clone(),
            },
        },
    )?;

    let stop = Arc::new(AtomicBool::new(false));
    let input_stop = Arc::clone(&stop);
    let input_running = Arc::clone(running);
    let pane_handle_for_input = params.pane_handle.clone();
    let input_thread = std::thread::spawn(move || {
        forward_write_commands(stream, &pane_handle_for_input, &input_stop, &input_running);
    });

    let closed_reason = pump_output(&mut output, &params.pane_handle, initial_cursor, running);

    stop.store(true, Ordering::Release);
    if input_thread.join().is_err() {
        warn!("terminal manager stream input thread panicked");
    }

    write_json_line_allow_disconnect(
        &mut output,
        &serde_json::json!({
            "type": "terminal_manager.closed",
            "pane_handle": params.pane_handle,
            "reason": closed_reason,
        }),
    )
}

/// Polls the pane's output ring and pushes every new event to `output`.
/// Returns the reason the pump stopped (connection closed, write failed, the
/// pane was closed/unregistered, or the pane's own process exited).
///
/// Deliberately does NOT call `should_stop_connection`/`local_stream_peer_closed`
/// here: that helper flips the stream to non-blocking and back to *blocking*
/// around its probe read (`probe_stream_closed` in `crate::ipc`). `output` is
/// a `try_clone()` of the same connection `forward_write_commands` holds as
/// `public` on its own thread, kept permanently non-blocking there — `dup`'d
/// descriptors share one open-file-description's status flags on POSIX, so
/// that reset-to-blocking would race the other thread's reads and could
/// block it forever waiting for client input that never arrives. Relying on
/// `running` plus a failed write (the client closing its read end) to detect
/// disconnection avoids touching the shared flag at all, matching how
/// `pane_terminal_stream.rs`'s loop detects disconnection too.
fn pump_output(
    output: &mut LocalStream,
    pane_handle: &str,
    mut cursor: u64,
    running: &Arc<AtomicBool>,
) -> Option<String> {
    let manager = terminal_manager::global();
    loop {
        if !running.load(Ordering::Relaxed) {
            return Some("server is shutting down".to_string());
        }

        let events = match manager.output_events_after(pane_handle, cursor) {
            Ok(events) => events,
            Err(err) => return Some(format!("pane unavailable: {err}")),
        };

        for (sequence, event) in events {
            cursor = sequence;
            let write_result = match &event {
                PaneOutputEvent::Data(data) => write_json_line(
                    output,
                    &serde_json::json!({
                        "type": "terminal_manager.output",
                        "pane_handle": pane_handle,
                        "data_base64": base64::engine::general_purpose::STANDARD.encode(data),
                    }),
                ),
                PaneOutputEvent::Exited { exit_code } => write_json_line(
                    output,
                    &serde_json::json!({
                        "type": "terminal_manager.exited",
                        "pane_handle": pane_handle,
                        "exit_code": exit_code,
                    }),
                ),
            };
            if let Err(err) = write_result {
                return Some(format!("public terminal manager stream write failed: {err}"));
            }
            if matches!(event, PaneOutputEvent::Exited { .. }) {
                return Some("pane exited".to_string());
            }
        }

        std::thread::sleep(CONNECTION_POLL_INTERVAL);
    }
}

fn forward_write_commands(
    mut public: LocalStream,
    pane_handle: &str,
    stop: &Arc<AtomicBool>,
    running: &Arc<AtomicBool>,
) {
    if let Err(err) = set_local_stream_polling(&mut public, true) {
        debug!(err = %err, "terminal manager stream input polling unavailable");
        return;
    }

    let mut line = Vec::new();
    let mut byte = [0u8; 1];
    let mut discarding_oversized_line = false;
    while !stop.load(Ordering::Acquire) && running.load(Ordering::Relaxed) {
        match poll_local_stream_read(&mut public, &mut byte) {
            Ok(LocalStreamRead::Data) if byte[0] == b'\n' => {
                if !discarding_oversized_line {
                    forward_write_line(&line, pane_handle);
                }
                line.clear();
                discarding_oversized_line = false;
            }
            Ok(LocalStreamRead::Data) => {
                if discarding_oversized_line {
                    continue;
                }
                if line.len() >= MAX_INITIAL_REQUEST_BYTES {
                    warn!("terminal manager stream input line exceeded size limit");
                    line.clear();
                    discarding_oversized_line = true;
                } else {
                    line.push(byte[0]);
                }
            }
            Ok(LocalStreamRead::Pending) => std::thread::sleep(CONNECTION_POLL_INTERVAL),
            Ok(LocalStreamRead::Closed) => break,
            Err(err) => {
                debug!(err = %err, "terminal manager stream input closed");
                break;
            }
        }
    }
}

fn forward_write_line(line: &[u8], pane_handle: &str) {
    let Ok(raw) = std::str::from_utf8(line) else {
        warn!("terminal manager stream ignored non-UTF-8 input line");
        return;
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return;
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        warn!("terminal manager stream ignored invalid input line");
        return;
    };
    let Some(data_base64) = value.get("data_base64").and_then(|field| field.as_str()) else {
        warn!("terminal manager stream input line missing data_base64");
        return;
    };
    let Ok(data) = base64::engine::general_purpose::STANDARD.decode(data_base64) else {
        warn!("terminal manager stream input line has invalid base64");
        return;
    };
    if let Err(err) = terminal_manager::global().write(pane_handle, &data) {
        warn!(err = %err, "terminal manager stream input write failed");
    }
}

fn write_open_error(
    mut stream: LocalStream,
    request_id: String,
    code: &str,
    message: &str,
) -> io::Result<()> {
    write_json_line_allow_disconnect(
        &mut stream,
        &ErrorResponse {
            id: request_id,
            error: ErrorBody {
                code: code.into(),
                message: message.into(),
            },
        },
    )
}
