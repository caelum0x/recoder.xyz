//! Approval domain types — the request/response/policy/decision shapes that gate
//! dangerous operations behind human approval.
//!
//! Merged from `openfang-types/src/approval.rs`. The transport-heavy fields
//! (`Uuid`, `DateTime<Utc>`) of the upstream source are deliberately replaced
//! with plain `String` identifiers and unix-millis timestamps so this crate
//! keeps a *tiny* dependency surface (no `uuid`, no `chrono`) and stays trivially
//! serializable across the typed IPC boundary. The control plane owns the
//! canonical id/timestamp formats; these types only carry them.

use crate::risk::RiskTier;
use serde::{Deserialize, Serialize};

/// Severity of a tool invocation, used to decide whether human approval is
/// required and to seed the routing risk tier.
///
/// Ordering is load-bearing and ascending: `Low < Medium < High < Critical`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    /// Routine, reversible operations.
    Low,
    /// Moderate-impact operations (network reads, navigation).
    Medium,
    /// High-impact operations (file writes/deletes).
    High,
    /// Maximum-severity operations (shell execution).
    Critical,
}

impl RiskLevel {
    /// All levels in ascending severity order.
    pub const ALL: [RiskLevel; 4] = [
        RiskLevel::Low,
        RiskLevel::Medium,
        RiskLevel::High,
        RiskLevel::Critical,
    ];

    /// The canonical lowercase wire string.
    pub const fn as_str(self) -> &'static str {
        match self {
            RiskLevel::Low => "low",
            RiskLevel::Medium => "medium",
            RiskLevel::High => "high",
            RiskLevel::Critical => "critical",
        }
    }

    /// Map a [`RiskLevel`] to the canonical [`RiskTier`]. The two enums are
    /// intentionally 1:1 (the routing/approval split is historical), so this is
    /// a total, lossless mapping.
    pub const fn to_tier(self) -> RiskTier {
        match self {
            RiskLevel::Low => RiskTier::Low,
            RiskLevel::Medium => RiskTier::Medium,
            RiskLevel::High => RiskTier::High,
            RiskLevel::Critical => RiskTier::Critical,
        }
    }
}

impl std::fmt::Display for RiskLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl From<RiskLevel> for RiskTier {
    fn from(level: RiskLevel) -> Self {
        level.to_tier()
    }
}

/// A request for human approval of a pending tool invocation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovalRequest {
    /// Control-plane assigned request id (opaque string; never trusted as a key
    /// without validation).
    pub id: String,
    /// The agent that wants to run the action.
    pub agent_id: String,
    /// The tool being invoked.
    pub tool_name: String,
    /// Human-readable description of the operation.
    pub description: String,
    /// Short summary of the concrete action (e.g. the command).
    pub action_summary: String,
    /// Classified risk of the action.
    pub risk_level: RiskLevel,
    /// When the request was created (unix millis).
    pub requested_at_ms: i64,
    /// How long to wait before auto-denying (seconds).
    pub timeout_secs: u64,
}

impl ApprovalRequest {
    /// Maximum length of free-text fields, matching the upstream `validate()`
    /// bounds. Over-long fields are a sign of an untrusted/oversized payload.
    pub const MAX_TEXT_LEN: usize = 4096;
    /// Upper bound on an approval timeout (24h). Beyond this is almost certainly
    /// a misconfiguration that would pin a pending slot indefinitely.
    pub const MAX_TIMEOUT_SECS: u64 = 24 * 60 * 60;

    /// Validate the request at the trust boundary. Fails fast with a clear
    /// message; never silently truncates.
    pub fn validate(&self) -> Result<(), String> {
        if self.id.trim().is_empty() {
            return Err("approval request id must not be empty".to_string());
        }
        if self.agent_id.trim().is_empty() {
            return Err("approval request agent_id must not be empty".to_string());
        }
        if self.tool_name.trim().is_empty() {
            return Err("approval request tool_name must not be empty".to_string());
        }
        for (field, value) in [
            ("description", &self.description),
            ("action_summary", &self.action_summary),
        ] {
            if value.len() > Self::MAX_TEXT_LEN {
                return Err(format!(
                    "approval request {field} exceeds {} bytes",
                    Self::MAX_TEXT_LEN
                ));
            }
        }
        if self.timeout_secs == 0 {
            return Err("approval request timeout_secs must be > 0".to_string());
        }
        if self.timeout_secs > Self::MAX_TIMEOUT_SECS {
            return Err(format!(
                "approval request timeout_secs exceeds {}",
                Self::MAX_TIMEOUT_SECS
            ));
        }
        Ok(())
    }
}

/// The outcome of an approval request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    /// A human (or auto-approver) approved the action.
    Approved,
    /// A human denied the action.
    Denied,
    /// No decision arrived within the timeout; treated as a deny-biased outcome.
    TimedOut,
}

impl ApprovalDecision {
    /// Whether this decision permits the action to proceed.
    pub const fn is_approved(self) -> bool {
        matches!(self, ApprovalDecision::Approved)
    }
}

