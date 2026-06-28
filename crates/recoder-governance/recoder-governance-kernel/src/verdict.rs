//! [`GovernanceVerdict`] — the canonical decision result.
//!
//! A verdict carries the [`Effect`] (allow / needs-approval / deny), the
//! resolved risk [`tier`](GovernanceVerdict::tier), the chosen [`route`], the
//! [`enforcement`] outcome, and the `audit_hash` (the audit-chain tip after the
//! decision was recorded). It is the single value returned by
//! [`decide`](crate::pipeline::decide).

use recoder_governance_routing::RouteDecision;
use recoder_governance_types::RiskTier;
use serde::{Deserialize, Serialize};

/// The high-level effect of a governance decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Effect {
    /// The action may proceed.
    Allow,
    /// The action requires human approval before proceeding.
    NeedsApproval,
    /// The action is denied.
    Deny,
}

impl Effect {
    /// Whether the action may proceed without further gating.
    #[must_use]
    pub const fn is_allow(self) -> bool {
        matches!(self, Effect::Allow)
    }

    /// The canonical wire string.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Effect::Allow => "allow",
            Effect::NeedsApproval => "needs_approval",
            Effect::Deny => "deny",
        }
    }
}

/// A serializable mirror of the routing crate's [`RouteDecision`], so the verdict
/// is fully `serde`-friendly across the IPC boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum VerdictRoute {
    /// The action was routed to a model + runtime.
    Routed {
        /// The resolved assurance tier.
        tier: RiskTier,
        /// The selected model name.
        model: String,
        /// The preferred runtime adapter id.
        runtime: String,
    },
    /// No route was selected (the action was denied upstream).
    Unrouted,
}

impl From<RouteDecision> for VerdictRoute {
    fn from(decision: RouteDecision) -> Self {
        match decision {
            RouteDecision::Routed {
                tier,
                model,
                runtime,
            } => VerdictRoute::Routed {
                tier,
                model,
                runtime: runtime.as_str().to_string(),
            },
            RouteDecision::Denied => VerdictRoute::Unrouted,
        }
    }
}

/// The canonical governance verdict.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GovernanceVerdict {
    /// The decided effect.
    pub effect: Effect,
    /// The resolved risk tier.
    pub tier: RiskTier,
    /// The chosen route (unrouted on deny).
    pub route: VerdictRoute,
    /// A human-readable, secret-free explanation of the decision.
    pub reason: String,
    /// The audit-chain tip hash after this decision was recorded.
    pub audit_hash: String,
}

impl GovernanceVerdict {
    /// Construct a verdict.
    #[must_use]
    pub fn new(
        effect: Effect,
        tier: RiskTier,
        route: VerdictRoute,
        reason: impl Into<String>,
        audit_hash: impl Into<String>,
    ) -> Self {
        Self {
            effect,
            tier,
            route,
            reason: reason.into(),
            audit_hash: audit_hash.into(),
        }
    }

    /// Whether the verdict allows the action to proceed.
    #[must_use]
    pub fn is_allow(&self) -> bool {
        self.effect.is_allow()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use recoder_governance_routing::RuntimeAdapter;

    #[test]
    fn route_conversion_from_routed() {
        let decision = RouteDecision::Routed {
            tier: RiskTier::High,
            model: "opus".to_string(),
            runtime: RuntimeAdapter::ClaudeCode,
        };
        let route: VerdictRoute = decision.into();
        assert_eq!(
            route,
            VerdictRoute::Routed {
                tier: RiskTier::High,
                model: "opus".to_string(),
                runtime: "claude-code".to_string(),
            }
        );
    }

    #[test]
    fn route_conversion_from_denied() {
        let route: VerdictRoute = RouteDecision::Denied.into();
        assert_eq!(route, VerdictRoute::Unrouted);
    }

    #[test]
    fn verdict_serde_round_trip() {
        let verdict = GovernanceVerdict::new(
            Effect::Deny,
            RiskTier::Critical,
            VerdictRoute::Unrouted,
            "forbidden path",
            "abc123",
        );
        let json = serde_json::to_string(&verdict).unwrap();
        let back: GovernanceVerdict = serde_json::from_str(&json).unwrap();
        assert_eq!(verdict, back);
        assert!(!back.is_allow());
    }
}
