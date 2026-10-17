//! `TerminalManager`: a worktree-scoped, bidirectional raw-PTY registry
//! exposed over the protocol-20 socket API (`terminal_manager.*` methods,
//! see `src/api/schema/terminal_manager.rs` and
//! `src/api/server/terminal_manager_stream.rs`).
//!
//! This closes patch-queue item #1 in `docs/T3CODE-FORK.md`: the forked t3
//! server's node-pty-based terminal manager drives `node-pty` directly on
//! Windows, and drives this module's registry on macOS/Linux instead, so
//! Recoder keeps exactly one raw-PTY substrate per platform rather than two.
//!
//! Deliberately independent of `crate::app`'s workspace/tab/pane actor: a
//! pane opened here is NOT a TUI pane, has no layout, tab, or workspace, and
//! does not require a running interactive app. That is what makes this a
//! clean seam for a headless caller (the t3 server, or `loom`'s own headless
//! daemon) instead of just reusing the existing `pane.*` API, which is only
//! reachable once a workspace/tab/pane layout already exists.
//!
//! Output delivery uses the same bounded-ring-buffer-plus-poll shape as
//! `crate::api::EventHub` (see `events_after`/`current_sequence` there):
//! the PTY reader thread appends chunks to a per-pane ring, and a consumer
//! (the `terminal_manager.stream` connection handler, or a test) polls
//! `output_events_after` for anything newer than its cursor. This keeps the
//! module fully synchronous — no async runtime needed inside the reader
//! thread — consistent with the rest of this crate's socket-server code.
//!
//! Only built on `unix` (macOS/Linux): Windows keeps `node-pty` as its
//! substrate per the composition design in `docs/T3CODE-FORK.md`, so there is
//! intentionally no Windows backend here to keep in sync.

#![cfg(unix)]

use std::collections::HashMap;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, IntoRawFd, OwnedFd};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use portable_pty::{ChildKiller, CommandBuilder};

use crate::pty::{backend as pty_backend, fd as pty_fd};

/// Opaque identifier for a terminal-manager pane. Always server-generated
/// (unlike Loom's own `pane_id`s, which may be client-chosen) — callers treat
/// it as an opaque handle, matching the task's "pane handle" framing.
pub(crate) type PaneHandle = String;

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const READ_CHUNK_SIZE: usize = 8192;
/// Bounded like `EventHub::MAX_EVENTS`: a pane nobody is polling eventually
/// evicts its oldest unconsumed output rather than growing without bound.
const MAX_OUTPUT_EVENTS: usize = 2048;

static NEXT_HANDLE_ID: AtomicU64 = AtomicU64::new(1);

fn generate_pane_handle() -> PaneHandle {
    let counter = NEXT_HANDLE_ID.fetch_add(1, Ordering::Relaxed);
    format!(
        "tm_{}",
        crate::workspace::encode_public_number(counter as usize)
    )
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
}

/// A chunk of output, or a terminal lifecycle transition, recorded in one
/// pane's output ring.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum PaneOutputEvent {
    Data(Vec<u8>),
    Exited { exit_code: Option<u32> },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum TerminalManagerError {
    UnknownPane,
    SpawnFailed(String),
    WriteFailed(String),
}

impl std::fmt::Display for TerminalManagerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownPane => write!(f, "unknown terminal manager pane handle"),
            Self::SpawnFailed(detail) => write!(f, "failed to spawn pane: {detail}"),
            Self::WriteFailed(detail) => write!(f, "failed to write to pane: {detail}"),
        }
    }
}

impl std::error::Error for TerminalManagerError {}

