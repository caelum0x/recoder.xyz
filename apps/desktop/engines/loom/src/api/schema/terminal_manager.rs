use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Opens a new worktree-scoped PTY and returns its pane handle. See
/// `docs/T3CODE-FORK.md` patch-queue item #1: this is the seam the forked t3
/// server's node-pty-based terminal manager drives on macOS/Linux instead of
/// `node-pty` directly.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema, Default)]
pub struct TerminalManagerOpenParams {
    /// Opaque scoping key chosen by the caller. Not resolved by Loom — the
    /// caller already knows the worktree's absolute path and passes it as
    /// `cwd` — this field exists purely for isolation and observability
    /// (reported back by `terminal_manager.status`).
    pub worktree_id: String,
    pub cwd: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cols: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rows: Option<u16>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shell: Option<String>,
}

/// Shared target shape for every other `terminal_manager.*` method, mirroring
/// `PaneTarget`'s reuse across `pane.get`/`pane.focus`/`pane.close`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TerminalManagerPaneTarget {
    pub pane_handle: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TerminalManagerWriteParams {
    pub pane_handle: String,
    /// Base64-encoded raw bytes to write to the pane's PTY stdin.
    /// Binary-safe, unlike `pane.send_text`'s plain-UTF-8 `text`.
    pub data_base64: String,
}
