//! Permission enforcement layer (merged from claw `permission_enforcer.rs`).
//!
//! Gates tool execution against the active [`PermissionPolicy`], plus two
//! mode-aware fast paths: [`PermissionEnforcer::check_file_write`]
//! (workspace-boundary containment) and [`PermissionEnforcer::check_bash`]
//! (read-only heuristic).

use crate::policy::{PermissionMode, PermissionOutcome, PermissionPolicy};
use crate::read_only_heuristic::is_read_only_command;
use crate::workspace_boundary::is_within_workspace;
use serde::{Deserialize, Serialize};

/// The result of an enforcement check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "outcome")]
pub enum EnforcementResult {
    /// Tool execution is allowed.
    Allowed,
    /// Tool execution was denied due to insufficient permissions.
    Denied {
        /// The tool that was denied.
        tool: String,
        /// The active mode at the time of the check.
        active_mode: String,
        /// The mode that would have been required.
        required_mode: String,
        /// A sanitized human-readable reason.
        reason: String,
    },
}

impl EnforcementResult {
    /// Whether the result is [`EnforcementResult::Allowed`].
    #[must_use]
    pub fn is_allowed(&self) -> bool {
        matches!(self, EnforcementResult::Allowed)
    }
}

/// Enforces a [`PermissionPolicy`] over tool invocations.
#[derive(Debug, Clone, PartialEq)]
pub struct PermissionEnforcer {
    policy: PermissionPolicy,
}

impl PermissionEnforcer {
    /// Wrap a policy.
    #[must_use]
    pub fn new(policy: PermissionPolicy) -> Self {
        Self { policy }
    }

    /// Check whether a tool can run. Auto-denies when prompting would be
    /// required but no prompter is available — except in [`PermissionMode::Prompt`],
    /// where the caller owns the interactive flow.
    #[must_use]
    pub fn check(&self, tool_name: &str, input: &str) -> EnforcementResult {
        if self.policy.active_mode() == PermissionMode::Prompt {
            return EnforcementResult::Allowed;
        }

        match self.policy.authorize(tool_name, input, None) {
            PermissionOutcome::Allow => EnforcementResult::Allowed,
            PermissionOutcome::Deny { reason } => EnforcementResult::Denied {
                tool: tool_name.to_owned(),
                active_mode: self.policy.active_mode().as_str().to_owned(),
                required_mode: self.policy.required_mode_for(tool_name).as_str().to_owned(),
                reason,
            },
        }
    }

    /// Convenience boolean form of [`Self::check`].
    #[must_use]
    pub fn is_allowed(&self, tool_name: &str, input: &str) -> bool {
        self.check(tool_name, input).is_allowed()
    }

    /// The active permission mode.
    #[must_use]
    pub fn active_mode(&self) -> PermissionMode {
        self.policy.active_mode()
    }

    /// Classify a file write against the workspace boundary.
    #[must_use]
    pub fn check_file_write(&self, path: &str, workspace_root: &str) -> EnforcementResult {
        let mode = self.policy.active_mode();
        match mode {
            PermissionMode::ReadOnly => EnforcementResult::Denied {
                tool: "write_file".to_owned(),
                active_mode: mode.as_str().to_owned(),
                required_mode: PermissionMode::WorkspaceWrite.as_str().to_owned(),
                reason: format!("file writes are not allowed in '{}' mode", mode.as_str()),
            },
            PermissionMode::WorkspaceWrite => {
                if is_within_workspace(path, workspace_root) {
                    EnforcementResult::Allowed
                } else {
                    EnforcementResult::Denied {
                        tool: "write_file".to_owned(),
                        active_mode: mode.as_str().to_owned(),
                        required_mode: PermissionMode::DangerFullAccess.as_str().to_owned(),
                        reason: format!(
                            "path '{path}' is outside workspace root '{workspace_root}'"
                        ),
                    }
                }
            }
            PermissionMode::Allow | PermissionMode::DangerFullAccess => EnforcementResult::Allowed,
            PermissionMode::Prompt => EnforcementResult::Denied {
                tool: "write_file".to_owned(),
                active_mode: mode.as_str().to_owned(),
                required_mode: PermissionMode::WorkspaceWrite.as_str().to_owned(),
                reason: "file write requires confirmation in prompt mode".to_owned(),
            },
        }
    }

