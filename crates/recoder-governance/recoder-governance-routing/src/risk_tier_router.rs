//! Risk-tier router (NEW — governance.md §3.4): **fuses** complexity with the
//! policy [`RiskTier`].
//!
//! The key property: a high-risk action on a *simple* prompt still routes to a
//! higher-assurance model/runtime tier, and a **denied** action never routes at
//! all. The resolved tier is `max(complexity_tier, policy_risk)` — deny-biased
//! toward the more severe input.

use crate::complexity::TaskComplexity;
use crate::model_router::ModelRouter;
use crate::runtime_router::{runtime_for_tier, RuntimeAdapter};
use recoder_governance_types::RiskTier;

/// Map a [`TaskComplexity`] to a baseline [`RiskTier`].
#[must_use]
pub fn complexity_to_tier(complexity: TaskComplexity) -> RiskTier {
    match complexity {
        TaskComplexity::Simple => RiskTier::Low,
        TaskComplexity::Medium => RiskTier::Medium,
        TaskComplexity::Complex => RiskTier::High,
    }
}

/// The fused routing outcome.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RouteDecision {
    /// The action is permitted and routed.
    Routed {
        /// The resolved assurance tier.
        tier: RiskTier,
        /// The selected model name.
        model: String,
        /// The preferred runtime adapter.
        runtime: RuntimeAdapter,
    },
    /// The action was denied upstream and is not routed at all.
    Denied,
}

impl RouteDecision {
    /// The resolved tier, if routed.
    #[must_use]
    pub fn tier(&self) -> Option<RiskTier> {
        match self {
            RouteDecision::Routed { tier, .. } => Some(*tier),
            RouteDecision::Denied => None,
        }
    }
}

/// Fuse a scored [`TaskComplexity`] with the policy [`RiskTier`] to choose a
/// route. `denied` short-circuits to [`RouteDecision::Denied`] — a denied action
/// never routes.
///
/// The resolved tier is the more severe of the complexity-derived tier and the
/// policy risk tier. The model is then chosen from the resolved tier (high/
/// critical both take the router's complex model — the highest-assurance one).
#[must_use]
pub fn route(
    router: &ModelRouter,
    complexity: TaskComplexity,
    policy_risk: RiskTier,
    denied: bool,
) -> RouteDecision {
    if denied {
        return RouteDecision::Denied;
    }

    let tier = complexity_to_tier(complexity).max(policy_risk);

    // Map the resolved tier to a model complexity bucket: Low->Simple,
    // Medium->Medium, High/Critical->Complex (highest-assurance model).
    let model_complexity = match tier {
        RiskTier::Low => TaskComplexity::Simple,
        RiskTier::Medium => TaskComplexity::Medium,
        RiskTier::High | RiskTier::Critical => TaskComplexity::Complex,
    };
    let model = router.model_for_complexity(model_complexity).to_string();

    RouteDecision::Routed {
        tier,
        model,
        runtime: runtime_for_tier(tier),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model_router::ModelRoutingConfig;

    fn router() -> ModelRouter {
        ModelRouter::new(ModelRoutingConfig {
            simple_model: "haiku".to_string(),
            medium_model: "sonnet".to_string(),
            complex_model: "opus".to_string(),
            simple_threshold: 200,
            complex_threshold: 800,
        })
    }

    #[test]
    fn high_risk_on_simple_prompt_routes_high() {
        // Complexity is Simple (-> Low), but the policy says High. Fused = High.
        let decision = route(&router(), TaskComplexity::Simple, RiskTier::High, false);
        match decision {
            RouteDecision::Routed {
                tier,
                model,
                runtime,
            } => {
                assert_eq!(tier, RiskTier::High);
                assert_eq!(model, "opus");
                assert_eq!(runtime, RuntimeAdapter::ClaudeCode);
            }
            RouteDecision::Denied => panic!("should route"),
        }
    }

    #[test]
    fn complex_prompt_on_low_risk_routes_high() {
        // Complexity Complex (-> High) dominates a Low policy risk.
        let decision = route(&router(), TaskComplexity::Complex, RiskTier::Low, false);
        assert_eq!(decision.tier(), Some(RiskTier::High));
    }

    #[test]
    fn critical_policy_risk_dominates() {
        let decision = route(&router(), TaskComplexity::Simple, RiskTier::Critical, false);
        match decision {
            RouteDecision::Routed { tier, model, .. } => {
                assert_eq!(tier, RiskTier::Critical);
                assert_eq!(model, "opus"); // highest-assurance model
            }
            RouteDecision::Denied => panic!("should route"),
        }
    }

    #[test]
    fn denied_action_never_routes() {
        let decision = route(&router(), TaskComplexity::Complex, RiskTier::Critical, true);
        assert_eq!(decision, RouteDecision::Denied);
        assert_eq!(decision.tier(), None);
    }

    #[test]
    fn simple_low_routes_cheapest() {
        let decision = route(&router(), TaskComplexity::Simple, RiskTier::Low, false);
        match decision {
            RouteDecision::Routed {
                tier,
                model,
                runtime,
            } => {
                assert_eq!(tier, RiskTier::Low);
                assert_eq!(model, "haiku");
                assert_eq!(runtime, RuntimeAdapter::Generic);
            }
            RouteDecision::Denied => panic!("should route"),
        }
    }

    #[test]
    fn complexity_to_tier_mapping() {
        assert_eq!(complexity_to_tier(TaskComplexity::Simple), RiskTier::Low);
        assert_eq!(complexity_to_tier(TaskComplexity::Medium), RiskTier::Medium);
        assert_eq!(complexity_to_tier(TaskComplexity::Complex), RiskTier::High);
    }
}
