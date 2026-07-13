//! Fine-grained permission policy (merged from claw `permissions.rs`).
//!
//! [`PermissionMode`] orders the trust levels; [`PermissionPolicy`] holds the
//! active mode, per-tool requirements, and allow/deny/ask rules; and
//! [`PermissionPolicy::authorize_with_context`] applies the full precedence:
//!
//! 1. **deny rules win** (hard deny),
//! 2. **hook override** (`Deny` short-circuits, `Ask` forces a prompt, `Allow`
//!    still respects ask rules),
//! 3. **ask rules** force a prompt,
//! 4. **allow rule / mode comparison** allows,
//! 5. **escalation prompt-or-deny**, else **deny**.

use crate::rule::PermissionRule;
use std::collections::BTreeMap;

/// Permission trust mode. Ordering is load-bearing:
/// `ReadOnly < WorkspaceWrite < DangerFullAccess < Prompt < Allow`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum PermissionMode {
    /// Read-only: no writes, only read-only bash.
    ReadOnly,
    /// May write inside the workspace boundary.
    WorkspaceWrite,
    /// May write anywhere and run any command.
    DangerFullAccess,
    /// Defer to an interactive prompt for escalations.
    Prompt,
    /// Allow everything (trusted/autonomous).
    Allow,
}

impl PermissionMode {
    /// The canonical kebab-case wire string.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReadOnly => "read-only",
            Self::WorkspaceWrite => "workspace-write",
            Self::DangerFullAccess => "danger-full-access",
            Self::Prompt => "prompt",
            Self::Allow => "allow",
        }
    }
}

/// A hook-supplied override of the normal permission flow.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionOverride {
    /// Force allow (still subject to ask rules).
    Allow,
    /// Force deny (short-circuits everything).
    Deny,
    /// Force a prompt.
    Ask,
}

/// Context carrying an optional hook override decision and reason.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PermissionContext {
    override_decision: Option<PermissionOverride>,
    override_reason: Option<String>,
}

impl PermissionContext {
    /// Construct a context from an optional override + reason.
    #[must_use]
    pub fn new(
        override_decision: Option<PermissionOverride>,
        override_reason: Option<String>,
    ) -> Self {
        Self {
            override_decision,
            override_reason,
        }
    }

    /// The override decision, if any.
    #[must_use]
    pub fn override_decision(&self) -> Option<PermissionOverride> {
        self.override_decision
    }

    /// The override reason, if any.
    #[must_use]
    pub fn override_reason(&self) -> Option<&str> {
        self.override_reason.as_deref()
    }
}

/// A request presented to a [`PermissionPrompter`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PermissionRequest {
    /// The tool being authorized.
    pub tool_name: String,
    /// The raw tool input.
    pub input: String,
    /// The currently active mode.
    pub current_mode: PermissionMode,
    /// The mode the tool requires.
    pub required_mode: PermissionMode,
    /// Why a prompt was triggered, if known.
    pub reason: Option<String>,
}

/// The decision returned by an interactive prompter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PermissionPromptDecision {
    /// The operator allowed the action.
    Allow,
    /// The operator denied the action with a reason.
    Deny {
        /// The denial reason.
        reason: String,
    },
}

/// An interactive permission prompter (e.g. a human in the control plane).
pub trait PermissionPrompter {
    /// Decide on a pending permission request.
    fn decide(&mut self, request: &PermissionRequest) -> PermissionPromptDecision;
}

/// The outcome of authorizing a tool invocation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PermissionOutcome {
    /// The tool may run.
    Allow,
    /// The tool is denied with a reason.
    Deny {
        /// The denial reason.
        reason: String,
    },
}

/// Allow/deny/ask rule sets parsed from raw strings.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PermissionRuleConfig {
    /// Raw allow rule strings.
    pub allow: Vec<String>,
    /// Raw deny rule strings.
    pub deny: Vec<String>,
    /// Raw ask rule strings.
    pub ask: Vec<String>,
}

impl PermissionRuleConfig {
    /// Construct a rule config from raw allow/deny/ask lists.
    #[must_use]
    pub fn new(allow: Vec<String>, deny: Vec<String>, ask: Vec<String>) -> Self {
        Self { allow, deny, ask }
    }
}

/// The fine-grained permission policy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PermissionPolicy {
    active_mode: PermissionMode,
    tool_requirements: BTreeMap<String, PermissionMode>,
    allow_rules: Vec<PermissionRule>,
    deny_rules: Vec<PermissionRule>,
    ask_rules: Vec<PermissionRule>,
}

impl PermissionPolicy {
    /// Create a policy with the given active mode and no rules.
    #[must_use]
    pub fn new(active_mode: PermissionMode) -> Self {
        Self {
            active_mode,
            tool_requirements: BTreeMap::new(),
            allow_rules: Vec::new(),
            deny_rules: Vec::new(),
            ask_rules: Vec::new(),
        }
    }

