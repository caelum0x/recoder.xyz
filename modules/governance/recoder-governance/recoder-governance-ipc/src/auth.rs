//! Connection authentication: peer-cred + `INTERNAL_SERVICE_KEY`.
//!
//! The governance daemon binds a Unix-domain socket on the local host. Two
//! independent gates protect it, applied in order (fail-closed at each):
//!
//! 1. **Peer credentials** — every accepted connection carries the peer's
//!    OS-level uid/gid/pid (via `SO_PEERCRED` / `LOCAL_PEERCRED`). The
//!    [`PeerPolicy`] can pin the allowed uid (default: the server's own uid, so
//!    only same-user processes connect). A process running as a different user
//!    is refused before a single byte is read.
//! 2. **Shared key** — the first action over the connection must present the
//!    `INTERNAL_SERVICE_KEY` (the same secret the Node side sends). The
//!    comparison is constant-time to avoid a timing oracle. When the key is not
//!    configured the daemon refuses to start in [`AuthConfig::require_key`] mode;
//!    an empty key never silently disables the gate.
//!
//! The peer-cred check is OS-enforced and cannot be spoofed by the wire; the key
//! check defends against a same-user but unauthorized process.

use serde::Deserialize;
use tokio::net::unix::UCred;

/// The shared-key field name carried in an authenticating payload, and the env
/// var the key is read from.
pub const SERVICE_KEY_ENV: &str = "INTERNAL_SERVICE_KEY";

/// Policy for accepting a peer based on its OS credentials.
#[derive(Debug, Clone)]
pub struct PeerPolicy {
    /// If set, only connections from this uid are accepted. `None` accepts any
    /// uid (still gated by the shared key) — used only in tests/loopback.
    pub allowed_uid: Option<u32>,
}

impl PeerPolicy {
    /// Pin acceptance to a single uid (the server's own, in production).
    #[must_use]
    pub fn same_uid(uid: u32) -> Self {
        Self {
            allowed_uid: Some(uid),
        }
    }

    /// Accept any peer uid. The shared key remains the active gate. Intended for
    /// loopback tests where the connecting uid equals the server uid anyway.
    #[must_use]
    pub fn any_uid() -> Self {
        Self { allowed_uid: None }
    }

    /// Decide whether a peer with the given credentials may connect.
    #[must_use]
    pub fn permits(&self, cred: &UCred) -> bool {
        match self.allowed_uid {
            Some(uid) => cred.uid() == uid,
            None => true,
        }
    }
}

/// The shared-key gate configuration.
#[derive(Debug, Clone)]
pub struct AuthConfig {
    /// The expected `INTERNAL_SERVICE_KEY`. When `None`, the key gate is disabled
    /// (loopback tests only); production builds load it from the environment and
    /// refuse to start if absent (see [`AuthConfig::from_env`]).
    expected_key: Option<String>,
    /// The peer-credential policy.
    pub peer_policy: PeerPolicy,
}

impl AuthConfig {
    /// Build a config with an explicit key and peer policy.
    #[must_use]
    pub fn new(expected_key: Option<String>, peer_policy: PeerPolicy) -> Self {
        Self {
            expected_key,
            peer_policy,
        }
    }

    /// Load the key from `INTERNAL_SERVICE_KEY`, pinning the peer uid to the
    /// current process uid. Fails closed: an unset or blank key is an error,
    /// never a silently-open gate.
    pub fn from_env(self_uid: u32) -> Result<Self, AuthError> {
        let key = std::env::var(SERVICE_KEY_ENV).map_err(|_| AuthError::KeyNotConfigured)?;
        if key.trim().is_empty() {
            return Err(AuthError::KeyNotConfigured);
        }
        Ok(Self {
            expected_key: Some(key),
            peer_policy: PeerPolicy::same_uid(self_uid),
        })
    }

    /// A keyless config for loopback tests. NEVER use in production.
    #[must_use]
    pub fn insecure_for_tests() -> Self {
        Self {
            expected_key: None,
            peer_policy: PeerPolicy::any_uid(),
        }
    }

    /// Whether the shared-key gate is active.
    #[must_use]
    pub fn key_required(&self) -> bool {
        self.expected_key.is_some()
    }

    /// Verify a presented key against the expected one (constant-time). When no
    /// key is configured this is a no-op `Ok`.
    pub fn check_key(&self, presented: Option<&str>) -> Result<(), AuthError> {
        let Some(expected) = self.expected_key.as_deref() else {
            return Ok(());
        };
        let presented = presented.ok_or(AuthError::KeyMissing)?;
        if constant_time_eq(expected.as_bytes(), presented.as_bytes()) {
            Ok(())
        } else {
            Err(AuthError::KeyRejected)
        }
    }

