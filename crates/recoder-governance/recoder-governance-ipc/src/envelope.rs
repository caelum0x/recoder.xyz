//! [`IpcEnvelope`] — the signed-or-unsigned outer wrapper of every request.
//!
//! Every inbound message is an envelope:
//!
//! ```json
//! { "id": "...", "method": "decide", "payload": { ... }, "ts": 0, "sig": "..." }
//! ```
//!
//! - `id` — opaque correlation id chosen by the caller; echoed in the response.
//! - `method` — the [`IpcMethod`] (a *closed* set; unknown -> deserialize error).
//! - `payload` — the method-specific arguments, kept as a raw
//!   [`serde_json::Value`] so the dispatcher decodes it against the *specific*
//!   method's argument type (and rejects a mismatched shape).
//! - `ts` — caller-supplied unix-millis timestamp (used for audit + replay
//!   windowing; never trusted as a clock).
//! - `sig` — optional base16 (hex) detached signature over the canonical
//!   preimage. Only consulted when a [`SignatureVerifier`] is configured.
//!
//! ## Signature verification (optional, fail-closed when configured)
//!
//! When the server is built **without** a verifier, `sig` is ignored — auth is
//! carried entirely by the UDS peer-cred + `INTERNAL_SERVICE_KEY` check (see
//! [`crate::auth`]). When a verifier **is** configured, a missing or invalid
//! signature is rejected: the message is dropped with an error response and is
//! never dispatched. This is the hostile-by-default posture — we never trust an
//! unsigned message once signing is turned on.
//!
//! The crate defines the verification *contract* (the [`SignatureVerifier`]
//! trait + the canonical [`IpcEnvelope::signing_preimage`]) so the core stays
//! dependency-light; a concrete ed25519 verifier lives behind the optional
//! `ed25519` feature.

use crate::method::IpcMethod;
use serde::{Deserialize, Serialize};

/// Maximum accepted envelope `id` length. An over-long id is a sign of an
/// untrusted/oversized payload and is rejected (fail-closed).
pub const MAX_ID_LEN: usize = 256;

/// The outer message wrapper. Generic over nothing — the payload is held as an
/// opaque [`serde_json::Value`] so the dispatcher decodes it per-method.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IpcEnvelope {
    /// Caller-chosen correlation id, echoed in the response.
    pub id: String,
    /// The requested method (closed set; unknown methods fail to deserialize).
    pub method: IpcMethod,
    /// Method-specific arguments, decoded per-method by the dispatcher.
    #[serde(default)]
    pub payload: serde_json::Value,
    /// Caller-supplied unix-millis timestamp.
    #[serde(default)]
    pub ts: i64,
    /// Optional hex-encoded detached signature over [`Self::signing_preimage`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sig: Option<String>,
}

impl IpcEnvelope {
    /// Build an unsigned envelope.
    #[must_use]
    pub fn new(id: impl Into<String>, method: IpcMethod, payload: serde_json::Value) -> Self {
        Self {
            id: id.into(),
            method,
            payload,
            ts: 0,
            sig: None,
        }
    }

    /// Structural validation at the trust boundary. Checked *before* any
    /// dispatch — bounds the id and rejects a blank one. Fails fast.
    pub fn validate(&self) -> Result<(), EnvelopeError> {
        if self.id.trim().is_empty() {
            return Err(EnvelopeError::InvalidEnvelope(
                "envelope id must not be empty".to_string(),
            ));
        }
        if self.id.len() > MAX_ID_LEN {
            return Err(EnvelopeError::InvalidEnvelope(format!(
                "envelope id exceeds {MAX_ID_LEN} bytes"
            )));
        }
        Ok(())
    }

    /// The canonical, deterministic byte preimage a signature covers. It binds
    /// the id, method, timestamp, and the *exact* payload bytes together so a
    /// signature cannot be replayed across a different method or mutated payload.
    ///
    /// Format: `id\n` + `method\n` + `ts\n` + `<compact-json-payload>`. Using the
    /// compact serialization makes the preimage reproducible on both sides
    /// without a canonicalization library.
    #[must_use]
    pub fn signing_preimage(&self) -> Vec<u8> {
        let payload = serde_json::to_string(&self.payload).unwrap_or_else(|_| "null".to_string());
        let mut buf = Vec::new();
        buf.extend_from_slice(self.id.as_bytes());
        buf.push(b'\n');
        buf.extend_from_slice(self.method.as_str().as_bytes());
        buf.push(b'\n');
        buf.extend_from_slice(self.ts.to_string().as_bytes());
        buf.push(b'\n');
        buf.extend_from_slice(payload.as_bytes());
        buf
    }

