//! Integration test: complexity scoring fused with policy risk tiers.

use recoder_governance_routing::{
    route, ModelRouter, ModelRoutingConfig, RouteDecision, ScoringInput, TaskComplexity,
};
use recoder_governance_types::RiskTier;

fn router() -> ModelRouter {
    ModelRouter::new(ModelRoutingConfig::default())
}

#[test]
fn complexity_scoring_separates_tiers() {
    let r = router();
    let simple = r.score(&ScoringInput::from_messages(vec!["hi".to_string()]));
    let complex = r.score(&ScoringInput::from_messages(vec!["x".repeat(4000)]));
    assert_eq!(simple, TaskComplexity::Simple);
    assert_eq!(complex, TaskComplexity::Complex);
}

#[test]
fn high_risk_simple_prompt_still_routes_high() {
    let decision = route(&router(), TaskComplexity::Simple, RiskTier::High, false);
    assert_eq!(decision.tier(), Some(RiskTier::High));
}

#[test]
fn denied_action_does_not_route() {
    let decision = route(&router(), TaskComplexity::Complex, RiskTier::Critical, true);
    assert_eq!(decision, RouteDecision::Denied);
}

#[test]
fn fused_tier_is_max_of_inputs() {
    // Medium complexity + Low risk -> Medium.
    assert_eq!(
        route(&router(), TaskComplexity::Medium, RiskTier::Low, false).tier(),
        Some(RiskTier::Medium)
    );
    // Simple complexity + Critical risk -> Critical.
    assert_eq!(
        route(&router(), TaskComplexity::Simple, RiskTier::Critical, false).tier(),
        Some(RiskTier::Critical)
    );
}