    /// Check whether a bash command should run under the current mode.
    #[must_use]
    pub fn check_bash(&self, command: &str) -> EnforcementResult {
        let mode = self.policy.active_mode();
        match mode {
            PermissionMode::ReadOnly => {
                if is_read_only_command(command) {
                    EnforcementResult::Allowed
                } else {
                    EnforcementResult::Denied {
                        tool: "bash".to_owned(),
                        active_mode: mode.as_str().to_owned(),
                        required_mode: PermissionMode::WorkspaceWrite.as_str().to_owned(),
                        reason: format!(
                            "command may modify state; not allowed in '{}' mode",
                            mode.as_str()
                        ),
                    }
                }
            }
            PermissionMode::Prompt => EnforcementResult::Denied {
                tool: "bash".to_owned(),
                active_mode: mode.as_str().to_owned(),
                required_mode: PermissionMode::DangerFullAccess.as_str().to_owned(),
                reason: "bash requires confirmation in prompt mode".to_owned(),
            },
            // WorkspaceWrite, Allow, DangerFullAccess: permit bash.
            _ => EnforcementResult::Allowed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_enforcer(mode: PermissionMode) -> PermissionEnforcer {
        PermissionEnforcer::new(PermissionPolicy::new(mode))
    }

    #[test]
    fn allow_mode_permits_everything() {
        let enforcer = make_enforcer(PermissionMode::Allow);
        assert!(enforcer.is_allowed("bash", ""));
        assert!(enforcer.is_allowed("write_file", ""));
        assert_eq!(
            enforcer.check_file_write("/outside/path", "/workspace"),
            EnforcementResult::Allowed
        );
        assert_eq!(enforcer.check_bash("rm -rf /"), EnforcementResult::Allowed);
    }

    #[test]
    fn read_only_denies_writes() {
        let policy = PermissionPolicy::new(PermissionMode::ReadOnly)
            .with_tool_requirement("read_file", PermissionMode::ReadOnly)
            .with_tool_requirement("write_file", PermissionMode::WorkspaceWrite);
        let enforcer = PermissionEnforcer::new(policy);
        assert!(enforcer.is_allowed("read_file", ""));
        assert!(matches!(
            enforcer.check("write_file", ""),
            EnforcementResult::Denied { .. }
        ));
        assert!(matches!(
            enforcer.check_file_write("/workspace/file.rs", "/workspace"),
            EnforcementResult::Denied { .. }
        ));
    }

    #[test]
    fn read_only_allows_read_commands_denies_writes() {
        let enforcer = make_enforcer(PermissionMode::ReadOnly);
        assert_eq!(
            enforcer.check_bash("cat src/main.rs"),
            EnforcementResult::Allowed
        );
        assert_eq!(enforcer.check_bash("ls -la"), EnforcementResult::Allowed);
        assert!(matches!(
            enforcer.check_bash("rm file.txt"),
            EnforcementResult::Denied { .. }
        ));
    }

    #[test]
    fn workspace_write_boundary() {
        let enforcer = make_enforcer(PermissionMode::WorkspaceWrite);
        assert_eq!(
            enforcer.check_file_write("/workspace/src/main.rs", "/workspace"),
            EnforcementResult::Allowed
        );
        assert!(matches!(
            enforcer.check_file_write("/etc/passwd", "/workspace"),
            EnforcementResult::Denied { .. }
        ));
        // Relative path resolves inside the workspace.
        assert_eq!(
            enforcer.check_file_write("src/main.rs", "/workspace"),
            EnforcementResult::Allowed
        );
    }

    #[test]
    fn prompt_mode_denies_file_and_bash_without_prompter() {
        let enforcer = make_enforcer(PermissionMode::Prompt);
        assert!(matches!(
            enforcer.check_bash("echo test"),
            EnforcementResult::Denied { .. }
        ));
        assert!(matches!(
            enforcer.check_file_write("/workspace/file.rs", "/workspace"),
            EnforcementResult::Denied { .. }
        ));
        // But arbitrary tool `check` defers to the caller's prompt flow.
        assert_eq!(enforcer.check("anything", "{}"), EnforcementResult::Allowed);
    }

    #[test]
    fn danger_full_access_permits_writes_and_bash() {
        let enforcer = make_enforcer(PermissionMode::DangerFullAccess);
        assert_eq!(
            enforcer.check_file_write("/outside/workspace/file.txt", "/workspace"),
            EnforcementResult::Allowed
        );
        assert_eq!(
            enforcer.check_bash("rm -rf /tmp/scratch"),
            EnforcementResult::Allowed
        );
    }

    #[test]
    fn denied_payload_carries_tool_and_modes() {
        let policy = PermissionPolicy::new(PermissionMode::ReadOnly)
            .with_tool_requirement("write_file", PermissionMode::WorkspaceWrite);
        let enforcer = PermissionEnforcer::new(policy);
        match enforcer.check("write_file", "{}") {
            EnforcementResult::Denied {
                tool,
                active_mode,
                required_mode,
                reason,
            } => {
                assert_eq!(tool, "write_file");
                assert_eq!(active_mode, "read-only");
                assert_eq!(required_mode, "workspace-write");
                assert!(reason.contains("requires workspace-write permission"));
            }
            other => panic!("expected denied, got {other:?}"),
        }
    }

    #[test]
    fn enforcement_result_serializes_with_tag() {
        let denied = EnforcementResult::Denied {
            tool: "bash".to_string(),
            active_mode: "read-only".to_string(),
            required_mode: "workspace-write".to_string(),
            reason: "x".to_string(),
        };
        let json = serde_json::to_string(&denied).unwrap();
        assert!(json.contains("\"outcome\":\"Denied\""));
        assert!(EnforcementResult::Allowed.is_allowed());
    }
}
