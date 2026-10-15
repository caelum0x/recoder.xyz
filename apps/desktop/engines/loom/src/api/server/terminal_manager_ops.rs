//! Synchronous (non-streaming) handlers for the `terminal_manager.*` API
//! methods: `open`, `write`, `status`, `close`. The fifth method,
//! `terminal_manager.stream`, upgrades the connection into a push stream and
//! lives in `terminal_manager_stream.rs` instead.
//!
//! These call directly into `crate::terminal_manager::global()` and never
//! touch `api_tx` (the app actor channel) — terminal-manager panes are not
//! TUI panes and do not require a running interactive app. See
//! `docs/T3CODE-FORK.md` patch-queue item #1.

use base64::Engine as _;

use crate::api::schema::{
    ErrorBody, ErrorResponse, ResponseResult, SuccessResponse, TerminalManagerOpenParams,
    TerminalManagerPaneTarget, TerminalManagerWriteParams,
};
use crate::terminal_manager::{self, OpenPaneOptions, TerminalManagerError};

fn error_response(request_id: String, code: &str, message: String) -> String {
    serde_json::to_string(&ErrorResponse {
        id: request_id,
        error: ErrorBody {
            code: code.into(),
            message,
        },
    })
    .unwrap_or_else(|_| {
        r#"{"id":"","error":{"code":"internal_error","message":"failed to encode response"}}"#
            .to_string()
    })
}

fn success_response(request_id: String, result: ResponseResult) -> String {
    serde_json::to_string(&SuccessResponse {
        id: request_id,
        result,
    })
    .unwrap_or_else(|_| {
        r#"{"id":"","error":{"code":"internal_error","message":"failed to encode response"}}"#
            .to_string()
    })
}

pub(crate) fn terminal_manager_error_code(err: &TerminalManagerError) -> &'static str {
    match err {
        TerminalManagerError::UnknownPane => "unknown_pane",
        TerminalManagerError::SpawnFailed(_) => "spawn_failed",
        TerminalManagerError::WriteFailed(_) => "write_failed",
    }
}

pub(super) fn open(request_id: String, params: TerminalManagerOpenParams) -> String {
    if params.worktree_id.trim().is_empty() {
        return error_response(
            request_id,
            "invalid_params",
            "worktree_id must not be empty".into(),
        );
    }
    if params.cwd.trim().is_empty() {
        return error_response(request_id, "invalid_params", "cwd must not be empty".into());
    }

    let worktree_id = params.worktree_id.clone();
    let options = OpenPaneOptions {
        worktree_id,
        cwd: params.cwd,
        cols: params.cols,
        rows: params.rows,
        env: params.env,
        shell: params.shell,
    };

    match terminal_manager::global().open(options) {
        Ok((pane_handle, opened)) => success_response(
            request_id,
            ResponseResult::TerminalManagerOpened {
                pane_handle,
                pid: opened.pid,
                worktree_id: params.worktree_id,
            },
        ),
        Err(err) => error_response(request_id, terminal_manager_error_code(&err), err.to_string()),
    }
}

pub(super) fn write(request_id: String, params: TerminalManagerWriteParams) -> String {
    let data = match base64::engine::general_purpose::STANDARD.decode(&params.data_base64) {
        Ok(data) => data,
        Err(err) => {
            return error_response(
                request_id,
                "invalid_params",
                format!("data_base64 is not valid base64: {err}"),
            );
        }
    };

    match terminal_manager::global().write(&params.pane_handle, &data) {
        Ok(()) => success_response(request_id, ResponseResult::Ok {}),
        Err(err) => error_response(request_id, terminal_manager_error_code(&err), err.to_string()),
    }
}

pub(super) fn status(request_id: String, params: TerminalManagerPaneTarget) -> String {
    match terminal_manager::global().status(&params.pane_handle) {
        Ok(snapshot) => success_response(
            request_id,
            ResponseResult::TerminalManagerStatus {
                pane_handle: params.pane_handle,
                alive: snapshot.alive,
                exit_code: snapshot.exit_code,
                pid: snapshot.pid,
                worktree_id: snapshot.worktree_id,
            },
        ),
        Err(err) => error_response(request_id, terminal_manager_error_code(&err), err.to_string()),
    }
}

pub(super) fn close(request_id: String, params: TerminalManagerPaneTarget) -> String {
    match terminal_manager::global().close(&params.pane_handle) {
        Ok(()) => success_response(request_id, ResponseResult::Ok {}),
        Err(err) => error_response(request_id, terminal_manager_error_code(&err), err.to_string()),
    }
}
