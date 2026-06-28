//! `recoder-governance-ipc` — the hostile-by-default typed IPC surface of the
//! Recoder governance kernel.
//!
//! A tokio Unix-domain-socket server speaking **length-prefixed JSON-line
//! frames** (a real typed IPC — *not* a free-form socket): a 4-byte big-endian
//! length prefix followed by a single JSON [`envelope::IpcEnvelope`]. The Node
//! side mirrors this with `node:net` + `JSON`; there is deliberately **no CBOR
//! or heavy framing dependency** on either side.
//!
//! ## Trust model (never trust the wire)
//!
//! Every layer is fail-closed:
//!
//! 1. [`transport`] — bounds each frame to [`transport::MAX_FRAME_LEN`] and
//!    rejects an oversized declared length *before* allocating.
//! 2. [`auth`] — peer-credential gate (`SO_PEERCRED`) + a constant-time
//!    `INTERNAL_SERVICE_KEY` check.
//! 3. [`envelope`] — structural validation + optional ed25519-style signature
//!    verification (rejects unsigned messages once a verifier is configured).
//! 4. [`method`] — a *closed* [`method::IpcMethod`] set; an unknown method name
//!    fails to deserialize and is turned into an error response.
//! 5. [`dispatch`] — decodes each payload against its specific argument type and
//!    re-validates inbound governance requests before the kernel sees them.
//!
//! A consumer that receives an error response — or no response — must **deny**.
//!
//! ## Modules
//!
//! - [`transport`] — frame read/write.
//! - [`envelope`] — the [`envelope::IpcEnvelope`] + signature contract.
//! - [`method`] — the [`method::IpcMethod`] enum.
//! - [`auth`] — peer-cred + shared-key gates.
//! - [`dispatch`] — envelope -> [`dispatch::IpcGovernance`] -> response.
//! - [`server`] — the [`server::IpcServer`] accept loop.

pub mod auth;
pub mod dispatch;
pub mod envelope;
pub mod method;
pub mod server;
pub mod transport;

pub use auth::{AuthConfig, AuthError, PeerPolicy, SERVICE_KEY_ENV};
pub use dispatch::{dispatch, IpcGovernance, IpcResponse};
pub use envelope::{EnvelopeError, IpcEnvelope, SignatureVerifier};
pub use method::IpcMethod;
pub use server::IpcServer;
pub use transport::{read_frame, write_frame, TransportError, MAX_FRAME_LEN};