    /// Set the mode a specific tool requires.
    #[must_use]
    pub fn with_tool_requirement(
        mut self,
        tool_name: impl Into<String>,
        required_mode: PermissionMode,
    ) -> Self {
        self.tool_requirements
            .insert(tool_name.into(), required_mode);
        self
    }

    /// Parse and attach allow/deny/ask rules.
    #[must_use]
    pub fn with_permission_rules(mut self, config: &PermissionRuleConfig) -> Self {
        self.allow_rules = config
            .allow
            .iter()
            .map(|r| PermissionRule::parse(r))
            .collect();
        self.deny_rules = config
            .deny
            .iter()
            .map(|r| PermissionRule::parse(r))
            .collect();
        self.ask_rules = config
            .ask
            .iter()
            .map(|r| PermissionRule::parse(r))
            .collect();
        self
    }

    /// The active mode.
    #[must_use]
    pub fn active_mode(&self) -> PermissionMode {
        self.active_mode
    }

    /// The mode required for `tool_name` (defaults to [`PermissionMode::DangerFullAccess`]).
    #[must_use]
    pub fn required_mode_for(&self, tool_name: &str) -> PermissionMode {
        self.tool_requirements
            .get(tool_name)
            .copied()
            .unwrap_or(PermissionMode::DangerFullAccess)
    }

    /// Authorize without a hook context.
    #[must_use]
    pub fn authorize(
        &self,
        tool_name: &str,
        input: &str,
        prompter: Option<&mut dyn PermissionPrompter>,
    ) -> PermissionOutcome {
        self.authorize_with_context(tool_name, input, &PermissionContext::default(), prompter)
    }

    /// Authorize a tool invocation under the full precedence chain.
    #[must_use]
    pub fn authorize_with_context(
        &self,
        tool_name: &str,
        input: &str,
        context: &PermissionContext,
        prompter: Option<&mut dyn PermissionPrompter>,
    ) -> PermissionOutcome {
        // 1. Deny rules win — hard deny, ignoring everything else.
        if let Some(rule) = Self::find_matching_rule(&self.deny_rules, tool_name, input) {
            return PermissionOutcome::Deny {
                reason: format!(
                    "Permission to use {tool_name} has been denied by rule '{}'",
                    rule.raw()
                ),
            };
        }

        let current_mode = self.active_mode();
        let required_mode = self.required_mode_for(tool_name);
        let ask_rule = Self::find_matching_rule(&self.ask_rules, tool_name, input);
        let allow_rule = Self::find_matching_rule(&self.allow_rules, tool_name, input);

        // 2. Hook override.
        match context.override_decision() {
            Some(PermissionOverride::Deny) => {
                return PermissionOutcome::Deny {
                    reason: context.override_reason().map_or_else(
                        || format!("tool '{tool_name}' denied by hook"),
                        ToOwned::to_owned,
                    ),
                };
            }
            Some(PermissionOverride::Ask) => {
                let reason = context.override_reason().map_or_else(
                    || format!("tool '{tool_name}' requires approval due to hook guidance"),
                    ToOwned::to_owned,
                );
                return Self::prompt_or_deny(
                    tool_name,
                    input,
                    current_mode,
                    required_mode,
                    Some(reason),
                    prompter,
                );
            }
            Some(PermissionOverride::Allow) => {
                // Even a hook-allow must respect ask rules.
                if let Some(rule) = ask_rule {
                    let reason = format!(
                        "tool '{tool_name}' requires approval due to ask rule '{}'",
                        rule.raw()
                    );
                    return Self::prompt_or_deny(
                        tool_name,
                        input,
                        current_mode,
                        required_mode,
                        Some(reason),
                        prompter,
                    );
                }
                if allow_rule.is_some()
                    || current_mode == PermissionMode::Allow
                    || current_mode >= required_mode
                {
                    return PermissionOutcome::Allow;
                }
            }
            None => {}
        }

        // 3. Ask rules force a prompt.
        if let Some(rule) = ask_rule {
            let reason = format!(
                "tool '{tool_name}' requires approval due to ask rule '{}'",
                rule.raw()
            );
            return Self::prompt_or_deny(
                tool_name,
                input,
                current_mode,
                required_mode,
                Some(reason),
                prompter,
            );
        }

        // 4. Allow rule or mode comparison.
        if allow_rule.is_some()
            || current_mode == PermissionMode::Allow
            || current_mode >= required_mode
        {
            return PermissionOutcome::Allow;
        }

        // 5. Escalation prompt-or-deny.
        if current_mode == PermissionMode::Prompt
            || (current_mode == PermissionMode::WorkspaceWrite
                && required_mode == PermissionMode::DangerFullAccess)
        {
            let reason = Some(format!(
                "tool '{tool_name}' requires approval to escalate from {} to {}",
                current_mode.as_str(),
                required_mode.as_str()
            ));
            return Self::prompt_or_deny(
                tool_name,
                input,
                current_mode,
                required_mode,
                reason,
                prompter,
            );
        }

        PermissionOutcome::Deny {
            reason: format!(
                "tool '{tool_name}' requires {} permission; current mode is {}",
                required_mode.as_str(),
                current_mode.as_str()
            ),
        }
    }

