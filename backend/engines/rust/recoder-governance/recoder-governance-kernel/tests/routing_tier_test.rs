//! Routing-tier integration: prove the kernel's fused risk-tier routing through
//! the REAL `decide` pipeline (not the routing crate in isolation).
//!
//! The routing crate's own tests exercise `route(complexity, policy_risk, denied)`
//! directly. What was missing is proof that the KERNEL pipeline feeds that router
//! the correct fused tier — i.e. that `stage_command_risk` raises Network/MCP to
//! Medium, that the resolved `VerdictRoute::Routed.tier` equals the fused
//! `max(complexity_tier, policy_risk)`, that a high-complexity prompt pushes the
//! route up, and that a denied action is structurally `Unrouted`.

use recoder_governance_kernel::{
    Effect, GovernanceAction, GovernanceContext, GovernanceHandle, GovernanceKernel,
    GovernanceKernelConfig, GovernanceRequest, VerdictRoute,
};
use recoder_governance_types::RiskTier;

fn kernel() -> GovernanceKernel {
    GovernanceKernel::new(GovernanceKernelConfig::default()).expect("default config is valid")
}

/// Pull the tier+model out of a `Routed` verdict, panicking if it was unrouted.
fn routed(verdict: &recoder_governance_kernel::GovernanceVerdict) -> (RiskTier, String) {
    match &verdict.route {
        VerdictRoute::Routed { tier, model, .. } => (*tier, model.clone()),
        VerdictRoute::Unrouted => panic!("expected a routed verdict, got unrouted: {verdict:?}"),
    }
}

#[test]
fn network_action_routes_at_medium_tier() {
    // A network egress on a benign target: `stage_command_risk` raises the tier to
    // Medium. Medium is BELOW the High approval floor, so the action is allowed and
    // actually routes — letting us read the resolved routing tier off the verdict.
    let k = kernel();
    let req = GovernanceRequest::new(
        "agent-1",
        "task-1",
        GovernanceAction::Network,
        "https://api.example.com/data",
    );
    let verdict = k.decide(&req);

    assert_eq!(verdict.effect, Effect::Allow, "a benign network call should be allowed");
    assert_eq!(verdict.tier, RiskTier::Medium, "network raises the running tier to Medium");
    let (route_tier, model) = routed(&verdict);
    assert_eq!(route_tier, RiskTier::Medium, "the route tier mirrors the fused decision tier");
    // Medium maps to the medium-assurance model (ModelRoutingConfig::default()).
    assert_eq!(model, "sonnet", "Medium tier selects the medium model, got {model}");
}

#[test]
fn mcp_tool_action_routes_at_medium_tier() {
    // MCP tool invocation is the other Medium-raising action; confirm it routes the
    // same way (the fused tier is Medium, not Low).
    let k = kernel();
    let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::McpTool, "search");
    let verdict = k.decide(&req);

    assert_eq!(verdict.effect, Effect::Allow);
    let (route_tier, _) = routed(&verdict);
    assert_eq!(route_tier, RiskTier::Medium);
}

#[test]
fn benign_read_routes_at_low_tier() {
    // A plain read has no tier-raising stage: it routes at Low (the cheapest model).
    let k = kernel();
    let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "src/a.txt");
    let verdict = k.decide(&req);

    assert_eq!(verdict.effect, Effect::Allow);
    let (route_tier, model) = routed(&verdict);
    assert_eq!(route_tier, RiskTier::Low);
    assert_eq!(model, "haiku", "Low tier selects the cheapest model, got {model}");
}

#[test]
fn high_complexity_prompt_raises_the_route_tier_without_forcing_approval() {
    // Important fused-tier subtlety: complexity feeds the ROUTE tier, NOT the
    // approval gate. The approval gate keys off the action's running policy tier
    // (a plain read is Low, below the High approval floor), so a high-complexity
    // read still proceeds as `Allow`. But the route is computed from
    // `max(complexity_tier, policy_risk)` — a 5000-char prompt scores Complex
    // (-> High), so the verdict ROUTES at High and selects the highest-assurance
    // model even though the decision itself stayed an allow. A simple read of the
    // same path (no big prompt) routes at Low; this proves the complexity signal
    // is what moved the route, not the action.
    let k = kernel();
    let big_prompt = "x".repeat(5000);
    let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "src/a.txt")
        .with_context(GovernanceContext {
            messages: vec![big_prompt],
            ..Default::default()
        });
    let verdict = k.decide(&req);

    assert_eq!(
        verdict.effect,
        Effect::Allow,
        "a benign read stays an allow regardless of prompt size (complexity does not gate approval)"
    );
    let (route_tier, model) = routed(&verdict);
    assert_eq!(
        route_tier,
        RiskTier::High,
        "the complexity score lifts the fused route tier to High"
    );
    assert_eq!(
        model, "opus",
        "High route tier selects the highest-assurance model, got {model}"
    );
}

#[test]
fn denied_action_is_structurally_unrouted() {
    // A forbidden-path write is hard-denied; the verdict carries no route.
    let k = kernel();
    let req = GovernanceRequest::new(
        "agent-1",
        "task-1",
        GovernanceAction::FileWrite,
        "packages/auth/session.ts",
    );
    let verdict = k.decide(&req);

    assert_eq!(verdict.effect, Effect::Deny);
    assert!(
        matches!(verdict.route, VerdictRoute::Unrouted),
        "a denied action never routes"
    );
}