/// A resolved approval, returned to the resolver (UI/API).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovalResponse {
    /// The id of the request that was resolved.
    pub request_id: String,
    /// The decision reached.
    pub decision: ApprovalDecision,
    /// When the decision was made (unix millis).
    pub decided_at_ms: i64,
    /// Who decided (operator id), if known.
    pub decided_by: Option<String>,
}

/// Policy controlling which tools require approval and the default timeout.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ApprovalPolicy {
    /// Tools that always require human approval.
    pub require_approval: Vec<String>,
    /// Default timeout (seconds) applied to requests.
    pub timeout_secs: u64,
    /// In autonomous mode, auto-approve requests up to the tier ceiling.
    pub auto_approve_autonomous: bool,
    /// Globally auto-approve every request (dangerous; off by default).
    pub auto_approve: bool,
    /// The maximum tier the auto-approver may approve. Anything above always
    /// requires a human. Defaults to [`RiskTier::Medium`].
    pub auto_approve_ceiling: RiskTier,
}

impl Default for ApprovalPolicy {
    fn default() -> Self {
        Self {
            require_approval: vec!["shell_exec".to_string()],
            timeout_secs: 60,
            auto_approve_autonomous: false,
            auto_approve: false,
            auto_approve_ceiling: RiskTier::Medium,
        }
    }
}

impl ApprovalPolicy {
    /// Validate the policy bounds.
    pub fn validate(&self) -> Result<(), String> {
        if self.timeout_secs == 0 {
            return Err("approval policy timeout_secs must be > 0".to_string());
        }
        if self.timeout_secs > ApprovalRequest::MAX_TIMEOUT_SECS {
            return Err(format!(
                "approval policy timeout_secs exceeds {}",
                ApprovalRequest::MAX_TIMEOUT_SECS
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn risk_level_orders_ascending() {
        assert!(RiskLevel::Low < RiskLevel::Medium);
        assert!(RiskLevel::High < RiskLevel::Critical);
        assert_eq!(
            RiskLevel::ALL.iter().max().copied(),
            Some(RiskLevel::Critical)
        );
    }

    #[test]
    fn risk_level_maps_to_tier_lossless() {
        for level in RiskLevel::ALL {
            let tier: RiskTier = level.into();
            assert_eq!(tier.as_str(), level.as_str());
        }
    }

    #[test]
    fn risk_level_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&RiskLevel::Critical).unwrap(),
            "\"critical\""
        );
    }

    #[test]
    fn decision_serializes_snake_case() {
        assert_eq!(
            serde_json::to_string(&ApprovalDecision::TimedOut).unwrap(),
            "\"timed_out\""
        );
        assert!(ApprovalDecision::Approved.is_approved());
        assert!(!ApprovalDecision::Denied.is_approved());
    }

    fn valid_request() -> ApprovalRequest {
        ApprovalRequest {
            id: "req-1".to_string(),
            agent_id: "agent-1".to_string(),
            tool_name: "shell_exec".to_string(),
            description: "run a command".to_string(),
            action_summary: "rm -rf /tmp/x".to_string(),
            risk_level: RiskLevel::Critical,
            requested_at_ms: 0,
            timeout_secs: 60,
        }
    }

    #[test]
    fn request_validate_accepts_well_formed() {
        assert!(valid_request().validate().is_ok());
    }

    #[test]
    fn request_validate_rejects_empty_ids_and_bad_timeout() {
        let mut r = valid_request();
        r.id = "  ".to_string();
        assert!(r.validate().is_err());

        let mut r = valid_request();
        r.agent_id = String::new();
        assert!(r.validate().is_err());

        let mut r = valid_request();
        r.timeout_secs = 0;
        assert!(r.validate().is_err());

        let mut r = valid_request();
        r.timeout_secs = ApprovalRequest::MAX_TIMEOUT_SECS + 1;
        assert!(r.validate().is_err());
    }

    #[test]
    fn request_validate_rejects_oversized_text() {
        let mut r = valid_request();
        r.description = "a".repeat(ApprovalRequest::MAX_TEXT_LEN + 1);
        assert!(r.validate().is_err());
    }

    #[test]
    fn policy_defaults_and_validate() {
        let p = ApprovalPolicy::default();
        assert_eq!(p.require_approval, vec!["shell_exec".to_string()]);
        assert_eq!(p.timeout_secs, 60);
        assert!(!p.auto_approve_autonomous);
        assert_eq!(p.auto_approve_ceiling, RiskTier::Medium);
        assert!(p.validate().is_ok());

        let bad = ApprovalPolicy {
            timeout_secs: 0,
            ..Default::default()
        };
        assert!(bad.validate().is_err());
    }

    #[test]
    fn policy_roundtrips_with_serde_defaults() {
        // An empty object should deserialize to the defaults via #[serde(default)].
        let p: ApprovalPolicy = serde_json::from_str("{}").unwrap();
        assert_eq!(p, ApprovalPolicy::default());
    }
}
