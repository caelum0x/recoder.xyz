use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use base64::Engine as _;
use interprocess::local_socket::traits::Stream as _;
use interprocess::TryClone as _;
use tracing::{debug, warn};

use crate::api::schema::{
    ErrorBody, ErrorResponse, PaneTerminalStreamMode, PaneTerminalStreamParams, ResponseResult,
    SuccessResponse,
};
use crate::ipc::{poll_local_stream_read, set_local_stream_polling, LocalStream, LocalStreamRead};
use crate::protocol::{
    self, ClientKeybindings, ClientLaunchMode, ClientMessage, RenderEncoding, ServerMessage,
    MAX_GRAPHICS_FRAME_SIZE, MAX_FRAME_SIZE, PROTOCOL_VERSION,
};

use super::{
    write_json_line, write_json_line_allow_disconnect, APP_RESPONSE_TIMEOUT,
    CONNECTION_POLL_INTERVAL, MAX_INITIAL_REQUEST_BYTES,
};

pub(super) fn serve(
    stream: LocalStream,
    request_id: String,
    params: PaneTerminalStreamParams,
    running: &Arc<AtomicBool>,
) -> io::Result<()> {
    if params.pane_id.trim().is_empty() {
        return write_open_error(stream, request_id, "invalid_params", "pane_id must not be empty");
    }
    if params.cols == 0 || params.rows == 0 {
        return write_open_error(
            stream,
            request_id,
            "invalid_params",
            "cols and rows must be greater than 0",
        );
    }
    if params.mode == PaneTerminalStreamMode::Observe && params.takeover {
        return write_open_error(
            stream,
            request_id,
            "invalid_params",
            "takeover is only valid in control mode",
        );
    }

    let mut private = match connect_private_stream(&params) {
        Ok(private) => private,
        Err(err) => {
            return write_open_error(
                stream,
                request_id,
                "terminal_stream_unavailable",
                &err.to_string(),
            );
        }
    };

    let mut output = stream.try_clone()?;
    write_json_line(
        &mut output,
        &SuccessResponse {
            id: request_id,
            result: ResponseResult::TerminalStreamStarted {
                pane_id: params.pane_id.clone(),
                mode: params.mode,
                cols: params.cols,
                rows: params.rows,
            },
        },
    )?;

    let stop = Arc::new(AtomicBool::new(false));
    let input_stop = Arc::clone(&stop);
    let input_running = Arc::clone(running);
    let mut private_writer = private.try_clone()?;
    let input_thread = std::thread::spawn(move || {
        forward_public_input(stream, &mut private_writer, &input_stop, &input_running);
    });

    let closed_reason = loop {
        match protocol::read_message(&mut private, MAX_GRAPHICS_FRAME_SIZE) {
            Ok(ServerMessage::Terminal(frame)) => {
                let envelope = serde_json::json!({
                    "type": "terminal.frame",
                    "seq": frame.seq,
                    "encoding": "ansi",
                    "width": frame.width,
                    "height": frame.height,
                    "full": frame.full,
                    "bytes": base64::engine::general_purpose::STANDARD.encode(&frame.bytes),
                });
                if let Err(err) = write_json_line(&mut output, &envelope) {
                    break Some(format!("public terminal stream write failed: {err}"));
                }
            }
            Ok(ServerMessage::ServerShutdown { reason }) => break reason,
            Ok(ServerMessage::Graphics { .. }) => {}
            Ok(_) => {}
            Err(protocol::FramingError::UnexpectedEof) => {
                break Some("private terminal stream disconnected".into());
            }
            Err(err) => {
                warn!(err = %err, "private terminal stream read failed");
                break Some(format!("private terminal stream failed: {err}"));
            }
        }
    };

    stop.store(true, Ordering::Release);
    if input_thread.join().is_err() {
        warn!("public terminal stream input thread panicked");
    }

    write_json_line_allow_disconnect(
        &mut output,
        &serde_json::json!({
            "type": "terminal.closed",
            "reason": closed_reason,
        }),
    )
}

