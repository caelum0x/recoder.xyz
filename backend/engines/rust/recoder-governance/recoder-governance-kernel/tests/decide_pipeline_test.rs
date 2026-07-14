//! End-to-end decision pipeline tests against the public `GovernanceKernel` API.

use recoder_governance_kernel::{
    Effect, GovernanceAction, GovernanceContext, GovernanceHandle, GovernanceKernel,
    GovernanceKernelConfig, GovernanceRequest, VerdictRoute,
};
use recoder_governance_types::RiskTier;

fn kernel() -> GovernanceKernel {
    GovernanceKernel::new(GovernanceKernelConfig::default()).expect("default config is valid")
}

#[test]
fn permitted_read_is_allowed_and_routed() {
    let k = kernel();
    let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "src/a.txt");
    let verdict = k.decide(&req);
    assert_eq!(verdict.effect, Effect::Allow);
    assert!(matches!(verdict.route, VerdictRoute::Routed { .. }));
    assert!(!verdict.audit_hash.is_empty());
}

#[test]
fn high_tier_deploy_needs_approval() {
    let k = kernel();
    let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::Deploy, "prod");
    let verdict = k.decide(&req);
    assert_eq!(verdict.effect, Effect::NeedsApproval);
    assert!(verdict.tier >= RiskTier::High);
    assert!(matches!(verdict.route, VerdictRoute::Unrouted));
}

#[test]
fn forbidden_path_write_is_denied() {
    let k = kernel();
    let req = GovernanceRequest::new(
        "agent-1",
        "task-1",
        GovernanceAction::FileWrite,
        "packages/billing/stripe.ts",
    );
    let verdict = k.decide(&req);
    assert_eq!(verdict.effect, Effect::Deny);
    assert_eq!(verdict.tier, RiskTier::Critical);
}

#[test]
fn malformed_request_fails_closed() {
    let k = kernel();
    // Empty task -> validation failure -> deny, and still audited.
    let req = GovernanceRequest::new("agent-1", "", GovernanceAction::FileRead, "a.txt");
    let verdict = k.decide(&req);
    assert_eq!(verdict.effect, Effect::Deny);
    assert_eq!(verdict.tier, RiskTier::Critical);
    assert_eq!(k.audit_len(), 1);
}

#[test]
fn audit_hash_advances_per_decision_and_verifies() {
    let k = kernel();
    let mut hashes = Vec::new();
    for i in 0..5 {
        let target = format!("src/file_{i}.txt");
        let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, target);
        hashes.push(k.decide(&req).audit_hash);
    }
    // Every decision produced a distinct tip.
    let mut unique = hashes.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(unique.len(), hashes.len());
    assert_eq!(k.audit_len(), 5);
    assert_eq!(k.audit_tip(), *hashes.last().unwrap());
    assert!(k.verify_audit().is_ok());
}

#[test]
fn work_lock_scopes_writes() {
    let k = kernel();
    let ctx = GovernanceContext {
        enforce_work_lock: true,
        work_lock_paths: vec!["src/mine/".to_string()],
        ..Default::default()
    };
    let inside = GovernanceRequest::new(
        "agent-1",
        "task-1",
        GovernanceAction::FileWrite,
        "src/mine/ok.ts",
    )
    .with_context(ctx.clone());
    let outside = GovernanceRequest::new(
        "agent-1",
        "task-1",
        GovernanceAction::FileWrite,
        "src/theirs/no.ts",
    )
    .with_context(ctx);
    // A covered write is not denied by the work-lock (it is High tier so it
    // still needs approval); an uncovered write is hard-denied.
    assert_eq!(k.decide(&inside).effect, Effect::NeedsApproval);
    assert_eq!(k.decide(&outside).effect, Effect::Deny);
}
