//! Multi-layer tool policy resolution (merged from openfang `tool_policy.rs`).
//!
//! Provides deny-wins, glob-pattern based tool access control with agent-level
//! and global rules, group expansion, and subagent depth restrictions. This is
//! the *coarse* gate that runs before the fine-grained [`crate::policy`] mode +
//! rule logic.

use crate::depth::is_subagent_tool;
use crate::glob::glob_match;
use serde::{Deserialize, Serialize};

/// Effect of a policy rule.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PolicyEffect {
    /// Allow the tool.
    Allow,
    /// Deny the tool.
    Deny,
}

/// A single tool policy rule with glob pattern support.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPolicyRule {
    /// Glob pattern to match tool names (e.g. `shell_*`, `web_*`, `mcp_github_*`).
    pub pattern: String,
    /// Whether to allow or deny matching tools.
    pub effect: PolicyEffect,
}

impl ToolPolicyRule {
    /// Convenience constructor for an allow rule.
    pub fn allow(pattern: impl Into<String>) -> Self {
        Self {
            pattern: pattern.into(),
            effect: PolicyEffect::Allow,
        }
    }

    /// Convenience constructor for a deny rule.
    pub fn deny(pattern: impl Into<String>) -> Self {
        Self {
            pattern: pattern.into(),
            effect: PolicyEffect::Deny,
        }
    }
}

/// Tool group — a named collection of tool patterns referenced via `@name`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolGroup {
    /// Group name (e.g. `web_tools`).
    pub name: String,
    /// Tool name patterns in this group.
    pub tools: Vec<String>,
}

/// Complete tool policy configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ToolPolicy {
    /// Agent-level rules (highest priority, checked first).
    pub agent_rules: Vec<ToolPolicyRule>,
    /// Global rules (checked after agent rules).
    pub global_rules: Vec<ToolPolicyRule>,
    /// Named tool groups for grouping patterns.
    pub groups: Vec<ToolGroup>,
    /// Maximum subagent nesting depth.
    pub subagent_max_depth: u32,
    /// Maximum concurrent subagents.
    pub subagent_max_concurrent: u32,
}

impl Default for ToolPolicy {
    fn default() -> Self {
        Self {
            agent_rules: Vec::new(),
            global_rules: Vec::new(),
            groups: Vec::new(),
            subagent_max_depth: 10,
            subagent_max_concurrent: 5,
        }
    }
}

impl ToolPolicy {
    /// Whether any allow/deny rules are configured.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.agent_rules.is_empty() && self.global_rules.is_empty()
    }
}

/// Result of a tool access check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolAccessResult {
    /// Tool is allowed.
    Allowed,
    /// Tool is denied by a specific rule.
    Denied {
        /// The pattern that denied the tool.
        rule_pattern: String,
        /// The source of the rule (`agent`, `global`, or `implicit_deny`).
        source: String,
    },
    /// Subagent depth limit exceeded.
    DepthExceeded {
        /// The current depth.
        current: u32,
        /// The configured maximum.
        max: u32,
    },
}

impl ToolAccessResult {
    /// Whether the tool is allowed.
    #[must_use]
    pub fn is_allowed(&self) -> bool {
        matches!(self, ToolAccessResult::Allowed)
    }
}

/// Resolve whether a tool is accessible given the policy and current depth.
///
/// Priority: **deny-wins**, agent rules > global rules, explicit > wildcard.
#[must_use]
pub fn resolve_tool_access(tool_name: &str, policy: &ToolPolicy, depth: u32) -> ToolAccessResult {
    // Check depth limit for subagent-spawning tools.
    if is_subagent_tool(tool_name) && depth > policy.subagent_max_depth {
        return ToolAccessResult::DepthExceeded {
            current: depth,
            max: policy.subagent_max_depth,
        };
    }

    // Expand groups: which `@group` pseudo-names does this tool belong to?
    let expanded_tool_names = expand_groups(tool_name, &policy.groups);

    // Phase 1: agent deny rules win first.
    for rule in &policy.agent_rules {
        if rule.effect == PolicyEffect::Deny
            && matches_pattern(&rule.pattern, tool_name, &expanded_tool_names)
        {
            return ToolAccessResult::Denied {
                rule_pattern: rule.pattern.clone(),
                source: "agent".to_string(),
            };
        }
    }

    // Phase 2: global deny rules.
    for rule in &policy.global_rules {
        if rule.effect == PolicyEffect::Deny
            && matches_pattern(&rule.pattern, tool_name, &expanded_tool_names)
        {
            return ToolAccessResult::Denied {
                rule_pattern: rule.pattern.clone(),
                source: "global".to_string(),
            };
        }
    }

    // Phase 3: if any allow rules exist, the tool must match at least one.
    let has_allow_rules = policy
        .agent_rules
        .iter()
        .any(|r| r.effect == PolicyEffect::Allow)
        || policy
            .global_rules
            .iter()
            .any(|r| r.effect == PolicyEffect::Allow);

    if has_allow_rules {
        let allowed = policy
            .agent_rules
            .iter()
            .chain(policy.global_rules.iter())
            .any(|r| {
                r.effect == PolicyEffect::Allow
                    && matches_pattern(&r.pattern, tool_name, &expanded_tool_names)
            });

        if allowed {
            return ToolAccessResult::Allowed;
        }

        return ToolAccessResult::Denied {
            rule_pattern: "(not in any allow list)".to_string(),
            source: "implicit_deny".to_string(),
        };
    }

    // No rules configured — allow by default.
    ToolAccessResult::Allowed
}

