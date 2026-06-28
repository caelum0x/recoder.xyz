//! [`AuditAction`] — the category of an audited governance action.
//!
//! The wire values MUST match the TypeScript union in
//! `packages/governance/src/domain/audit-entry.ts` exactly, because the action's
//! wire string is fed verbatim into the audit-chain hash pre-image. Any drift
//! here silently breaks cross-language chain verification.

use crate::error::GovernanceTypeError;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

/// A category of auditable governance action. Serialized as the exact dotted
/// wire string the TS facade uses (e.g. `"policy.evaluated"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AuditAction {
    /// A policy rule chain was evaluated.
    #[serde(rename = "policy.evaluated")]
    PolicyEvaluated,
    /// A governance decision (allow/deny/needs-approval) was produced.
    #[serde(rename = "decision.made")]
    DecisionMade,
    /// A permission enforcement check ran (file write, bash, tool access).
    #[serde(rename = "enforcement.checked")]
    EnforcementChecked,
    /// A tool was invoked by an agent.
    #[serde(rename = "tool.invoked")]
    ToolInvoked,
    /// A human approval was requested.
    #[serde(rename = "approval.requested")]
    ApprovalRequested,
    /// A human approval was resolved (approved/denied/timed-out).
    #[serde(rename = "approval.resolved")]
    ApprovalResolved,
    /// A model/runtime route was selected.
    #[serde(rename = "route.selected")]
    RouteSelected,
    /// An authentication attempt was observed.
    #[serde(rename = "auth.attempt")]
    AuthAttempt,
    /// Governance configuration was reloaded.
    #[serde(rename = "config.reloaded")]
    ConfigReloaded,
    /// A work signal (GitHub/Linear/etc.) was observed.
    #[serde(rename = "work_signal.observed")]
    WorkSignalObserved,
    /// A catch-all for actions outside the enumerated set.
    #[serde(rename = "custom")]
    Custom,
}

impl AuditAction {
    /// All actions in canonical declaration order (matches TS `AUDIT_ACTIONS`).
    pub const ALL: [AuditAction; 11] = [
        AuditAction::PolicyEvaluated,
        AuditAction::DecisionMade,
        AuditAction::EnforcementChecked,
        AuditAction::ToolInvoked,
        AuditAction::ApprovalRequested,
        AuditAction::ApprovalResolved,
        AuditAction::RouteSelected,
        AuditAction::AuthAttempt,
        AuditAction::ConfigReloaded,
        AuditAction::WorkSignalObserved,
        AuditAction::Custom,
    ];

    /// The exact dotted wire string. This is what enters the hash pre-image, so
    /// it must equal the TS union member byte-for-byte.
    pub const fn as_str(self) -> &'static str {
        match self {
            AuditAction::PolicyEvaluated => "policy.evaluated",
            AuditAction::DecisionMade => "decision.made",
            AuditAction::EnforcementChecked => "enforcement.checked",
            AuditAction::ToolInvoked => "tool.invoked",
            AuditAction::ApprovalRequested => "approval.requested",
            AuditAction::ApprovalResolved => "approval.resolved",
            AuditAction::RouteSelected => "route.selected",
            AuditAction::AuthAttempt => "auth.attempt",
            AuditAction::ConfigReloaded => "config.reloaded",
            AuditAction::WorkSignalObserved => "work_signal.observed",
            AuditAction::Custom => "custom",
        }
    }
}

impl std::fmt::Display for AuditAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for AuditAction {
    type Err = GovernanceTypeError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        AuditAction::ALL
            .into_iter()
            .find(|action| action.as_str() == value)
            .ok_or_else(|| GovernanceTypeError::UnknownAuditAction(value.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_strings_match_ts_union() {
        // These literals are copied from packages/governance audit-entry.ts.
        let expected = [
            "policy.evaluated",
            "decision.made",
            "enforcement.checked",
            "tool.invoked",
            "approval.requested",
            "approval.resolved",
            "route.selected",
            "auth.attempt",
            "config.reloaded",
            "work_signal.observed",
            "custom",
        ];
        let actual: Vec<&str> = AuditAction::ALL.iter().map(|a| a.as_str()).collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn serde_uses_wire_string() {
        let json = serde_json::to_string(&AuditAction::WorkSignalObserved).unwrap();
        assert_eq!(json, "\"work_signal.observed\"");
        let back: AuditAction = serde_json::from_str("\"policy.evaluated\"").unwrap();
        assert_eq!(back, AuditAction::PolicyEvaluated);
    }

    #[test]
    fn parse_roundtrips_and_rejects_unknown() {
        for action in AuditAction::ALL {
            assert_eq!(action.as_str().parse::<AuditAction>().unwrap(), action);
        }
        assert_eq!(
            "nope".parse::<AuditAction>().unwrap_err(),
            GovernanceTypeError::UnknownAuditAction("nope".to_string())
        );
    }
}
