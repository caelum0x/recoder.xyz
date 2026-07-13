//! The ordered decision pipeline — the canonical fusion of the TS
//! `evaluatePolicy` chain with the Rust enforcers.
//!
//! Stage order (each stage short-circuits to `Deny`/`NeedsApproval` on a hard
//! outcome):
//!
//! ```text
//! validate -> secret-access -> forbidden-path -> work-lock -> approval-required
//!   -> command/mcp risk -> tool_policy.resolve_tool_access
//!   -> permission.authorize_with_context -> routing.risk_tier_router
//!   -> audit.record -> verdict
//! ```
//!
//! ## Fail-closed
//!
//! The pipeline never returns an `allow` on an internal fault. Validation
//! failure, a poisoned input, or any stage error converts to an
//! [`Effect::Deny`] verdict with a **sanitized** reason; the detailed context is
//! returned to the kernel for server-side logging via the recorded audit entry.

use crate::config::GovernanceKernelConfig;
use crate::request::{GovernanceAction, GovernanceRequest};
use crate::verdict::{Effect, GovernanceVerdict, VerdictRoute};
use recoder_governance_approval::classify_tier;
use recoder_governance_audit::AuditLog;
use recoder_governance_permission::{
    resolve_tool_access_then_authorize, PermissionContext, PermissionOutcome, PermissionPolicy,
    PermissionPrompter, ToolPolicy,
};
use recoder_governance_routing::{
    route as route_action, ModelRouter, ScoringInput, TaskComplexity,
};
use recoder_governance_types::{AuditAction, AuditInput, AuditOutcome, RiskTier};

/// The immutable policy inputs the pipeline reads. Borrowed from kernel state so
/// a hot-reload swaps the whole bundle atomically under the kernel's `RwLock`.
pub struct PipelineInputs<'a> {
    /// The kernel config (forbidden/secret paths, approval tier, routing).
    pub config: &'a GovernanceKernelConfig,
    /// The coarse tool-access policy (deny-wins glob).
    pub tool_policy: &'a ToolPolicy,
    /// The fine-grained permission policy (mode + rules).
    pub permission_policy: &'a PermissionPolicy,
    /// The complexity-scoring model router.
    pub router: &'a ModelRouter,
}

/// The outcome of a single short-circuiting stage.
enum StageOutcome {
    /// Continue to the next stage, carrying the running risk tier.
    Continue(RiskTier),
    /// Short-circuit with a terminal effect + reason + final tier.
    Terminal {
        effect: Effect,
        tier: RiskTier,
        reason: String,
    },
}

/// Run the full pipeline. Records exactly one audit entry (the decision) and
/// returns the verdict whose `audit_hash` is the new chain tip.
///
/// `timestamp` is injected by the caller (the audit chain never reads the clock)
/// so the decision is deterministic and testable. `prompter` is an optional
/// interactive permission prompter forwarded to the fine-grained stage.
#[must_use]
pub fn decide(
    inputs: &PipelineInputs<'_>,
    req: &GovernanceRequest,
    timestamp: &str,
    prompter: Option<&mut dyn PermissionPrompter>,
    audit: &mut AuditLog,
) -> GovernanceVerdict {
    let (effect, tier, reason, route) = run_stages(inputs, req, prompter);

    let outcome = match effect {
        Effect::Allow => AuditOutcome::Allow,
        Effect::NeedsApproval => AuditOutcome::NeedsApproval,
        Effect::Deny => AuditOutcome::Deny,
    };

    // Record the decision. The detail is secret-free: action + target + tier.
    let detail = format!(
        "{} {} tier={}",
        req.action.as_str(),
        req.target,
        tier.as_str()
    );
    let audit_hash = audit.append(AuditInput::new(
        timestamp,
        req.actor.clone(),
        AuditAction::DecisionMade,
        detail,
        outcome,
    ));

    GovernanceVerdict::new(effect, tier, route, reason, audit_hash)
}