    /// Verify a peer's OS credentials against the policy.
    pub fn check_peer(&self, cred: &UCred) -> Result<(), AuthError> {
        if self.peer_policy.permits(cred) {
            Ok(())
        } else {
            Err(AuthError::PeerRejected { uid: cred.uid() })
        }
    }
}

/// An authentication failure. Messages are intentionally terse so they never
/// leak the expected key or internal layout.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AuthError {
    /// `INTERNAL_SERVICE_KEY` was unset or blank at startup.
    #[error("INTERNAL_SERVICE_KEY is not configured")]
    KeyNotConfigured,
    /// The connection presented no key but one is required.
    #[error("authentication key required")]
    KeyMissing,
    /// The presented key did not match.
    #[error("authentication rejected")]
    KeyRejected,
    /// The peer's uid is not permitted by policy.
    #[error("peer uid {uid} not permitted")]
    PeerRejected {
        /// The rejected peer uid.
        uid: u32,
    },
}

/// The key field carried in an authenticating payload. Methods that require auth
/// expect this alongside their arguments; the dispatcher strips it before
/// decoding the method args.
#[derive(Debug, Clone, Deserialize)]
pub struct AuthField {
    /// The presented `INTERNAL_SERVICE_KEY`, if any.
    #[serde(default)]
    pub key: Option<String>,
}

/// Constant-time byte comparison. Always scans the longer of the two inputs so
/// the running time does not reveal where a mismatch occurred or the lengths.
#[must_use]
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    let mut diff = (a.len() ^ b.len()) as u8;
    let n = a.len().max(b.len());
    for i in 0..n {
        let av = a.get(i).copied().unwrap_or(0);
        let bv = b.get(i).copied().unwrap_or(0);
        diff |= av ^ bv;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constant_time_eq_matches_only_equal_slices() {
        assert!(constant_time_eq(b"secret", b"secret"));
        assert!(!constant_time_eq(b"secret", b"secres"));
        assert!(!constant_time_eq(b"secret", b"secret-longer"));
        assert!(!constant_time_eq(b"", b"x"));
        assert!(constant_time_eq(b"", b""));
    }

    #[test]
    fn check_key_noop_when_unconfigured() {
        let cfg = AuthConfig::new(None, PeerPolicy::any_uid());
        assert!(cfg.check_key(None).is_ok());
        assert!(cfg.check_key(Some("anything")).is_ok());
        assert!(!cfg.key_required());
    }

    #[test]
    fn check_key_enforces_match_when_configured() {
        let cfg = AuthConfig::new(Some("topsecret".to_string()), PeerPolicy::any_uid());
        assert!(cfg.key_required());
        assert_eq!(cfg.check_key(None).unwrap_err(), AuthError::KeyMissing);
        assert_eq!(
            cfg.check_key(Some("wrong")).unwrap_err(),
            AuthError::KeyRejected
        );
        assert!(cfg.check_key(Some("topsecret")).is_ok());
    }

    #[test]
    fn peer_policy_pins_uid() {
        let policy = PeerPolicy::same_uid(501);
        // We can't fabricate a UCred portably, so test the uid logic directly.
        assert_eq!(policy.allowed_uid, Some(501));
        assert_eq!(PeerPolicy::any_uid().allowed_uid, None);
    }

    #[test]
    fn from_env_fails_closed_without_key() {
        // Save/restore so the test is hermetic.
        let prev = std::env::var(SERVICE_KEY_ENV).ok();
        std::env::remove_var(SERVICE_KEY_ENV);
        assert_eq!(
            AuthConfig::from_env(0).unwrap_err(),
            AuthError::KeyNotConfigured
        );
        std::env::set_var(SERVICE_KEY_ENV, "   ");
        assert_eq!(
            AuthConfig::from_env(0).unwrap_err(),
            AuthError::KeyNotConfigured
        );
        std::env::set_var(SERVICE_KEY_ENV, "real-key");
        let cfg = AuthConfig::from_env(501).unwrap();
        assert!(cfg.key_required());
        assert_eq!(cfg.peer_policy.allowed_uid, Some(501));
        // Restore.
        match prev {
            Some(v) => std::env::set_var(SERVICE_KEY_ENV, v),
            None => std::env::remove_var(SERVICE_KEY_ENV),
        }
    }
}
