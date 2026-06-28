//! [`IpcServer`] — the tokio Unix-domain-socket accept loop.
//!
//! The server owns the socket bind, the per-connection peer-cred gate, and the
//! per-message read -> dispatch -> write loop. The governance backend is shared
//! across connections behind an `Arc`. Each accepted connection is handled on its
//! own task so a blocking approval gate on one connection never stalls others.
//!
//! ## Lifecycle
//!
//! - [`IpcServer::bind`] removes any stale socket file and binds a fresh
//!   [`UnixListener`].
//! - [`IpcServer::serve_until`] runs the accept loop until the supplied shutdown
//!   future resolves (the daemon wires this to SIGTERM), then returns so the
//!   caller can clean up the socket file.
//!
//! ## Hostile-by-default
//!
//! - Peer credentials are checked *before* the first byte is read; a disallowed
//!   uid is dropped immediately.
//! - Every frame is bounded by [`crate::transport::MAX_FRAME_LEN`]; an oversized
//!   declared length drops the connection.
//! - A malformed envelope, unknown method, or failed auth produces an error
//!   response and the connection continues (so one bad message does not deny the
//!   peer its next, valid one) — except a transport-level fault, which drops the
//!   connection.

use crate::auth::AuthConfig;
use crate::dispatch::{dispatch, IpcGovernance, IpcResponse};
use crate::envelope::{IpcEnvelope, SignatureVerifier};
use crate::transport::{read_frame, write_frame, TransportError};
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::net::{UnixListener, UnixStream};

/// The IPC server.
pub struct IpcServer<G: IpcGovernance + 'static> {
    listener: UnixListener,
    socket_path: PathBuf,
    gov: Arc<G>,
    auth: Arc<AuthConfig>,
    verifier: Option<Arc<dyn SignatureVerifier>>,
}

impl<G: IpcGovernance + 'static> IpcServer<G> {
    /// Bind a fresh socket at `socket_path`, removing any stale file first.
    ///
    /// Fail-closed on bind: if the path is occupied by a live listener the bind
    /// errors out rather than silently sharing the socket.
    pub fn bind(
        socket_path: impl AsRef<Path>,
        gov: Arc<G>,
        auth: AuthConfig,
        verifier: Option<Arc<dyn SignatureVerifier>>,
    ) -> std::io::Result<Self> {
        let socket_path = socket_path.as_ref().to_path_buf();
        // Remove a stale socket file from a previous run. Only unlink an existing
        // *socket* — never clobber an unrelated file.
        if let Ok(meta) = std::fs::metadata(&socket_path) {
            use std::os::unix::fs::FileTypeExt;
            if meta.file_type().is_socket() {
                let _ = std::fs::remove_file(&socket_path);
            }
        }
        let listener = UnixListener::bind(&socket_path)?;
        Ok(Self {
            listener,
            socket_path,
            gov,
            auth: Arc::new(auth),
            verifier,
        })
    }

    /// The bound socket path.
    #[must_use]
    pub fn socket_path(&self) -> &Path {
        &self.socket_path
    }

    /// Run the accept loop until `shutdown` resolves. On return, the socket file
    /// is removed so a restart binds cleanly.
    pub async fn serve_until<F>(self, shutdown: F)
    where
        F: Future<Output = ()>,
    {
        tokio::pin!(shutdown);
        loop {
            tokio::select! {
                _ = &mut shutdown => {
                    break;
                }
                accepted = self.listener.accept() => {
                    match accepted {
                        Ok((stream, _addr)) => {
                            let gov = Arc::clone(&self.gov);
                            let auth = Arc::clone(&self.auth);
                            let verifier = self.verifier.clone();
                            tokio::spawn(async move {
                                handle_connection(stream, gov, auth, verifier).await;
                            });
                        }
                        Err(_e) => {
                            // Transient accept error: yield and continue. Never
                            // tear down the whole server on a single bad accept.
                            tokio::task::yield_now().await;
                        }
                    }
                }
            }
        }
        // Best-effort socket cleanup so a restart binds cleanly.
        let _ = std::fs::remove_file(&self.socket_path);
    }
}

/// Handle one connection: peer-cred gate, then a read -> dispatch -> write loop.
async fn handle_connection<G: IpcGovernance + 'static>(
    mut stream: UnixStream,
    gov: Arc<G>,
    auth: Arc<AuthConfig>,
    verifier: Option<Arc<dyn SignatureVerifier>>,
) {
    // Peer-credential gate BEFORE reading any byte. A disallowed uid is dropped.
    match stream.peer_cred() {
        Ok(cred) => {
            if auth.check_peer(&cred).is_err() {
                return;
            }
        }
        Err(_) => {
            // Cannot determine the peer's credentials -> fail closed, drop.
            return;
        }
    }

    let verifier_ref: Option<&dyn SignatureVerifier> = verifier.as_deref();

    loop {
        let payload = match read_frame(&mut stream).await {
            Ok(p) => p,
            Err(TransportError::Closed) => return,
            Err(_) => {
                // Oversized / truncated / io fault: drop the connection.
                return;
            }
        };

        let response = match serde_json::from_slice::<IpcEnvelope>(&payload) {
            Ok(envelope) => dispatch(gov.as_ref(), auth.as_ref(), verifier_ref, &envelope),
            Err(e) => {
                // Unparseable or unknown-method envelope: a hostile/buggy peer.
                // Reply with an error (id unknown), then continue.
                IpcResponse::err("unknown", format!("bad_request: {e}"))
            }
        };

        let bytes = match serde_json::to_vec(&response) {
            Ok(b) => b,
            Err(_) => return,
        };
        if write_frame(&mut stream, &bytes).await.is_err() {
            return;
        }
    }
}