    /// Verify the envelope's signature against the supplied verifier.
    ///
    /// Fail-closed: a configured verifier with a missing signature is rejected.
    /// When `verifier` is `None`, signing is disabled and this is a no-op `Ok`.
    pub fn verify_signature(
        &self,
        verifier: Option<&dyn SignatureVerifier>,
    ) -> Result<(), EnvelopeError> {
        let Some(verifier) = verifier else {
            return Ok(());
        };
        let Some(sig_hex) = self.sig.as_deref() else {
            return Err(EnvelopeError::MissingSignature);
        };
        let sig_bytes = decode_hex(sig_hex).ok_or(EnvelopeError::MalformedSignature)?;
        if verifier.verify(&self.signing_preimage(), &sig_bytes) {
            Ok(())
        } else {
            Err(EnvelopeError::SignatureRejected)
        }
    }
}

/// A pluggable detached-signature verifier. Implementors decide the scheme
/// (ed25519, HMAC, etc.); the IPC crate only owns the canonical preimage. This
/// keeps the core free of a mandatory crypto dependency.
pub trait SignatureVerifier: Send + Sync {
    /// Verify that `sig` is a valid signature over `preimage`. Must return
    /// `false` (never panic) on any malformed input.
    fn verify(&self, preimage: &[u8], sig: &[u8]) -> bool;
}

/// An envelope-layer error.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum EnvelopeError {
    /// The envelope failed structural validation.
    #[error("invalid envelope: {0}")]
    InvalidEnvelope(String),
    /// A verifier is configured but the envelope carried no signature.
    #[error("signature required but absent")]
    MissingSignature,
    /// The signature field was not valid hex.
    #[error("signature is not valid hex")]
    MalformedSignature,
    /// The signature did not verify against the preimage.
    #[error("signature verification failed")]
    SignatureRejected,
}

/// Decode a lowercase/uppercase hex string into bytes. Returns `None` on any
/// odd length or non-hex digit (we never trust the wire). Kept local so the
/// crate does not pull in the `hex` crate for a single decode.
fn decode_hex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let hi = hex_val(bytes[i])?;
        let lo = hex_val(bytes[i + 1])?;
        out.push((hi << 4) | lo);
        i += 2;
    }
    Some(out)
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A trivial verifier for tests: accepts iff the signature equals the
    /// preimage bytes (a stand-in for a real keyed scheme). This lets the
    /// envelope's fail-closed logic be tested without a crypto dependency.
    struct EchoVerifier;
    impl SignatureVerifier for EchoVerifier {
        fn verify(&self, preimage: &[u8], sig: &[u8]) -> bool {
            preimage == sig
        }
    }

    fn env() -> IpcEnvelope {
        IpcEnvelope::new("req-1", IpcMethod::Decide, serde_json::json!({"x": 1}))
    }

    #[test]
    fn unsigned_passes_when_no_verifier_configured() {
        assert!(env().verify_signature(None).is_ok());
    }

    #[test]
    fn missing_signature_is_rejected_when_verifier_configured() {
        let err = env().verify_signature(Some(&EchoVerifier)).unwrap_err();
        assert_eq!(err, EnvelopeError::MissingSignature);
    }

    #[test]
    fn valid_signature_passes() {
        let mut e = env();
        // Echo verifier: the "signature" is the hex of the preimage.
        let preimage = e.signing_preimage();
        e.sig = Some(to_hex(&preimage));
        assert!(e.verify_signature(Some(&EchoVerifier)).is_ok());
    }

    #[test]
    fn tampered_payload_breaks_signature() {
        let mut e = env();
        let preimage = e.signing_preimage();
        e.sig = Some(to_hex(&preimage));
        // Mutate the payload AFTER signing -> preimage changes -> reject.
        e.payload = serde_json::json!({"x": 2});
        assert_eq!(
            e.verify_signature(Some(&EchoVerifier)).unwrap_err(),
            EnvelopeError::SignatureRejected
        );
    }

    #[test]
    fn malformed_hex_signature_is_rejected() {
        let mut e = env();
        e.sig = Some("zz".to_string());
        assert_eq!(
            e.verify_signature(Some(&EchoVerifier)).unwrap_err(),
            EnvelopeError::MalformedSignature
        );
    }

    #[test]
    fn validate_rejects_blank_and_oversized_id() {
        let mut e = env();
        e.id = "   ".to_string();
        assert!(e.validate().is_err());

        let mut e = env();
        e.id = "x".repeat(MAX_ID_LEN + 1);
        assert!(e.validate().is_err());
    }

    #[test]
    fn round_trips_through_json() {
        let e = env();
        let json = serde_json::to_string(&e).unwrap();
        let back: IpcEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(e, back);
        // An unknown method in the wire string must fail to parse.
        let bad = json.replace("\"decide\"", "\"drop_db\"");
        assert!(serde_json::from_str::<IpcEnvelope>(&bad).is_err());
    }

    #[test]
    fn hex_decode_rejects_odd_and_nonhex() {
        assert!(decode_hex("abc").is_none());
        assert!(decode_hex("zz").is_none());
        assert_eq!(decode_hex("ff00").unwrap(), vec![0xff, 0x00]);
    }

    fn to_hex(bytes: &[u8]) -> String {
        let mut s = String::with_capacity(bytes.len() * 2);
        for b in bytes {
            s.push_str(&format!("{b:02x}"));
        }
        s
    }
}
