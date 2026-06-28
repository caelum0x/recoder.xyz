//! SHA-256 hashing for audit-chain entries.
//!
//! The pre-image construction here is the single source of truth for the chain's
//! cryptographic content and is the load-bearing interop point with the TS
//! verifier (`packages/governance/src/audit/merkle-verifier.ts`). Changing the
//! field order, the separator, or the rendering of any field is a chain-breaking
//! change that must be mirrored on the TS side.

use recoder_governance_types::{AuditAction, AuditOutcome};
use sha2::{Digest, Sha256};

/// The genesis sentinel: 64 ASCII `'0'` characters used as the `prev_hash` of the
/// first entry. Matches TS `GENESIS_PREV_HASH = '0'.repeat(64)`.
pub const GENESIS_PREV_HASH: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

/// The single-space field separator used to join the pre-image fields.
///
/// This matches the shipped TS verifier's `FIELD_SEP = ' '`. The fields that can
/// carry arbitrary text (`timestamp`, `actor`, `detail`) are expected to be
/// sanitized upstream; the enumerated `action`/`outcome` strings never contain a
/// space, and `seq` is a decimal integer, so the boundaries stay unambiguous for
/// well-formed input.
const FIELD_SEP: char = ' ';

/// Returns the genesis sentinel as an owned `String`.
#[inline]
pub fn genesis_prev_hash() -> String {
    GENESIS_PREV_HASH.to_string()
}

/// Computes the canonical SHA-256 hash (lowercase hex) for one audit entry from
/// its raw fields and the previous link.
///
/// Pure and deterministic: identical inputs always yield an identical digest, on
/// either side of the IPC boundary.
///
/// The pre-image is:
/// `seq " " timestamp " " actor " " action " " detail " " outcome " " prev_hash`.
pub fn compute_entry_hash(
    seq: u64,
    timestamp: &str,
    actor: &str,
    action: AuditAction,
    detail: &str,
    outcome: AuditOutcome,
    prev_hash: &str,
) -> String {
    let mut hasher = Sha256::new();

    // seq (decimal) " " timestamp " " actor " " action " " detail " " outcome " " prev_hash
    hasher.update(seq.to_string().as_bytes());
    push_sep(&mut hasher);
    hasher.update(timestamp.as_bytes());
    push_sep(&mut hasher);
    hasher.update(actor.as_bytes());
    push_sep(&mut hasher);
    hasher.update(action.as_str().as_bytes());
    push_sep(&mut hasher);
    hasher.update(detail.as_bytes());
    push_sep(&mut hasher);
    hasher.update(outcome.as_str().as_bytes());
    push_sep(&mut hasher);
    hasher.update(prev_hash.as_bytes());

    hex::encode(hasher.finalize())
}

#[inline]
fn push_sep(hasher: &mut Sha256) {
    let mut buf = [0u8; 4];
    hasher.update(FIELD_SEP.encode_utf8(&mut buf).as_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn genesis_is_64_zeros() {
        assert_eq!(GENESIS_PREV_HASH.len(), 64);
        assert!(GENESIS_PREV_HASH.chars().all(|c| c == '0'));
        assert_eq!(genesis_prev_hash(), GENESIS_PREV_HASH);
    }

    #[test]
    fn hash_is_deterministic() {
        let a = compute_entry_hash(
            0,
            "2026-06-28T00:00:00Z",
            "agent-1",
            AuditAction::ToolInvoked,
            "read_file /tmp/a",
            AuditOutcome::Allow,
            GENESIS_PREV_HASH,
        );
        let b = compute_entry_hash(
            0,
            "2026-06-28T00:00:00Z",
            "agent-1",
            AuditAction::ToolInvoked,
            "read_file /tmp/a",
            AuditOutcome::Allow,
            GENESIS_PREV_HASH,
        );
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn changing_any_field_changes_hash() {
        let base = compute_entry_hash(
            1,
            "2026-06-28T00:00:00Z",
            "agent-1",
            AuditAction::ToolInvoked,
            "ls",
            AuditOutcome::Allow,
            "prev",
        );
        // Every field, mutated one at a time, must perturb the digest.
        assert_ne!(
            base,
            compute_entry_hash(
                2,
                "2026-06-28T00:00:00Z",
                "agent-1",
                AuditAction::ToolInvoked,
                "ls",
                AuditOutcome::Allow,
                "prev",
            )
        );
        assert_ne!(
            base,
            compute_entry_hash(
                1,
                "2026-06-28T00:00:01Z",
                "agent-1",
                AuditAction::ToolInvoked,
                "ls",
                AuditOutcome::Allow,
                "prev",
            )
        );
        assert_ne!(
            base,
            compute_entry_hash(
                1,
                "2026-06-28T00:00:00Z",
                "agent-2",
                AuditAction::ToolInvoked,
                "ls",
                AuditOutcome::Allow,
                "prev",
            )
        );
        assert_ne!(
            base,
            compute_entry_hash(
                1,
                "2026-06-28T00:00:00Z",
                "agent-1",
                AuditAction::DecisionMade,
                "ls",
                AuditOutcome::Allow,
                "prev",
            )
        );
        assert_ne!(
            base,
            compute_entry_hash(
                1,
                "2026-06-28T00:00:00Z",
                "agent-1",
                AuditAction::ToolInvoked,
                "rm",
                AuditOutcome::Allow,
                "prev",
            )
        );
        assert_ne!(
            base,
            compute_entry_hash(
                1,
                "2026-06-28T00:00:00Z",
                "agent-1",
                AuditAction::ToolInvoked,
                "ls",
                AuditOutcome::Deny,
                "prev",
            )
        );
        assert_ne!(
            base,
            compute_entry_hash(
                1,
                "2026-06-28T00:00:00Z",
                "agent-1",
                AuditAction::ToolInvoked,
                "ls",
                AuditOutcome::Allow,
                "prev2",
            )
        );
    }

    #[test]
    fn matches_known_ts_preimage_bytes() {
        // Reproduce the TS pre-image string and hash it the same way the TS
        // verifier does (join with ' '), proving our byte layout is identical.
        let seq = 0u64;
        let timestamp = "2026-06-28T12:00:00.000Z";
        let actor = "agent-x";
        let action = AuditAction::PolicyEvaluated;
        let detail = "evaluate push to main";
        let outcome = AuditOutcome::Allow;
        let prev = GENESIS_PREV_HASH;

        let ts_preimage = format!(
            "{seq} {timestamp} {actor} {action} {detail} {outcome} {prev}",
            action = action.as_str(),
            outcome = outcome.as_str(),
        );
        let mut h = Sha256::new();
        h.update(ts_preimage.as_bytes());
        let ts_style = hex::encode(h.finalize());

        let ours = compute_entry_hash(seq, timestamp, actor, action, detail, outcome, prev);
        assert_eq!(ours, ts_style);
    }
}