fn connect_private_stream(params: &PaneTerminalStreamParams) -> io::Result<LocalStream> {
    let socket_path = crate::server::socket_paths::client_socket_path();
    let mut stream = crate::ipc::connect_local_stream(&socket_path)?;
    stream.set_nonblocking(false)?;

    write_private_message(
        &mut stream,
        &ClientMessage::Hello {
            version: PROTOCOL_VERSION,
            cols: params.cols,
            rows: params.rows,
            cell_width_px: 0,
            cell_height_px: 0,
            requested_encoding: RenderEncoding::TerminalAnsi,
            keybindings: ClientKeybindings::Server,
            launch_mode: ClientLaunchMode::TerminalAttach,
        },
    )?;

    set_private_handshake_timeout(&stream, Some(APP_RESPONSE_TIMEOUT))?;
    let welcome: ServerMessage = protocol::read_message(&mut stream, MAX_FRAME_SIZE)
        .map_err(|err| io::Error::other(err.to_string()))?;
    set_private_handshake_timeout(&stream, None)?;
    match welcome {
        ServerMessage::Welcome {
            version,
            encoding: RenderEncoding::TerminalAnsi,
            error: None,
        } if version == PROTOCOL_VERSION => {}
        ServerMessage::Welcome { version, error, .. } => {
            let detail = error.unwrap_or_else(|| "unsupported render encoding".into());
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("private client handshake rejected at protocol {version}: {detail}"),
            ));
        }
        _ => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "private client handshake returned an unexpected message",
            ));
        }
    }

    let request = match params.mode {
        PaneTerminalStreamMode::Control => ClientMessage::ControlTerminal {
            target: params.pane_id.clone(),
            takeover: params.takeover,
        },
        PaneTerminalStreamMode::Observe => ClientMessage::ObserveTerminal {
            target: params.pane_id.clone(),
        },
    };
    write_private_message(&mut stream, &request)?;
    Ok(stream)
}

fn forward_public_input(
    mut public: LocalStream,
    private: &mut LocalStream,
    stop: &Arc<AtomicBool>,
    running: &Arc<AtomicBool>,
) {
    if let Err(err) = set_local_stream_polling(&mut public, true) {
        debug!(err = %err, "public terminal stream input polling unavailable");
        let _ = write_private_message(private, &ClientMessage::Detach);
        return;
    }

    let mut line = Vec::new();
    let mut byte = [0u8; 1];
    let mut released = false;
    let mut discarding_oversized_line = false;
    while !stop.load(Ordering::Acquire) && running.load(Ordering::Relaxed) {
        match poll_local_stream_read(&mut public, &mut byte) {
            Ok(LocalStreamRead::Data) if byte[0] == b'\n' => {
                if !discarding_oversized_line && forward_control_line(&line, private) {
                    released = true;
                    break;
                }
                line.clear();
                discarding_oversized_line = false;
            }
            Ok(LocalStreamRead::Data) => {
                if discarding_oversized_line {
                    continue;
                }
                if line.len() >= MAX_INITIAL_REQUEST_BYTES {
                    warn!("public terminal stream control line exceeded size limit");
                    line.clear();
                    discarding_oversized_line = true;
                } else {
                    line.push(byte[0]);
                }
            }
            Ok(LocalStreamRead::Pending) => std::thread::sleep(CONNECTION_POLL_INTERVAL),
            Ok(LocalStreamRead::Closed) => break,
            Err(err) => {
                debug!(err = %err, "public terminal stream input closed");
                break;
            }
        }
    }

    if !released {
        let _ = write_private_message(private, &ClientMessage::Detach);
    }
}

fn forward_control_line(line: &[u8], private: &mut LocalStream) -> bool {
    let Ok(raw) = std::str::from_utf8(line) else {
        warn!("public terminal stream ignored non-UTF-8 control line");
        return false;
    };
    if raw.trim().is_empty() {
        return false;
    }

    match crate::client::terminal_control_command_from_json(raw) {
        Ok(message) => {
            let released = matches!(message, ClientMessage::Detach);
            if let Err(err) = write_private_message(private, &message) {
                debug!(err = %err, "private terminal stream input closed");
                return true;
            }
            released
        }
        Err(err) => {
            warn!(err = %err, "public terminal stream ignored invalid control command");
            false
        }
    }
}

fn write_private_message(stream: &mut LocalStream, message: &ClientMessage) -> io::Result<()> {
    protocol::write_message(stream, message).map_err(|err| io::Error::other(err.to_string()))
}

fn set_private_handshake_timeout(
    stream: &LocalStream,
    timeout: Option<std::time::Duration>,
) -> io::Result<()> {
    match stream.set_recv_timeout(timeout) {
        Ok(()) => Ok(()),
        #[cfg(windows)]
        Err(err) if err.kind() == io::ErrorKind::Unsupported => Ok(()),
        Err(err) => Err(err),
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
