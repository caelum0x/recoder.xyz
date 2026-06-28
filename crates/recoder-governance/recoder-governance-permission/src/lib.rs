//! `recoder-governance-permission` — the deny-biased permission enforcement
//! centerpiece of the Recoder governance kernel.
//!
//! This crate fuses three real upstream modules into one owned enforcement
//! surface:
//!
//! - [`policy`] (merged claw `permissions.rs`): [`policy::PermissionMode`]
//!   (`ReadOnly < WorkspaceWrite < DangerFullAccess < Prompt < Allow`),
//!   [`policy::PermissionPolicy`] with `tool_requirements` + allow/deny/ask
//!   rules, and the full [`policy::PermissionPolicy::authorize_with_context`]
//!   precedence (deny-wins, hook override, ask, mode compare, escalation).
//! - [`enforcer`] (merged claw `permission_enforcer.rs`):
//!   [`enforcer::EnforcementResult`], [`enforcer::PermissionEnforcer::check_file_write`]
//!   (workspace-boundary containment via [`workspace_boundary`]), and
//!   [`enforcer::PermissionEnforcer::check_bash`] (read-only heuristic via
//!   [`read_only_heuristic`]).
//! - [`tool_policy`] (merged openfang `tool_policy.rs`):
//!   [`tool_policy::resolve_tool_access`] with deny-wins, agent-over-global,
//!   group expansion, glob ([`glob`]), and [`depth::filter_tools_by_depth`].
//!
//! ## Unified two-stage model
//!
//! The two permission models compose: [`resolve_tool_access_then_authorize`]
//! runs the **coarse** [`tool_policy::resolve_tool_access`] over tool names
//! first; only if that allows does the **fine-grained**
//! [`policy::PermissionPolicy::authorize_with_context`] run. A denial from
//! either short-circuits — deny always wins.

pub mod depth;
pub mod enforcer;
pub mod glob;
pub mod policy;
pub mod read_only_heuristic;
pub mod rule;
pub mod rule_matcher;
pub mod tool_policy;
pub mod workspace_boundary;

pub use depth::{filter_tools_by_depth, is_subagent_tool};
pub use enforcer::{EnforcementResult, PermissionEnforcer};
pub use glob::glob_match;
pub use policy::{
    PermissionContext, PermissionMode, PermissionOutcome, PermissionOverride, PermissionPolicy,
    PermissionPromptDecision, PermissionPrompter, PermissionRequest, PermissionRuleConfig,
};
pub use read_only_heuristic::is_read_only_command;
pub use rule::{PermissionRule, PermissionRuleMatcher};
pub use tool_policy::{
    resolve_tool_access, PolicyEffect, ToolAccessResult, ToolGroup, ToolPolicy, ToolPolicyRule,
};
pub use workspace_boundary::is_within_workspace;

use policy::PermissionContext as Ctx;

/// Run the unified two-stage permission check.
///
/// 1. Coarse: [`resolve_tool_access`] over the tool name (deny-wins glob).
/// 2. Fine: [`PermissionPolicy::authorize_with_context`] (mode + rules + prompt).
///
/// A denial (or depth-exceed) from stage 1 short-circuits to a
/// [`PermissionOutcome::Deny`] without consulting the fine-grained policy.
#[must_use]
pub fn resolve_tool_access_then_authorize(
    tool_name: &str,
    input: &str,
    tool_policy: &ToolPolicy,
    depth: u32,
    permission_policy: &PermissionPolicy,
    context: &PermissionContext,
    prompter: Option<&mut dyn PermissionPrompter>,
) -> PermissionOutcome {
    match resolve_tool_access(tool_name, tool_policy, depth) {
        ToolAccessResult::Allowed => {
            permission_policy.authorize_with_context(tool_name, input, context, prompter)
        }
        ToolAccessResult::Denied {
            rule_pattern,
            source,
        } => PermissionOutcome::Deny {
            reason: format!(
                "tool '{tool_name}' denied by {source} tool-policy rule '{rule_pattern}'"
            ),
        },
        ToolAccessResult::DepthExceeded { current, max } => PermissionOutcome::Deny {
            reason: format!(
                "tool '{tool_name}' denied: subagent depth {current} exceeds max {max}"
            ),
        },
    }
}

/// Convenience wrapper with a default (empty) [`PermissionContext`].
#[must_use]
pub fn resolve_and_authorize(
    tool_name: &str,
    input: &str,
    tool_policy: &ToolPolicy,
    depth: u32,
    permission_policy: &PermissionPolicy,
    prompter: Option<&mut dyn PermissionPrompter>,
) -> PermissionOutcome {
    resolve_tool_access_then_authorize(
        tool_name,
        input,
        tool_policy,
        depth,
        permission_policy,
        &Ctx::default(),
        prompter,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coarse_deny_short_circuits_fine_grained() {
        let tool_policy = ToolPolicy {
            agent_rules: vec![ToolPolicyRule::deny("shell_exec")],
            ..Default::default()
        };
        // Even though the fine-grained policy would allow (Allow mode), the
        // coarse tool-policy deny wins.
        let perm = PermissionPolicy::new(PermissionMode::Allow);
        let outcome = resolve_and_authorize("shell_exec", "{}", &tool_policy, 0, &perm, None);
        assert!(matches!(
            outcome,
            PermissionOutcome::Deny { reason } if reason.contains("denied by agent tool-policy rule")
        ));
    }

    #[test]
    fn coarse_allow_then_fine_grained_runs() {
        let tool_policy = ToolPolicy::default(); // allow-all coarse
        let perm = PermissionPolicy::new(PermissionMode::ReadOnly)
            .with_tool_requirement("write_file", PermissionMode::WorkspaceWrite);
        // Coarse allows, fine-grained denies (ReadOnly can't escalate).
        let outcome = resolve_and_authorize("write_file", "{}", &tool_policy, 0, &perm, None);
        assert!(matches!(outcome, PermissionOutcome::Deny { .. }));
    }

    #[test]
    fn depth_exceeded_short_circuits() {
        let tool_policy = ToolPolicy {
            subagent_max_depth: 2,
            ..Default::default()
        };
        let perm = PermissionPolicy::new(PermissionMode::Allow);
        let outcome = resolve_and_authorize("agent_spawn", "{}", &tool_policy, 5, &perm, None);
        assert!(matches!(
            outcome,
            PermissionOutcome::Deny { reason } if reason.contains("exceeds max")
        ));
    }

    #[test]
    fn fully_allowed_path() {
        let tool_policy = ToolPolicy::default();
        let perm = PermissionPolicy::new(PermissionMode::Allow);
        let outcome = resolve_and_authorize("read_file", "{}", &tool_policy, 0, &perm, None);
        assert_eq!(outcome, PermissionOutcome::Allow);
    }
}