/// Execute the ordered stages, returning the terminal `(effect, tier, reason,
/// route)`. Pure (no audit side effect) so it can be reasoned about in isolation.
fn run_stages(
    inputs: &PipelineInputs<'_>,
    req: &GovernanceRequest,
    prompter: Option<&mut dyn PermissionPrompter>,
) -> (Effect, RiskTier, String, VerdictRoute) {
    // Stage 0: validate (fail-closed -> Deny).
    if let Err(err) = req.validate() {
        return (
            Effect::Deny,
            RiskTier::Critical,
            format!("request rejected: {err}"),
            VerdictRoute::Unrouted,
        );
    }

    let config = inputs.config;
    let tool = req.effective_tool_name();

    // The running risk tier starts at the tool's classified tier.
    let mut tier = classify_tier(tool);

    // Stage 1: secret-access. Touching a secret path forces Critical + approval.
    let secret = config.is_secret_path(&req.target) || config.is_secret_path(tool);
    if secret {
        tier = tier.max(RiskTier::Critical);
    }

    // The hard-deny stages run first (deny always wins, even over a later
    // needs-approval): forbidden-path -> work-lock. command-risk only raises the
    // running tier, it never short-circuits.
    let deny_stages: [fn(&PipelineInputs<'_>, &GovernanceRequest, RiskTier) -> StageOutcome; 3] =
        [stage_forbidden_path, stage_work_lock, stage_command_risk];
    for stage in deny_stages {
        match stage(inputs, req, tier) {
            StageOutcome::Continue(next_tier) => tier = next_tier,
            StageOutcome::Terminal {
                effect,
                tier,
                reason,
            } => {
                return (effect, tier, reason, VerdictRoute::Unrouted);
            }
        }
    }

    // Coarse tool-policy + fine-grained permission (deny-wins). This runs before
    // the approval gate so a hard tool/permission deny is never softened into a
    // needs-approval — deny always wins.
    let perm_outcome = resolve_tool_access_then_authorize(
        tool,
        &req.context.tool_input,
        inputs.tool_policy,
        req.context.depth,
        inputs.permission_policy,
        &PermissionContext::default(),
        prompter,
    );
    if let PermissionOutcome::Deny { reason } = perm_outcome {
        return (Effect::Deny, tier, reason, VerdictRoute::Unrouted);
    }

    // Approval-required: a delivery boundary or a high+ tier needs approval.
    if let StageOutcome::Terminal {
        effect,
        tier,
        reason,
    } = stage_approval_required(inputs, req, tier)
    {
        return (effect, tier, reason, VerdictRoute::Unrouted);
    }

    // Secret access that survived the enforcement gate still needs approval.
    if secret {
        return (
            Effect::NeedsApproval,
            tier,
            format!("secret access to '{}' requires approval", req.target),
            VerdictRoute::Unrouted,
        );
    }

    // Stage: routing (fuse complexity with the running tier).
    let complexity = score_complexity(inputs.router, req);
    let route_decision = route_action(inputs.router, complexity, tier, false);
    let route: VerdictRoute = route_decision.into();

    (
        Effect::Allow,
        tier,
        format!("{} on '{}' allowed", req.action.as_str(), req.target),
        route,
    )
}

/// Stage: deny writes to forbidden (auth/billing/security) paths.
fn stage_forbidden_path(
    inputs: &PipelineInputs<'_>,
    req: &GovernanceRequest,
    tier: RiskTier,
) -> StageOutcome {
    if is_write_action(req.action) && inputs.config.is_forbidden_path(&req.target) {
        return StageOutcome::Terminal {
            effect: Effect::Deny,
            tier: RiskTier::Critical,
            reason: format!(
                "write to forbidden path '{}' is denied (auth/billing/security boundary)",
                req.target
            ),
        };
    }
    StageOutcome::Continue(tier)
}

/// Stage: deny writes outside the held work-lock paths.
fn stage_work_lock(
    _inputs: &PipelineInputs<'_>,
    req: &GovernanceRequest,
    tier: RiskTier,
) -> StageOutcome {
    if is_write_action(req.action) && req.context.enforce_work_lock {
        let covered = req
            .context
            .work_lock_paths
            .iter()
            .any(|locked| req.target.starts_with(locked.as_str()));
        if !covered {
            return StageOutcome::Terminal {
                effect: Effect::Deny,
                tier: tier.max(RiskTier::High),
                reason: format!(
                    "write to '{}' is outside the held work-lock and is denied",
                    req.target
                ),
            };
        }
    }
    StageOutcome::Continue(tier)
}

/// Stage: raise the tier for risky commands / MCP tools.
fn stage_command_risk(
    _inputs: &PipelineInputs<'_>,
    req: &GovernanceRequest,
    tier: RiskTier,
) -> StageOutcome {
    let raised = match req.action {
        GovernanceAction::Command => {
            // Destructive shell verbs push to Critical; otherwise High.
            if command_is_destructive(&req.context.tool_input) {
                tier.max(RiskTier::Critical)
            } else {
                tier.max(RiskTier::High)
            }
        }
        GovernanceAction::McpTool | GovernanceAction::Network => tier.max(RiskTier::Medium),
        _ => tier,
    };
    StageOutcome::Continue(raised)
}

/// Stage: a delivery boundary or a high+ tier requires human approval.
fn stage_approval_required(
    inputs: &PipelineInputs<'_>,
    req: &GovernanceRequest,
    tier: RiskTier,
) -> StageOutcome {
    let needs = req.action.is_delivery_boundary() || tier >= inputs.config.approval_tier;
    if needs {
        // A delivery boundary always reaches at least High.
        let tier = if req.action.is_delivery_boundary() {
            tier.max(RiskTier::High)
        } else {
            tier
        };
        return StageOutcome::Terminal {
            effect: Effect::NeedsApproval,
            tier,
            reason: format!(
                "{} on '{}' requires approval (tier={})",
                req.action.as_str(),
                req.target,
                tier.as_str()
            ),
        };
    }
    StageOutcome::Continue(tier)
}

/// Whether an action mutates state.
fn is_write_action(action: GovernanceAction) -> bool {
    matches!(
        action,
        GovernanceAction::FileWrite
            | GovernanceAction::FileDelete
            | GovernanceAction::MemoryWrite
            | GovernanceAction::Deploy
            | GovernanceAction::Push
    )
}

/// Cheap, conservative destructive-command heuristic.
fn command_is_destructive(input: &str) -> bool {
    const MARKERS: &[&str] = &["rm -rf", "rm -r", "drop table", "git push --force", ":(){"];
    let lower = input.to_ascii_lowercase();
    MARKERS.iter().any(|m| lower.contains(m))
}

/// Score the request's complexity from its context messages + tool count.
fn score_complexity(router: &ModelRouter, req: &GovernanceRequest) -> TaskComplexity {
    let input = ScoringInput::from_messages(req.context.messages.clone()).with_tools(
        if req.context.tool_name.is_empty() {
            0
        } else {
            1
        },
    );
    router.score(&input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::request::GovernanceContext;
    use recoder_governance_permission::{PermissionMode, ToolPolicyRule};

    fn inputs<'a>(
        config: &'a GovernanceKernelConfig,
        tool_policy: &'a ToolPolicy,
        permission_policy: &'a PermissionPolicy,
        router: &'a ModelRouter,
    ) -> PipelineInputs<'a> {
        PipelineInputs {
            config,
            tool_policy,
            permission_policy,
            router,
        }
    }

    fn router() -> ModelRouter {
        ModelRouter::new(Default::default())
    }

    #[test]
    fn permitted_read_is_allowed_and_routed() {
        let config = GovernanceKernelConfig::default();
        let tp = ToolPolicy::default();
        let perm = PermissionPolicy::new(PermissionMode::Allow);
        let r = router();
        let pin = inputs(&config, &tp, &perm, &r);
        let mut audit = AuditLog::new();

        let req =
            GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "src/a.txt");
        let verdict = decide(&pin, &req, "2026-06-29T00:00:00Z", None, &mut audit);

        assert_eq!(verdict.effect, Effect::Allow);
        assert!(matches!(verdict.route, VerdictRoute::Routed { .. }));
        assert_eq!(audit.len(), 1);
    }

    #[test]
    fn forbidden_path_write_is_denied() {
        let config = GovernanceKernelConfig::default();
        let tp = ToolPolicy::default();
        let perm = PermissionPolicy::new(PermissionMode::Allow);
        let r = router();
        let pin = inputs(&config, &tp, &perm, &r);
        let mut audit = AuditLog::new();

        let req = GovernanceRequest::new(
            "agent-1",
            "task-1",
            GovernanceAction::FileWrite,
            "packages/auth/session.ts",
        );
        let verdict = decide(&pin, &req, "2026-06-29T00:00:00Z", None, &mut audit);
        assert_eq!(verdict.effect, Effect::Deny);
        assert!(verdict.reason.contains("forbidden path"));
        assert_eq!(verdict.tier, RiskTier::Critical);
    }

    #[test]
    fn deny_glob_tool_is_denied() {
        let config = GovernanceKernelConfig::default();
        let tp = ToolPolicy {
            agent_rules: vec![ToolPolicyRule::deny("shell_*")],
            ..Default::default()
        };
        let perm = PermissionPolicy::new(PermissionMode::Allow);
        let r = router();
        let pin = inputs(&config, &tp, &perm, &r);
        let mut audit = AuditLog::new();

        let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::ToolUse, "x")
            .with_context(GovernanceContext {
                tool_name: "shell_exec".to_string(),
                ..Default::default()
            });
        let verdict = decide(&pin, &req, "2026-06-29T00:00:00Z", None, &mut audit);
        assert_eq!(verdict.effect, Effect::Deny);
        assert!(verdict.reason.contains("denied by agent tool-policy"));
    }

    #[test]
    fn high_tier_action_needs_approval() {
        let config = GovernanceKernelConfig::default();
        let tp = ToolPolicy::default();
        let perm = PermissionPolicy::new(PermissionMode::Allow);
        let r = router();
        let pin = inputs(&config, &tp, &perm, &r);
        let mut audit = AuditLog::new();

        // A push is a delivery boundary -> needs approval.
        let req =
            GovernanceRequest::new("agent-1", "task-1", GovernanceAction::Push, "origin/main");
        let verdict = decide(&pin, &req, "2026-06-29T00:00:00Z", None, &mut audit);
        assert_eq!(verdict.effect, Effect::NeedsApproval);
        assert!(verdict.tier >= RiskTier::High);
    }

    #[test]
    fn work_lock_violation_is_denied() {
        let config = GovernanceKernelConfig::default();
        let tp = ToolPolicy::default();
        let perm = PermissionPolicy::new(PermissionMode::Allow);
        let r = router();
        let pin = inputs(&config, &tp, &perm, &r);
        let mut audit = AuditLog::new();

        let req = GovernanceRequest::new(
            "agent-1",
            "task-1",
            GovernanceAction::FileWrite,
            "src/other/file.ts",
        )
        .with_context(GovernanceContext {
            enforce_work_lock: true,
            work_lock_paths: vec!["src/mine/".to_string()],
            ..Default::default()
        });
        let verdict = decide(&pin, &req, "2026-06-29T00:00:00Z", None, &mut audit);
        assert_eq!(verdict.effect, Effect::Deny);
        assert!(verdict.reason.contains("work-lock"));
    }

    #[test]
    fn secret_access_needs_approval() {
        let config = GovernanceKernelConfig::default();
        let tp = ToolPolicy::default();
        let perm = PermissionPolicy::new(PermissionMode::Allow);
        let r = router();
        let pin = inputs(&config, &tp, &perm, &r);
        let mut audit = AuditLog::new();

        let req = GovernanceRequest::new(
            "agent-1",
            "task-1",
            GovernanceAction::FileRead,
            "/home/u/.ssh/id_rsa",
        );
        let verdict = decide(&pin, &req, "2026-06-29T00:00:00Z", None, &mut audit);
        assert_eq!(verdict.effect, Effect::NeedsApproval);
        assert_eq!(verdict.tier, RiskTier::Critical);
    }

    #[test]
    fn malformed_request_fails_closed() {
        let config = GovernanceKernelConfig::default();
        let tp = ToolPolicy::default();
        let perm = PermissionPolicy::new(PermissionMode::Allow);
        let r = router();
        let pin = inputs(&config, &tp, &perm, &r);
        let mut audit = AuditLog::new();

        // Empty actor -> validation failure -> fail-closed deny.
        let req = GovernanceRequest::new("", "task-1", GovernanceAction::FileRead, "src/a.txt");
        let verdict = decide(&pin, &req, "2026-06-29T00:00:00Z", None, &mut audit);
        assert_eq!(verdict.effect, Effect::Deny);
        assert_eq!(verdict.tier, RiskTier::Critical);
        assert!(verdict.reason.contains("request rejected"));
        // Even a fail-closed deny is audited.
        assert_eq!(audit.len(), 1);
    }
}
