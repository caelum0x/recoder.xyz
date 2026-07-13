//! Entry types and the sealing helper.
//!
//! The record types live in `recoder-governance-types`; this module re-exports
//! them for ergonomics and adds [`seal_entry`], which binds an [`AuditInput`] to
//! its position in the chain by computing its hash.

pub use recoder_governance_types::{AuditAction, AuditEntry, AuditInput, AuditOutcome};

use crate::hashing::compute_entry_hash;

/// Seal an [`AuditInput`] into an [`AuditEntry`] given its sequence number and
/// the previous link's hash. Computes the canonical hash; pure + deterministic.
///
/// Mirrors the TS `sealEntry` helper.
pub fn seal_entry(input: &AuditInput, seq: u64, prev_hash: &str) -> AuditEntry {
    let hash = compute_entry_hash(
        seq,
        &input.timestamp,
        &input.actor,
        input.action,
        &input.detail,
        input.outcome,
        prev_hash,
    );
    AuditEntry {
        seq,
        timestamp: input.timestamp.clone(),
        actor: input.actor.clone(),
        action: input.action,
        detail: input.detail.clone(),
        outcome: input.outcome,
        prev_hash: prev_hash.to_string(),
        hash,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hashing::GENESIS_PREV_HASH;

    #[test]
    fn seal_binds_position_and_hash() {
        let input = AuditInput::new(
            "2026-06-28T00:00:00Z",
            "agent-1",
            AuditAction::ToolInvoked,
            "read_file",
            AuditOutcome::Allow,
        );
        let entry = seal_entry(&input, 0, GENESIS_PREV_HASH);
        assert_eq!(entry.seq, 0);
        assert_eq!(entry.prev_hash, GENESIS_PREV_HASH);
        assert_eq!(entry.input(), input);
        // hash is the canonical one
        let expected = compute_entry_hash(
            0,
            &input.timestamp,
            &input.actor,
            input.action,
            &input.detail,
            input.outcome,
            GENESIS_PREV_HASH,
        );
        assert_eq!(entry.hash, expected);
    }
}