/// Expand groups: returns the tool name plus `@group` pseudo-names it belongs to.
fn expand_groups(tool_name: &str, groups: &[ToolGroup]) -> Vec<String> {
    let mut expanded = vec![tool_name.to_string()];
    for group in groups {
        if group
            .tools
            .iter()
            .any(|pattern| glob_match(pattern, tool_name))
        {
            expanded.push(format!("@{}", group.name));
        }
    }
    expanded
}

/// Match a rule pattern against the tool name or its expanded group names.
fn matches_pattern(pattern: &str, tool_name: &str, expanded: &[String]) -> bool {
    if glob_match(pattern, tool_name) {
        return true;
    }
    if pattern.starts_with('@') {
        return expanded.iter().any(|e| e == pattern);
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deny_wins_over_allow() {
        let policy = ToolPolicy {
            agent_rules: vec![
                ToolPolicyRule::allow("shell_*"),
                ToolPolicyRule::deny("shell_exec"),
            ],
            ..Default::default()
        };

        assert!(matches!(
            resolve_tool_access("shell_exec", &policy, 0),
            ToolAccessResult::Denied { .. }
        ));
        // shell_write is still allowed by the wildcard.
        assert_eq!(
            resolve_tool_access("shell_write", &policy, 0),
            ToolAccessResult::Allowed
        );
    }

    #[test]
    fn agent_rules_override_global() {
        let policy = ToolPolicy {
            agent_rules: vec![ToolPolicyRule::deny("web_search")],
            global_rules: vec![ToolPolicyRule::allow("web_search")],
            ..Default::default()
        };
        let result = resolve_tool_access("web_search", &policy, 0);
        match result {
            ToolAccessResult::Denied { source, .. } => assert_eq!(source, "agent"),
            other => panic!("expected agent deny, got {other:?}"),
        }
    }

    #[test]
    fn group_expansion_deny() {
        let policy = ToolPolicy {
            agent_rules: vec![ToolPolicyRule::deny("@web_tools")],
            groups: vec![ToolGroup {
                name: "web_tools".to_string(),
                tools: vec!["web_*".to_string()],
            }],
            ..Default::default()
        };
        assert!(matches!(
            resolve_tool_access("web_search", &policy, 0),
            ToolAccessResult::Denied { .. }
        ));
        assert_eq!(
            resolve_tool_access("shell_exec", &policy, 0),
            ToolAccessResult::Allowed
        );
    }

    #[test]
    fn depth_restriction_for_subagent_tools() {
        let policy = ToolPolicy {
            subagent_max_depth: 3,
            ..Default::default()
        };
        assert!(matches!(
            resolve_tool_access("agent_spawn", &policy, 4),
            ToolAccessResult::DepthExceeded { .. }
        ));
        assert_eq!(
            resolve_tool_access("agent_spawn", &policy, 2),
            ToolAccessResult::Allowed
        );
    }

    #[test]
    fn no_rules_allows_all() {
        let policy = ToolPolicy::default();
        assert_eq!(
            resolve_tool_access("anything", &policy, 0),
            ToolAccessResult::Allowed
        );
    }

    #[test]
    fn implicit_deny_when_allow_rules_exist() {
        let policy = ToolPolicy {
            agent_rules: vec![ToolPolicyRule::allow("web_*")],
            ..Default::default()
        };
        assert_eq!(
            resolve_tool_access("web_search", &policy, 0),
            ToolAccessResult::Allowed
        );
        match resolve_tool_access("shell_exec", &policy, 0) {
            ToolAccessResult::Denied { source, .. } => assert_eq!(source, "implicit_deny"),
            other => panic!("expected implicit deny, got {other:?}"),
        }
    }

    #[test]
    fn default_depths() {
        let policy = ToolPolicy::default();
        assert_eq!(policy.subagent_max_depth, 10);
        assert_eq!(policy.subagent_max_concurrent, 5);
        assert!(policy.is_empty());
    }
}