    fn prompt_or_deny(
        tool_name: &str,
        input: &str,
        current_mode: PermissionMode,
        required_mode: PermissionMode,
        reason: Option<String>,
        mut prompter: Option<&mut dyn PermissionPrompter>,
    ) -> PermissionOutcome {
        let request = PermissionRequest {
            tool_name: tool_name.to_string(),
            input: input.to_string(),
            current_mode,
            required_mode,
            reason: reason.clone(),
        };

        match prompter.as_mut() {
            Some(prompter) => match prompter.decide(&request) {
                PermissionPromptDecision::Allow => PermissionOutcome::Allow,
                PermissionPromptDecision::Deny { reason } => PermissionOutcome::Deny { reason },
            },
            None => PermissionOutcome::Deny {
                reason: reason.unwrap_or_else(|| {
                    format!(
                        "tool '{tool_name}' requires approval to run while mode is {}",
                        current_mode.as_str()
                    )
                }),
            },
        }
    }

    fn find_matching_rule<'a>(
        rules: &'a [PermissionRule],
        tool_name: &str,
        input: &str,
    ) -> Option<&'a PermissionRule> {
        rules.iter().find(|rule| rule.matches(tool_name, input))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct RecordingPrompter {
        seen: Vec<PermissionRequest>,
        allow: bool,
    }

    impl PermissionPrompter for RecordingPrompter {
        fn decide(&mut self, request: &PermissionRequest) -> PermissionPromptDecision {
            self.seen.push(request.clone());
            if self.allow {
                PermissionPromptDecision::Allow
            } else {
                PermissionPromptDecision::Deny {
                    reason: "not now".to_string(),
                }
            }
        }
    }

    #[test]
    fn mode_ordering_is_load_bearing() {
        assert!(PermissionMode::ReadOnly < PermissionMode::WorkspaceWrite);
        assert!(PermissionMode::WorkspaceWrite < PermissionMode::DangerFullAccess);
        assert!(PermissionMode::DangerFullAccess < PermissionMode::Prompt);
        assert!(PermissionMode::Prompt < PermissionMode::Allow);
    }

    #[test]
    fn allows_when_active_mode_meets_requirement() {
        let policy = PermissionPolicy::new(PermissionMode::WorkspaceWrite)
            .with_tool_requirement("read_file", PermissionMode::ReadOnly)
            .with_tool_requirement("write_file", PermissionMode::WorkspaceWrite);
        assert_eq!(
            policy.authorize("read_file", "{}", None),
            PermissionOutcome::Allow
        );
        assert_eq!(
            policy.authorize("write_file", "{}", None),
            PermissionOutcome::Allow
        );
    }

    #[test]
    fn denies_read_only_escalations_without_prompt() {
        let policy = PermissionPolicy::new(PermissionMode::ReadOnly)
            .with_tool_requirement("write_file", PermissionMode::WorkspaceWrite)
            .with_tool_requirement("bash", PermissionMode::DangerFullAccess);
        assert!(matches!(
            policy.authorize("write_file", "{}", None),
            PermissionOutcome::Deny { reason } if reason.contains("requires workspace-write permission")
        ));
        assert!(matches!(
            policy.authorize("bash", "{}", None),
            PermissionOutcome::Deny { reason } if reason.contains("requires danger-full-access permission")
        ));
    }

    #[test]
    fn deny_rule_wins_over_everything() {
        let rules = PermissionRuleConfig::new(
            vec!["bash(rm:*)".to_string()], // allow even rm
            vec!["bash(rm:*)".to_string()], // but deny rm
            Vec::new(),
        );
        let policy = PermissionPolicy::new(PermissionMode::Allow)
            .with_tool_requirement("bash", PermissionMode::DangerFullAccess)
            .with_permission_rules(&rules);
        // Deny-wins: even in Allow mode with a matching allow rule, deny wins.
        assert!(matches!(
            policy.authorize("bash", r#"{"command":"rm -rf /"}"#, None),
            PermissionOutcome::Deny { reason } if reason.contains("denied by rule")
        ));
    }

    #[test]
    fn rule_based_allow() {
        let rules = PermissionRuleConfig::new(
            vec!["bash(git:*)".to_string()],
            vec!["bash(rm -rf:*)".to_string()],
            Vec::new(),
        );
        let policy = PermissionPolicy::new(PermissionMode::ReadOnly)
            .with_tool_requirement("bash", PermissionMode::DangerFullAccess)
            .with_permission_rules(&rules);
        assert_eq!(
            policy.authorize("bash", r#"{"command":"git status"}"#, None),
            PermissionOutcome::Allow
        );
    }

    #[test]
    fn prompts_for_workspace_write_to_danger_escalation() {
        let policy = PermissionPolicy::new(PermissionMode::WorkspaceWrite)
            .with_tool_requirement("bash", PermissionMode::DangerFullAccess);
        let mut prompter = RecordingPrompter {
            seen: Vec::new(),
            allow: true,
        };
        let outcome = policy.authorize("bash", "echo hi", Some(&mut prompter));
        assert_eq!(outcome, PermissionOutcome::Allow);
        assert_eq!(prompter.seen.len(), 1);
        assert_eq!(
            prompter.seen[0].current_mode,
            PermissionMode::WorkspaceWrite
        );
        assert_eq!(
            prompter.seen[0].required_mode,
            PermissionMode::DangerFullAccess
        );
    }

    #[test]
    fn honors_prompt_rejection_reason() {
        let policy = PermissionPolicy::new(PermissionMode::WorkspaceWrite)
            .with_tool_requirement("bash", PermissionMode::DangerFullAccess);
        let mut prompter = RecordingPrompter {
            seen: Vec::new(),
            allow: false,
        };
        assert!(matches!(
            policy.authorize("bash", "echo hi", Some(&mut prompter)),
            PermissionOutcome::Deny { reason } if reason == "not now"
        ));
    }

    #[test]
    fn ask_rules_force_prompt_even_when_mode_allows() {
        let rules =
            PermissionRuleConfig::new(Vec::new(), Vec::new(), vec!["bash(git:*)".to_string()]);
        let policy = PermissionPolicy::new(PermissionMode::DangerFullAccess)
            .with_tool_requirement("bash", PermissionMode::DangerFullAccess)
            .with_permission_rules(&rules);
        let mut prompter = RecordingPrompter {
            seen: Vec::new(),
            allow: true,
        };
        let outcome = policy.authorize("bash", r#"{"command":"git status"}"#, Some(&mut prompter));
        assert_eq!(outcome, PermissionOutcome::Allow);
        assert_eq!(prompter.seen.len(), 1);
        assert!(prompter.seen[0]
            .reason
            .as_deref()
            .is_some_and(|r| r.contains("ask rule")));
    }

    #[test]
    fn hook_deny_short_circuits() {
        let policy = PermissionPolicy::new(PermissionMode::DangerFullAccess)
            .with_tool_requirement("bash", PermissionMode::DangerFullAccess);
        let context =
            PermissionContext::new(Some(PermissionOverride::Deny), Some("blocked".to_string()));
        assert_eq!(
            policy.authorize_with_context("bash", "{}", &context, None),
            PermissionOutcome::Deny {
                reason: "blocked".to_string(),
            }
        );
    }

    #[test]
    fn hook_allow_still_respects_ask_rules() {
        let rules =
            PermissionRuleConfig::new(Vec::new(), Vec::new(), vec!["bash(git:*)".to_string()]);
        let policy = PermissionPolicy::new(PermissionMode::ReadOnly)
            .with_tool_requirement("bash", PermissionMode::DangerFullAccess)
            .with_permission_rules(&rules);
        let context =
            PermissionContext::new(Some(PermissionOverride::Allow), Some("hook ok".to_string()));
        let mut prompter = RecordingPrompter {
            seen: Vec::new(),
            allow: true,
        };
        let outcome = policy.authorize_with_context(
            "bash",
            r#"{"command":"git status"}"#,
            &context,
            Some(&mut prompter),
        );
        assert_eq!(outcome, PermissionOutcome::Allow);
        assert_eq!(prompter.seen.len(), 1);
    }

    #[test]
    fn hook_ask_forces_prompt() {
        let policy = PermissionPolicy::new(PermissionMode::DangerFullAccess)
            .with_tool_requirement("bash", PermissionMode::DangerFullAccess);
        let context = PermissionContext::new(
            Some(PermissionOverride::Ask),
            Some("confirm please".to_string()),
        );
        let mut prompter = RecordingPrompter {
            seen: Vec::new(),
            allow: true,
        };
        let outcome = policy.authorize_with_context("bash", "{}", &context, Some(&mut prompter));
        assert_eq!(outcome, PermissionOutcome::Allow);
        assert_eq!(prompter.seen[0].reason.as_deref(), Some("confirm please"));
    }
}
