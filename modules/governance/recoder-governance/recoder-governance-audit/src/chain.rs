//! The append-only, tamper-evident audit log.
//!
//! Fused from openfang `audit.rs`'s `AuditLog`, but **pure**: no `Mutex`, no
//! SQLite, no `tracing`, and the clock is injected (the caller stamps each
//! [`AuditInput`] with its own timestamp). The chain owns a `Vec<AuditEntry>` and
//! advances an internal sequence counter and tip hash on append.

use crate::entry::seal_entry;
use crate::hashing::genesis_prev_hash;
use crate::verify::{verify_integrity, verify_range, IntegrityReport, RangeProof};
use recoder_governance_types::{AuditEntry, AuditInput};

/// An append-only Merkle hash chain of audit entries.
#[derive(Debug, Clone, Default)]
pub struct AuditLog {
    entries: Vec<AuditEntry>,
    tip: String,
}

impl AuditLog {
    /// Creates a new empty audit log. The initial tip is the genesis sentinel.
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            tip: genesis_prev_hash(),
        }
    }

    /// Rebuilds a log from a previously persisted sequence of entries, returning
    /// an error report if the loaded chain is not intact.
    ///
    /// This is the "load on boot and verify" path the openfang `with_db`
    /// constructor performed, decoupled from any storage backend.
    pub fn from_entries(entries: Vec<AuditEntry>) -> Result<Self, IntegrityReport> {
        match verify_integrity(&entries) {
            IntegrityReport::Ok { tip_hash, .. } => {
                let tip = tip_hash;
                Ok(Self { entries, tip })
            }
            report @ IntegrityReport::Broken { .. } => Err(report),
        }
    }

    /// Appends a new entry built from `input`, using the current tip as its
    /// `prev_hash`. Returns the newly sealed entry's hash (the new tip).
    pub fn append(&mut self, input: AuditInput) -> String {
        let seq = self.entries.len() as u64;
        let prev_hash = self.tip.clone();
        let entry = seal_entry(&input, seq, &prev_hash);
        let hash = entry.hash.clone();
        self.entries.push(entry);
        self.tip = hash.clone();
        hash
    }

    /// The current tip hash (hash of the most recent entry, or the genesis
    /// sentinel when empty).
    pub fn tip_hash(&self) -> &str {
        &self.tip
    }

    /// Number of entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the log is empty.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// All entries as an immutable slice.
    pub fn entries(&self) -> &[AuditEntry] {
        &self.entries
    }

    /// The most recent `n` entries (cloned), oldest-first.
    pub fn recent(&self, n: usize) -> Vec<AuditEntry> {
        let start = self.entries.len().saturating_sub(n);
        self.entries[start..].to_vec()
    }

    /// Walk the chain and recompute every hash, detecting tampering. Returns the
    /// first break (with the exact broken seq) or `Ok`.
    pub fn verify_integrity(&self) -> IntegrityReport {
        verify_integrity(&self.entries)
    }

    /// Produce a range proof over `[from_seq, to_seq]` (inclusive). The proof
    /// re-verifies the prefix `[0, from_seq)` to anchor the range to genesis.
    pub fn range_proof(&self, from_seq: u64, to_seq: u64) -> RangeProof {
        verify_range(&self.entries, from_seq, to_seq)
    }

    /// Test/diagnostic seam: borrow the entries mutably so a test can simulate
    /// tampering. Not part of the normal append-only contract.
    #[cfg(test)]
    pub(crate) fn entries_mut(&mut self) -> &mut Vec<AuditEntry> {
        &mut self.entries
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hashing::GENESIS_PREV_HASH;
    use recoder_governance_types::{AuditAction, AuditOutcome};

    fn input(actor: &str, action: AuditAction, detail: &str, outcome: AuditOutcome) -> AuditInput {
        // Deterministic timestamp keyed off the detail so entries differ.
        AuditInput::new(
            format!("2026-06-28T00:00:{:02}Z", detail.len() % 60),
            actor,
            action,
            detail,
            outcome,
        )
    }

    fn clean_log() -> AuditLog {
        let mut log = AuditLog::new();
        log.append(input(
            "agent-1",
            AuditAction::ToolInvoked,
            "read_file /etc/hosts",
            AuditOutcome::Allow,
        ));
        log.append(input(
            "agent-1",
            AuditAction::EnforcementChecked,
            "bash: ls -la",
            AuditOutcome::Allow,
        ));
        log.append(input(
            "agent-2",
            AuditAction::DecisionMade,
            "spawn helper",
            AuditOutcome::NeedsApproval,
        ));
        log.append(input(
            "agent-1",
            AuditAction::ToolInvoked,
            "fetch https://example.com",
            AuditOutcome::Deny,
        ));
        log
    }

    #[test]
    fn append_then_verify_clean_chain() {
        let log = clean_log();
        assert_eq!(log.len(), 4);
        assert!(log.verify_integrity().is_ok());

        let entries = log.entries();
        assert_eq!(entries[0].prev_hash, GENESIS_PREV_HASH);
        assert_eq!(entries[0].seq, 0);
        assert_eq!(entries[1].prev_hash, entries[0].hash);
        assert_eq!(entries[2].prev_hash, entries[1].hash);
        assert_eq!(entries[3].prev_hash, entries[2].hash);
        assert_eq!(log.tip_hash(), entries[3].hash);
    }

    #[test]
    fn genesis_tip_on_empty_log() {
        let log = AuditLog::new();
        assert!(log.is_empty());
        assert_eq!(log.tip_hash(), GENESIS_PREV_HASH);
        assert!(log.verify_integrity().is_ok());
    }

    #[test]
    fn tip_advances_on_append() {
        let mut log = AuditLog::new();
        let genesis = log.tip_hash().to_string();
        let h1 = log.append(input(
            "a",
            AuditAction::DecisionMade,
            "x",
            AuditOutcome::Allow,
        ));
        assert_eq!(log.tip_hash(), h1);
        assert_ne!(h1, genesis);
        let h2 = log.append(input(
            "b",
            AuditAction::DecisionMade,
            "yy",
            AuditOutcome::Deny,
        ));
        assert_eq!(log.tip_hash(), h2);
        assert_ne!(h2, h1);
    }

    #[test]
    fn tamper_middle_entry_reports_exact_broken_seq() {
        let mut log = clean_log();
        // Tamper with the detail of seq 1 (a middle entry), leaving its hash stale.
        log.entries_mut()[1].detail = "bash: echo hello".to_string();

        let report = log.verify_integrity();
        assert!(report.is_err());
        assert_eq!(report.broken_seq(), Some(1));
    }

    #[test]
    fn tamper_prev_hash_link_reports_broken_seq() {
        let mut log = clean_log();
        // Break the link: rewrite seq 2's prev_hash to a wrong value.
        log.entries_mut()[2].prev_hash = "f".repeat(64);

        let report = log.verify_integrity();
        assert!(report.is_err());
        assert_eq!(report.broken_seq(), Some(2));
    }

    #[test]
    fn from_entries_rejects_tampered_load() {
        let mut log = clean_log();
        log.entries_mut()[0].outcome = AuditOutcome::Deny;
        let loaded = AuditLog::from_entries(log.entries().to_vec());
        assert!(loaded.is_err());
        assert_eq!(loaded.unwrap_err().broken_seq(), Some(0));
    }

    #[test]
    fn from_entries_accepts_clean_load_and_continues_chain() {
        let log = clean_log();
        let mut reloaded = AuditLog::from_entries(log.entries().to_vec()).unwrap();
        assert_eq!(reloaded.len(), 4);
        assert_eq!(reloaded.tip_hash(), log.tip_hash());
        // Chain continues correctly after a reload.
        reloaded.append(input(
            "agent-3",
            AuditAction::RouteSelected,
            "pick sonnet",
            AuditOutcome::Info,
        ));
        assert_eq!(reloaded.len(), 5);
        assert!(reloaded.verify_integrity().is_ok());
        assert_eq!(reloaded.entries()[4].prev_hash, log.tip_hash());
    }

    #[test]
    fn range_proof_over_clean_chain() {
        let log = clean_log();
        let proof = log.range_proof(1, 2);
        assert!(proof.is_valid());
        assert_eq!(proof.from_seq, 1);
        assert_eq!(proof.to_seq, 2);
        assert_eq!(proof.entries.len(), 2);
        assert_eq!(proof.entries[0].seq, 1);
        assert_eq!(proof.entries[1].seq, 2);
    }

    #[test]
    fn recent_returns_tail_oldest_first() {
        let log = clean_log();
        let recent = log.recent(2);
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].seq, 2);
        assert_eq!(recent[1].seq, 3);
    }
}
