//! [`AuditEntry`], [`AuditInput`], and [`AuditOutcome`] — the records that form
//! the links of the SHA-256 Merkle audit chain.
//!
//! This mirrors `packages/governance/src/domain/audit-entry.ts`. The hashed
//! field order (enforced by the audit crate's hashing module, not here) is:
//!
//! ```text
//! seq | timestamp | actor | action | detail | outcome | prevHash
//! ```
//!
//! `AuditInput` is what a caller supplies; the chain assigns `seq`, `prev_hash`,
//! and `hash`. `AuditEntry` is the sealed, immutable result.

use crate::audit_action::AuditAction;
use crate::error::GovernanceTypeError;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

/// The outcome recorded for an audited action. Wire values mirror the TS
/// `AuditOutcome` union. Like the action, this feeds the hash pre-image.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditOutcome {
    /// The action was allowed.
    Allow,
    /// The action was denied.
    Deny,
    /// The action requires human approval.
    NeedsApproval,
    /// The action completed successfully.
    Success,
    /// The action failed.
    Failure,
    /// Informational record with no allow/deny semantics.
    Info,
}

impl AuditOutcome {
    /// All outcomes in declaration order.
    pub const ALL: [AuditOutcome; 6] = [
        AuditOutcome::Allow,
        AuditOutcome::Deny,
        AuditOutcome::NeedsApproval,
        AuditOutcome::Success,
        AuditOutcome::Failure,
        AuditOutcome::Info,
    ];

    /// The canonical wire string fed into the hash pre-image.
    pub const fn as_str(self) -> &'static str {
        match self {
            AuditOutcome::Allow => "allow",
            AuditOutcome::Deny => "deny",
            AuditOutcome::NeedsApproval => "needs_approval",
            AuditOutcome::Success => "success",
            AuditOutcome::Failure => "failure",
            AuditOutcome::Info => "info",
        }
    }
}

impl std::fmt::Display for AuditOutcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for AuditOutcome {
    type Err = GovernanceTypeError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        AuditOutcome::ALL
            .into_iter()
            .find(|outcome| outcome.as_str() == value)
            .ok_or_else(|| GovernanceTypeError::UnknownAuditOutcome(value.to_string()))
    }
}

/// What a caller supplies to append a record. The chain assigns `seq`,
/// `prev_hash`, and `hash`; the caller never sets those.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuditInput {
    /// ISO-8601 / RFC-3339 timestamp of when the action occurred. Injected by the
    /// caller (the chain does not read the clock) so hashing is deterministic.
    pub timestamp: String,
    /// The actor (agent id / principal) responsible for the action.
    pub actor: String,
    /// The category of action.
    pub action: AuditAction,
    /// Free-form, secret-free detail (tool name, path, command, etc.).
    pub detail: String,
    /// The outcome of the action.
    pub outcome: AuditOutcome,
}

impl AuditInput {
    /// Convenience constructor.
    pub fn new(
        timestamp: impl Into<String>,
        actor: impl Into<String>,
        action: AuditAction,
        detail: impl Into<String>,
        outcome: AuditOutcome,
    ) -> Self {
        Self {
            timestamp: timestamp.into(),
            actor: actor.into(),
            action,
            detail: detail.into(),
            outcome,
        }
    }
}

/// A sealed, hash-chained record. Immutable once appended.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuditEntry {
    /// Monotonically increasing sequence number (0-indexed).
    pub seq: u64,
    /// Mirrors [`AuditInput::timestamp`].
    pub timestamp: String,
    /// Mirrors [`AuditInput::actor`].
    pub actor: String,
    /// Mirrors [`AuditInput::action`].
    pub action: AuditAction,
    /// Mirrors [`AuditInput::detail`].
    pub detail: String,
    /// Mirrors [`AuditInput::outcome`].
    pub outcome: AuditOutcome,
    /// Hash of the previous entry; the genesis sentinel for `seq == 0`.
    #[serde(rename = "prevHash")]
    pub prev_hash: String,
    /// SHA-256 over the canonical field tuple including `prev_hash`.
    pub hash: String,
}

impl AuditEntry {
    /// Borrow this sealed entry's content as the bare [`AuditInput`] it was
    /// built from (drops `seq`/`prev_hash`/`hash`).
    pub fn input(&self) -> AuditInput {
        AuditInput {
            timestamp: self.timestamp.clone(),
            actor: self.actor.clone(),
            action: self.action,
            detail: self.detail.clone(),
            outcome: self.outcome,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outcome_wire_strings() {
        let actual: Vec<&str> = AuditOutcome::ALL.iter().map(|o| o.as_str()).collect();
        assert_eq!(
            actual,
            [
                "allow",
                "deny",
                "needs_approval",
                "success",
                "failure",
                "info"
            ]
        );
    }

    #[test]
    fn outcome_serde_snake_case() {
        let json = serde_json::to_string(&AuditOutcome::NeedsApproval).unwrap();
        assert_eq!(json, "\"needs_approval\"");
    }

    #[test]
    fn entry_serializes_prev_hash_as_camel_case() {
        let entry = AuditEntry {
            seq: 0,
            timestamp: "2026-06-28T00:00:00Z".to_string(),
            actor: "agent-1".to_string(),
            action: AuditAction::ToolInvoked,
            detail: "read_file".to_string(),
            outcome: AuditOutcome::Allow,
            prev_hash: "0".repeat(64),
            hash: "deadbeef".to_string(),
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"prevHash\""));
        assert!(!json.contains("\"prev_hash\""));
        let round: AuditEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(round, entry);
    }

    #[test]
    fn input_roundtrips_through_entry() {
        let input = AuditInput::new(
            "2026-06-28T00:00:00Z",
            "agent-7",
            AuditAction::DecisionMade,
            "allow push",
            AuditOutcome::Allow,
        );
        let entry = AuditEntry {
            seq: 3,
            timestamp: input.timestamp.clone(),
            actor: input.actor.clone(),
            action: input.action,
            detail: input.detail.clone(),
            outcome: input.outcome,
            prev_hash: "abc".to_string(),
            hash: "def".to_string(),
        };
        assert_eq!(entry.input(), input);
    }
}
