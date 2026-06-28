//! Chain verification: full integrity walk, prefix anchoring, and range proofs.
//!
//! The semantics mirror the TS verifier (`merkle-verifier.ts`): walk every entry,
//! confirm `seq` monotonicity (entry `seq` equals its index), confirm the
//! `prev_hash` link, and recompute the hash from the entry's content. The first
//! anomaly is reported deny-biased, including the exact broken sequence number.

use crate::hashing::{compute_entry_hash, genesis_prev_hash};
use recoder_governance_types::AuditEntry;

/// The result of verifying a chain (or prefix). Mirrors the TS `IntegrityResult`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IntegrityReport {
    /// The chain is intact.
    Ok {
        /// The tip hash (hash of the last entry, or genesis for an empty chain).
        tip_hash: String,
        /// Number of entries verified.
        length: usize,
    },
    /// The chain is broken at `broken_seq`.
    Broken {
        /// The sequence number of the first entry that failed verification.
        broken_seq: u64,
        /// Human-readable reason for the break.
        reason: String,
    },
}

impl IntegrityReport {
    /// `true` when the chain verified clean.
    pub fn is_ok(&self) -> bool {
        matches!(self, IntegrityReport::Ok { .. })
    }

    /// `true` when the chain is broken.
    pub fn is_err(&self) -> bool {
        matches!(self, IntegrityReport::Broken { .. })
    }

    /// The broken sequence number, if any.
    pub fn broken_seq(&self) -> Option<u64> {
        match self {
            IntegrityReport::Broken { broken_seq, .. } => Some(*broken_seq),
            IntegrityReport::Ok { .. } => None,
        }
    }

    /// The reason string for a broken chain, if any.
    pub fn reason(&self) -> Option<&str> {
        match self {
            IntegrityReport::Broken { reason, .. } => Some(reason),
            IntegrityReport::Ok { .. } => None,
        }
    }
}

/// Verify the full chain, walking every entry. Returns the first break.
///
/// Anchored at the genesis sentinel; each entry must have `seq == index`,
/// `prev_hash == previous tip`, and a hash that recomputes to its stored value.
pub fn verify_integrity(entries: &[AuditEntry]) -> IntegrityReport {
    let mut prev_hash = genesis_prev_hash();

    for (index, entry) in entries.iter().enumerate() {
        let expected_seq = index as u64;
        if entry.seq != expected_seq {
            return IntegrityReport::Broken {
                broken_seq: entry.seq,
                reason: format!("sequence gap: expected {expected_seq}, found {}", entry.seq),
            };
        }

        if entry.prev_hash != prev_hash {
            return IntegrityReport::Broken {
                broken_seq: entry.seq,
                reason: format!(
                    "broken link at seq {}: prev_hash {} did not match expected {}",
                    entry.seq, entry.prev_hash, prev_hash
                ),
            };
        }

        let recomputed = compute_entry_hash(
            entry.seq,
            &entry.timestamp,
            &entry.actor,
            entry.action,
            &entry.detail,
            entry.outcome,
            &entry.prev_hash,
        );
        if recomputed != entry.hash {
            return IntegrityReport::Broken {
                broken_seq: entry.seq,
                reason: format!(
                    "tampered content at seq {}: recomputed hash {} != stored {}",
                    entry.seq, recomputed, entry.hash
                ),
            };
        }

        prev_hash = entry.hash.clone();
    }

    IntegrityReport::Ok {
        tip_hash: prev_hash,
        length: entries.len(),
    }
}

/// Verify only the prefix `[0, until_seq]` (inclusive). Backs cheap checkpoint
/// proofs. Mirrors TS `verifyPrefix`.
pub fn verify_prefix(entries: &[AuditEntry], until_seq: u64) -> IntegrityReport {
    let prefix: Vec<AuditEntry> = entries
        .iter()
        .filter(|entry| entry.seq <= until_seq)
        .cloned()
        .collect();
    verify_integrity(&prefix)
}

