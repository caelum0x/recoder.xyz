//! `recoder-governance-daemon` — the governance IPC daemon.
//!
//! Boots a [`GovernanceKernel`] and serves the typed IPC
//! ([`recoder_governance_ipc`]) over a Unix-domain socket. The socket path comes
//! from `$GOVERNANCE_SOCKET` (default `/tmp/recoder-governance.sock`).
//!
//! ## Auth posture
//!
//! - **Peer credentials**: pinned to the daemon's own uid — only same-user
//!   processes may connect.
//! - **Shared key**: `INTERNAL_SERVICE_KEY` is required. The daemon **refuses to
//!   start** if it is unset/blank (fail-closed) — it never serves an open gate.
//!   Set `GOVERNANCE_ALLOW_INSECURE=1` *only* for local development to bypass the
//!   key (peer-cred still applies); this is loud and never the default.
//!
//! ## Shutdown
//!
//! A graceful SIGTERM (and Ctrl-C/SIGINT) handler resolves the server's shutdown
//! future, which stops the accept loop and unlinks the socket file so a restart
//! binds cleanly.

use recoder_governance_ipc::{AuthConfig, IpcServer, PeerPolicy};
use recoder_governance_kernel::{GovernanceKernel, GovernanceKernelConfig};
use std::sync::Arc;

/// Default socket path when `$GOVERNANCE_SOCKET` is unset.
const DEFAULT_SOCKET: &str = "/tmp/recoder-governance.sock";

#[tokio::main]
async fn main() -> std::process::ExitCode {
    match run().await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("recoder-governance-daemon: fatal: {e}");
            std::process::ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), String> {
    let socket_path =
        std::env::var("GOVERNANCE_SOCKET").unwrap_or_else(|_| DEFAULT_SOCKET.to_string());

    // Build the kernel from the default (deny-biased) config. A future revision
    // can load a config document; the default is already safe.
    let kernel = GovernanceKernel::new(GovernanceKernelConfig::default())
        .map_err(|e| format!("failed to construct governance kernel: {e}"))?;

    let auth = build_auth()?;

    let server = IpcServer::bind(&socket_path, Arc::new(kernel), auth, None)
        .map_err(|e| format!("failed to bind {socket_path}: {e}"))?;

    eprintln!(
        "recoder-governance-daemon: listening on {} (uid-pinned, key {})",
        server.socket_path().display(),
        if std::env::var("GOVERNANCE_ALLOW_INSECURE").is_ok() {
            "DISABLED (insecure dev mode)"
        } else {
            "required"
        }
    );

    server.serve_until(shutdown_signal()).await;
    eprintln!("recoder-governance-daemon: shut down cleanly");
    Ok(())
}

/// Build the auth config: peer-cred pinned to our uid + the required shared key.
/// Fail-closed unless `GOVERNANCE_ALLOW_INSECURE` is explicitly set.
fn build_auth() -> Result<AuthConfig, String> {
    let self_uid = current_uid();

    if std::env::var("GOVERNANCE_ALLOW_INSECURE").is_ok() {
        // Dev-only: peer-cred still pins the uid; the shared key is disabled.
        return Ok(AuthConfig::new(None, PeerPolicy::same_uid(self_uid)));
    }

    AuthConfig::from_env(self_uid).map_err(|e| {
        format!("{e}. Set INTERNAL_SERVICE_KEY, or GOVERNANCE_ALLOW_INSECURE=1 for local dev only.")
    })
}

/// The current process's real uid, read from `geteuid(2)` via a tiny inline
/// `libc` call. Kept here (rather than pulling the `libc` crate) so the daemon
/// adds no extra dependency for a single syscall.
fn current_uid() -> u32 {
    // SAFETY: `geteuid` takes no arguments, never fails, and returns the
    // effective uid as a plain integer — there is no pointer or memory
    // invariant to uphold.
    unsafe { geteuid() }
}

extern "C" {
    fn geteuid() -> u32;
}

/// Resolve when a graceful shutdown signal arrives (SIGTERM or Ctrl-C/SIGINT).
async fn shutdown_signal() {
    use tokio::signal::unix::{signal, SignalKind};

    // SIGTERM is the primary path (systemd/pm2/docker stop).
    let mut sigterm = match signal(SignalKind::terminate()) {
        Ok(s) => s,
        Err(_) => {
            // If we cannot install SIGTERM, fall back to Ctrl-C only.
            let _ = tokio::signal::ctrl_c().await;
            return;
        }
    };

    tokio::select! {
        _ = sigterm.recv() => {}
        _ = tokio::signal::ctrl_c() => {}
    }
}