#[derive(Debug, Clone, Default)]
pub(crate) struct OpenPaneOptions {
    pub(crate) worktree_id: String,
    pub(crate) cwd: String,
    pub(crate) cols: Option<u16>,
    pub(crate) rows: Option<u16>,
    pub(crate) env: HashMap<String, String>,
    pub(crate) shell: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct OpenedPane {
    pub(crate) pid: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PaneStatusSnapshot {
    pub(crate) alive: bool,
    pub(crate) exit_code: Option<u32>,
    pub(crate) pid: u32,
    pub(crate) worktree_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PaneLifecycle {
    Running,
    Exited(Option<u32>),
}

#[derive(Default)]
struct PaneOutputRing {
    next_sequence: u64,
    events: Vec<(u64, PaneOutputEvent)>,
}

impl PaneOutputRing {
    fn push(&mut self, event: PaneOutputEvent) {
        self.next_sequence += 1;
        self.events.push((self.next_sequence, event));
        let overflow = self.events.len().saturating_sub(MAX_OUTPUT_EVENTS);
        if overflow > 0 {
            self.events.drain(0..overflow);
        }
    }

    fn events_after(&self, since: u64) -> Vec<(u64, PaneOutputEvent)> {
        self.events
            .iter()
            .filter(|(sequence, _)| *sequence > since)
            .cloned()
            .collect()
    }
}

struct PaneSession {
    worktree_id: String,
    pid: u32,
    writer: Mutex<std::fs::File>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    lifecycle: Mutex<PaneLifecycle>,
    output: Mutex<PaneOutputRing>,
}

/// Registry of live terminal-manager panes for one Loom process. One
/// instance is shared process-wide (see [`global`]) so a pane opened on one
/// API connection stays reachable from `write`/`status`/`close`/`stream`
/// calls made on later, independent connections — the same sharing shape the
/// API server already uses for `EventHub`.
#[derive(Default)]
pub(crate) struct TerminalManager {
    sessions: Mutex<HashMap<PaneHandle, Arc<PaneSession>>>,
}

/// The process-wide registry backing the `terminal_manager.*` API methods.
pub(crate) fn global() -> &'static TerminalManager {
    static INSTANCE: OnceLock<TerminalManager> = OnceLock::new();
    INSTANCE.get_or_init(TerminalManager::new)
}

impl TerminalManager {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Launches a new worktree-scoped PTY and returns its pane handle.
    ///
    /// `worktree_id` is an opaque scoping key supplied by the caller (the
    /// t3-bridge on the Node side already knows the worktree's absolute
    /// path); Loom does not resolve it to anything, it is only recorded for
    /// isolation/observability (see `status`). Isolation between worktrees
    /// is structural: every pane is an independent PTY process with its own
    /// output ring, so two panes opened under different `worktree_id`s never
    /// share state.
    pub(crate) fn open(
        &self,
        options: OpenPaneOptions,
    ) -> Result<(PaneHandle, OpenedPane), TerminalManagerError> {
        let shell = options.shell.clone().unwrap_or_else(default_shell);
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&options.cwd);
        for (key, value) in &options.env {
            cmd.env(key, value);
        }

        let cols = options.cols.unwrap_or(DEFAULT_COLS).max(1);
        let rows = options.rows.unwrap_or(DEFAULT_ROWS).max(1);
        let spawned = pty_backend::spawn_with_portable_pty(rows, cols, cmd)
            .map_err(|err| TerminalManagerError::SpawnFailed(err.to_string()))?;
        let pid = spawned.child.process_id().unwrap_or(0);
        let killer = spawned.child.clone_killer();

        let write_fd = pty_fd::duplicate_cloexec_fd(spawned.master_fd.as_raw_fd())
            .map_err(|err| TerminalManagerError::SpawnFailed(err.to_string()))?;
        // Safety: `duplicate_cloexec_fd` just returned a fresh, uniquely
        // owned fd via `dup`; nothing else observes it yet.
        let writer = std::fs::File::from(unsafe { OwnedFd::from_raw_fd(write_fd) });
        // The reader thread below takes exclusive ownership of the original
        // master fd for its read-side lifetime.
        let reader_fd = spawned.master_fd.into_raw_fd();
        let mut reader = std::fs::File::from(unsafe { OwnedFd::from_raw_fd(reader_fd) });

        let handle = generate_pane_handle();
        let session = Arc::new(PaneSession {
            worktree_id: options.worktree_id,
            pid,
            writer: Mutex::new(writer),
            killer: Mutex::new(killer),
            lifecycle: Mutex::new(PaneLifecycle::Running),
            output: Mutex::new(PaneOutputRing::default()),
        });

        {
            let mut sessions = self
                .sessions
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            sessions.insert(handle.clone(), Arc::clone(&session));
        }

        let mut child = spawned.child;
        let reader_session = Arc::clone(&session);
        std::thread::spawn(move || {
            let mut buf = [0u8; READ_CHUNK_SIZE];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let mut output = reader_session
                            .output
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        output.push(PaneOutputEvent::Data(buf[..n].to_vec()));
                    }
                    Err(ref err) if err.kind() == std::io::ErrorKind::Interrupted => continue,
                    // EIO means the slave side (the shell) has closed; the
                    // vendored portable-pty reader normalizes this to EOF
                    // too (vendor/portable-pty/src/unix.rs), but we read the
                    // raw duplicated fd directly here, so we repeat that
                    // normalization ourselves.
                    Err(ref err) if err.raw_os_error() == Some(libc::EIO) => break,
                    Err(_) => break,
                }
            }

            let exit_code = child.wait().ok().map(|status| status.exit_code());
            {
                let mut lifecycle = reader_session
                    .lifecycle
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                *lifecycle = PaneLifecycle::Exited(exit_code);
            }
            let mut output = reader_session
                .output
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            output.push(PaneOutputEvent::Exited { exit_code });
        });

        Ok((handle, OpenedPane { pid }))
    }

    fn lookup(&self, handle: &str) -> Result<Arc<PaneSession>, TerminalManagerError> {
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(handle)
            .cloned()
            .ok_or(TerminalManagerError::UnknownPane)
    }

    /// Writes raw bytes to the pane's PTY stdin. Binary-safe: callers (the
    /// JSON-RPC layer) base64-decode before calling this.
    pub(crate) fn write(&self, handle: &str, data: &[u8]) -> Result<(), TerminalManagerError> {
        let session = self.lookup(handle)?;
        let mut writer = session
            .writer
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        writer
            .write_all(data)
            .map_err(|err| TerminalManagerError::WriteFailed(err.to_string()))?;
        writer
            .flush()
            .map_err(|err| TerminalManagerError::WriteFailed(err.to_string()))
    }

    pub(crate) fn status(&self, handle: &str) -> Result<PaneStatusSnapshot, TerminalManagerError> {
        let session = self.lookup(handle)?;
        let lifecycle = *session
            .lifecycle
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let (alive, exit_code) = match lifecycle {
            PaneLifecycle::Running => (true, None),
            PaneLifecycle::Exited(code) => (false, code),
        };
        Ok(PaneStatusSnapshot {
            alive,
            exit_code,
            pid: session.pid,
            worktree_id: session.worktree_id.clone(),
        })
    }

    /// Current output-ring cursor for a pane, to use as the starting point
    /// for `output_events_after` (mirrors `EventHub::current_sequence`).
    pub(crate) fn current_output_sequence(&self, handle: &str) -> Result<u64, TerminalManagerError> {
        let session = self.lookup(handle)?;
        let sequence = session
            .output
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .next_sequence;
        Ok(sequence)
    }

    /// Output events (chunks and lifecycle transitions) recorded after
    /// `since`, oldest first. Returns an error for an unknown *or
    /// already-closed* handle — `close` removes the pane from the registry
    /// immediately, it does not linger for late pollers.
    pub(crate) fn output_events_after(
        &self,
        handle: &str,
        since: u64,
    ) -> Result<Vec<(u64, PaneOutputEvent)>, TerminalManagerError> {
        let session = self.lookup(handle)?;
        let events = session
            .output
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .events_after(since);
        Ok(events)
    }

    /// Closes a pane: removes it from the registry and kills the underlying
    /// process. The reader thread observes the resulting EOF, records the
    /// exit transition, and appends `PaneOutputEvent::Exited` to the output
    /// ring on its own — callers already polling at the time of `close` can
    /// still observe it via one last `output_events_after`, but the handle
    /// itself is immediately gone from every other lookup.
    pub(crate) fn close(&self, handle: &str) -> Result<(), TerminalManagerError> {
        let session = {
            let mut sessions = self
                .sessions
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            sessions
                .remove(handle)
                .ok_or(TerminalManagerError::UnknownPane)?
        };
        let mut killer = session
            .killer
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        // Best-effort: the process may have already exited on its own, in
        // which case `kill` erroring is expected and not a close failure.
        let _ = killer.kill();
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn pane_count(&self) -> usize {
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn open_shell(manager: &TerminalManager, worktree_id: &str, cwd: &str) -> PaneHandle {
        let (handle, opened) = manager
            .open(OpenPaneOptions {
                worktree_id: worktree_id.to_string(),
                cwd: cwd.to_string(),
                cols: Some(80),
                rows: Some(24),
                env: HashMap::new(),
                shell: Some("/bin/sh".to_string()),
            })
            .expect("open succeeds");
        assert!(opened.pid > 0, "spawned process has a real pid");
        handle
    }

    fn concatenated_data(events: &[(u64, PaneOutputEvent)]) -> Vec<u8> {
        events
            .iter()
            .filter_map(|(_, event)| match event {
                PaneOutputEvent::Data(bytes) => Some(bytes.as_slice()),
                PaneOutputEvent::Exited { .. } => None,
            })
            .flatten()
            .copied()
            .collect()
    }

    /// Polls `output_events_after` until `predicate` is satisfied or
    /// `timeout` elapses, returning whatever was accumulated.
    fn poll_output_until<F>(
        manager: &TerminalManager,
        handle: &str,
        timeout: Duration,
        mut predicate: F,
    ) -> Vec<(u64, PaneOutputEvent)>
    where
        F: FnMut(&[(u64, PaneOutputEvent)]) -> bool,
    {
        let deadline = std::time::Instant::now() + timeout;
        let mut cursor = 0;
        let mut collected = Vec::new();
        loop {
            let events = manager
                .output_events_after(handle, cursor)
                .expect("pane still registered while polling");
            if let Some((sequence, _)) = events.last() {
                cursor = *sequence;
            }
            collected.extend(events);
            if predicate(&collected) || std::time::Instant::now() >= deadline {
                return collected;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn open_write_read_close_round_trips() {
        let manager = TerminalManager::new();
        let handle = open_shell(&manager, "wt-1", "/tmp");

        manager
            .write(&handle, b"echo hello-from-terminal-manager\n")
            .expect("write succeeds");

        let events = poll_output_until(&manager, &handle, Duration::from_secs(5), |events| {
            String::from_utf8_lossy(&concatenated_data(events))
                .contains("hello-from-terminal-manager")
        });
        let text = String::from_utf8_lossy(&concatenated_data(&events)).into_owned();
        assert!(
            text.contains("hello-from-terminal-manager"),
            "expected echoed output, got: {text:?}"
        );

        manager.close(&handle).expect("close succeeds");
        assert_eq!(
            manager.pane_count(),
            0,
            "close removes the pane from the registry"
        );

        // A closed handle is gone, not just dead-but-queryable.
        assert_eq!(
            manager.status(&handle),
            Err(TerminalManagerError::UnknownPane)
        );
        assert_eq!(
            manager.write(&handle, b"x"),
            Err(TerminalManagerError::UnknownPane)
        );
    }

    #[test]
    fn two_worktrees_do_not_cross_talk() {
        let manager = TerminalManager::new();
        let handle_a = open_shell(&manager, "wt-a", "/tmp");
        let handle_b = open_shell(&manager, "wt-b", "/tmp");
        assert_ne!(handle_a, handle_b, "each open() gets a distinct pane handle");

        manager
            .write(&handle_a, b"echo only-in-worktree-a\n")
            .expect("write a succeeds");
        manager
            .write(&handle_b, b"echo only-in-worktree-b\n")
            .expect("write b succeeds");

        let events_a = poll_output_until(&manager, &handle_a, Duration::from_secs(5), |events| {
            String::from_utf8_lossy(&concatenated_data(events)).contains("only-in-worktree-a")
        });
        let events_b = poll_output_until(&manager, &handle_b, Duration::from_secs(5), |events| {
            String::from_utf8_lossy(&concatenated_data(events)).contains("only-in-worktree-b")
        });

        let text_a = String::from_utf8_lossy(&concatenated_data(&events_a)).into_owned();
        let text_b = String::from_utf8_lossy(&concatenated_data(&events_b)).into_owned();

        assert!(text_a.contains("only-in-worktree-a"), "got: {text_a:?}");
        assert!(
            !text_a.contains("only-in-worktree-b"),
            "worktree a's stream must never see worktree b's output, got: {text_a:?}"
        );
        assert!(text_b.contains("only-in-worktree-b"), "got: {text_b:?}");
        assert!(
            !text_b.contains("only-in-worktree-a"),
            "worktree b's stream must never see worktree a's output, got: {text_b:?}"
        );

        let status_a = manager.status(&handle_a).expect("status a");
        let status_b = manager.status(&handle_b).expect("status b");
        assert_eq!(status_a.worktree_id, "wt-a");
        assert_eq!(status_b.worktree_id, "wt-b");

        manager.close(&handle_a).expect("close a");
        manager.close(&handle_b).expect("close b");
    }

    #[test]
    fn status_reports_alive_then_exit_code() {
        let manager = TerminalManager::new();
        let handle = open_shell(&manager, "wt-exit", "/tmp");

        let status = manager.status(&handle).expect("status succeeds");
        assert!(status.alive, "freshly opened pane reports alive");
        assert_eq!(status.exit_code, None);

        manager.write(&handle, b"exit 7\n").expect("write succeeds");

        let events = poll_output_until(&manager, &handle, Duration::from_secs(5), |events| {
            events
                .iter()
                .any(|(_, event)| matches!(event, PaneOutputEvent::Exited { .. }))
        });
        let exit_event = events
            .iter()
            .find_map(|(_, event)| match event {
                PaneOutputEvent::Exited { exit_code } => Some(*exit_code),
                PaneOutputEvent::Data(_) => None,
            })
            .expect("expected an Exited output event");
        assert_eq!(exit_event, Some(7));

        // Poll status until the reader thread has recorded the exit — there
        // is no ordering guarantee between the ring push above and the
        // lifecycle write in the reader thread, both happen after wait().
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let mut final_status = manager.status(&handle).expect("status succeeds");
        while final_status.alive && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
            final_status = manager.status(&handle).expect("status succeeds");
        }
        assert!(!final_status.alive, "pane reports not alive after exit");
        assert_eq!(final_status.exit_code, Some(7));

        manager.close(&handle).expect("close succeeds");
    }

    #[test]
    fn unknown_pane_handle_errors_everywhere() {
        let manager = TerminalManager::new();
        assert_eq!(
            manager.status("tm_does_not_exist"),
            Err(TerminalManagerError::UnknownPane)
        );
        assert_eq!(
            manager.write("tm_does_not_exist", b"x"),
            Err(TerminalManagerError::UnknownPane)
        );
        assert_eq!(
            manager.close("tm_does_not_exist"),
            Err(TerminalManagerError::UnknownPane)
        );
        assert_eq!(
            manager.current_output_sequence("tm_does_not_exist"),
            Err(TerminalManagerError::UnknownPane)
        );
        assert_eq!(
            manager.output_events_after("tm_does_not_exist", 0),
            Err(TerminalManagerError::UnknownPane)
        );
    }

    #[test]
    fn global_registry_is_a_shared_singleton() {
        assert!(std::ptr::eq(global(), global()));
    }
}