/// A range proof over `[from_seq, to_seq]` (inclusive).
///
/// A range proof is only meaningful if the chain is anchored to genesis up to the
/// start of the range, so it verifies the prefix `[0, from_seq)` and then the
/// contiguous range. `valid` is true only when both hold and the range is
/// well-formed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RangeProof {
    /// Inclusive lower bound.
    pub from_seq: u64,
    /// Inclusive upper bound.
    pub to_seq: u64,
    /// The entries in the range (cloned).
    pub entries: Vec<AuditEntry>,
    /// The hash that anchors the range (the tip of the prefix `[0, from_seq)`,
    /// i.e. the `prev_hash` the first ranged entry must point at).
    pub anchor_prev_hash: String,
    /// The tip hash at `to_seq`.
    pub tip_hash: String,
    /// Whether the proof verified clean.
    pub valid: bool,
    /// Reason when invalid.
    pub reason: Option<String>,
}

impl RangeProof {
    /// Whether the proof verified clean.
    pub fn is_valid(&self) -> bool {
        self.valid
    }
}

/// Build and verify a range proof over `[from_seq, to_seq]` (inclusive).
pub fn verify_range(entries: &[AuditEntry], from_seq: u64, to_seq: u64) -> RangeProof {
    let invalid = |reason: String, anchor: String| RangeProof {
        from_seq,
        to_seq,
        entries: Vec::new(),
        anchor_prev_hash: anchor,
        tip_hash: String::new(),
        valid: false,
        reason: Some(reason),
    };

    if from_seq > to_seq {
        return invalid(
            format!("empty range: from_seq {from_seq} > to_seq {to_seq}"),
            genesis_prev_hash(),
        );
    }

    // Anchor the range: the prefix [0, from_seq) must itself be intact, and its
    // tip becomes the prev_hash the first ranged entry must reference.
    let anchor = if from_seq == 0 {
        genesis_prev_hash()
    } else {
        match verify_prefix(entries, from_seq - 1) {
            IntegrityReport::Ok { tip_hash, length } => {
                if (length as u64) != from_seq {
                    return invalid(
                        format!(
                            "prefix is shorter than from_seq: have {length} entries, need {from_seq}"
                        ),
                        genesis_prev_hash(),
                    );
                }
                tip_hash
            }
            IntegrityReport::Broken { broken_seq, reason } => {
                return invalid(
                    format!("prefix broken at seq {broken_seq}: {reason}"),
                    genesis_prev_hash(),
                );
            }
        }
    };

    // Collect and verify the contiguous range, linking from the anchor.
    let mut prev_hash = anchor.clone();
    let mut ranged: Vec<AuditEntry> = Vec::new();
    let mut expected_seq = from_seq;

    for entry in entries
        .iter()
        .filter(|e| e.seq >= from_seq && e.seq <= to_seq)
    {
        if entry.seq != expected_seq {
            return invalid(
                format!(
                    "range gap: expected seq {expected_seq}, found {}",
                    entry.seq
                ),
                anchor,
            );
        }
        if entry.prev_hash != prev_hash {
            return invalid(
                format!(
                    "broken link at seq {}: prev_hash {} != expected {}",
                    entry.seq, entry.prev_hash, prev_hash
                ),
                anchor,
            );
        }
        let recomputed = compute_entry_hash(
            entry.seq,
            &entry.timestamp,
            &entry.actor,
            entry.action,
            &entry.detail,
            entry.outcome,
            &entry.prev_hash,
        );
        if recomputed != entry.hash {
            return invalid(
                format!("tampered content at seq {}: hash mismatch", entry.seq),
                anchor,
            );
        }
        prev_hash = entry.hash.clone();
        ranged.push(entry.clone());
        expected_seq += 1;
    }

    if (ranged.len() as u64) != (to_seq - from_seq + 1) {
        return invalid(
            format!(
                "range incomplete: collected {} entries, expected {}",
                ranged.len(),
                to_seq - from_seq + 1
            ),
            anchor,
        );
    }

    RangeProof {
        from_seq,
        to_seq,
        entries: ranged,
        anchor_prev_hash: anchor,
        tip_hash: prev_hash,
        valid: true,
        reason: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chain::AuditLog;
    use crate::hashing::GENESIS_PREV_HASH;
    use recoder_governance_types::{AuditAction, AuditInput, AuditOutcome};

    fn build(n: u64) -> AuditLog {
        let mut log = AuditLog::new();
        for i in 0..n {
            log.append(AuditInput::new(
                format!("2026-06-28T00:00:{:02}Z", i % 60),
                format!("agent-{i}"),
                AuditAction::ToolInvoked,
                format!("action #{i}"),
                AuditOutcome::Allow,
            ));
        }
        log
    }

    #[test]
    fn empty_chain_is_ok_with_genesis_tip() {
        let report = verify_integrity(&[]);
        assert!(report.is_ok());
        assert_eq!(
            report,
            IntegrityReport::Ok {
                tip_hash: GENESIS_PREV_HASH.to_string(),
                length: 0
            }
        );
    }

    #[test]
    fn clean_chain_verifies() {
        let log = build(5);
        let report = verify_integrity(log.entries());
        assert!(report.is_ok());
        match report {
            IntegrityReport::Ok { tip_hash, length } => {
                assert_eq!(length, 5);
                assert_eq!(tip_hash, log.tip_hash());
            }
            _ => unreachable!(),
        }
    }

    #[test]
    fn tampered_content_reports_exact_seq() {
        let mut entries = build(5).entries().to_vec();
        entries[3].detail = "tampered".to_string();
        let report = verify_integrity(&entries);
        assert_eq!(report.broken_seq(), Some(3));
        assert!(report
            .reason()
            .unwrap()
            .contains("tampered content at seq 3"));
    }

    #[test]
    fn sequence_gap_is_detected() {
        let mut entries = build(3).entries().to_vec();
        entries[1].seq = 99;
        let report = verify_integrity(&entries);
        assert_eq!(report.broken_seq(), Some(99));
        assert!(report.reason().unwrap().contains("sequence gap"));
    }

    #[test]
    fn prefix_verification() {
        let log = build(5);
        let report = verify_prefix(log.entries(), 2);
        assert!(report.is_ok());
        match report {
            IntegrityReport::Ok { length, tip_hash } => {
                assert_eq!(length, 3);
                assert_eq!(tip_hash, log.entries()[2].hash);
            }
            _ => unreachable!(),
        }
    }

    #[test]
    fn range_proof_anchored_at_genesis() {
        let log = build(4);
        let proof = verify_range(log.entries(), 0, 1);
        assert!(proof.is_valid());
        assert_eq!(proof.anchor_prev_hash, GENESIS_PREV_HASH);
        assert_eq!(proof.entries.len(), 2);
        assert_eq!(proof.tip_hash, log.entries()[1].hash);
    }

    #[test]
    fn range_proof_in_the_middle() {
        let log = build(6);
        let proof = verify_range(log.entries(), 2, 4);
        assert!(proof.is_valid());
        assert_eq!(proof.from_seq, 2);
        assert_eq!(proof.to_seq, 4);
        assert_eq!(proof.entries.len(), 3);
        // anchor is the tip of [0,2) i.e. hash of entry 1
        assert_eq!(proof.anchor_prev_hash, log.entries()[1].hash);
        assert_eq!(proof.tip_hash, log.entries()[4].hash);
    }

    #[test]
    fn range_proof_fails_when_prefix_tampered() {
        let mut entries = build(6).entries().to_vec();
        // Tamper before the range -> anchor prefix verification fails.
        entries[0].detail = "x".to_string();
        let proof = verify_range(&entries, 3, 5);
        assert!(!proof.is_valid());
        assert!(proof.reason.unwrap().contains("prefix broken at seq 0"));
    }

    #[test]
    fn range_proof_fails_when_in_range_tampered() {
        let mut entries = build(6).entries().to_vec();
        entries[4].outcome = AuditOutcome::Deny;
        let proof = verify_range(&entries, 3, 5);
        assert!(!proof.is_valid());
        assert!(proof.reason.unwrap().contains("tampered content at seq 4"));
    }

    #[test]
    fn empty_range_is_invalid() {
        let log = build(3);
        let proof = verify_range(log.entries(), 2, 1);
        assert!(!proof.is_valid());
        assert!(proof.reason.unwrap().contains("empty range"));
    }
}
