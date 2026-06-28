//! Integration test: deny-wins precedence across the unified two-stage check.

use recoder_governance_permission::{
    resolve_and_authorize, PermissionMode, PermissionOutcome, PermissionPolicy, ToolPolicy,
    ToolPolicyRule,
};

#[test]
fn deny_wins_even_in_allow_mode() {
    // Coarse tool-policy denies shell_exec; fine-grained policy is Allow.
    let tool_policy = ToolPolicy {
        agent_rules: vec![
            ToolPolicyRule::allow("shell_*"),
            ToolPolicyRule::deny("shell_exec"),
        ],
        ..Default::default()
    };
    let perm = PermissionPolicy::new(PermissionMode::Allow);

    let denied = resolve_and_authorize("shell_exec", "{}", &tool_policy, 0, &perm, None);
    assert!(matches!(denied, PermissionOutcome::Deny { .. }));

    // A sibling tool still passes the coarse stage and is allowed.
    let allowed = resolve_and_authorize("shell_write", "{}", &tool_policy, 0, &perm, None);
    assert_eq!(allowed, PermissionOutcome::Allow);
}

#[test]
fn agent_deny_overrides_global_allow() {
    let tool_policy = ToolPolicy {
        agent_rules: vec![ToolPolicyRule::deny("web_search")],
        global_rules: vec![ToolPolicyRule::allow("web_search")],
        ..Default::default()
    };
    let perm = PermissionPolicy::new(PermissionMode::Allow);
    let outcome = resolve_and_authorize("web_search", "{}", &tool_policy, 0, &perm, None);
    assert!(matches!(outcome, PermissionOutcome::Deny { .. }));
}
