//! [`GovernanceRequest`] — the canonical inbound decision request.
//!
//! A request is what a runtime adapter (claude-code/codex) presents when an
//! agent attempts an action: *who* (`actor`), on *what task* (`task`), wants to
//! perform *which action* (`action`) on *which target* (`target`), under *what
//! context* (`context`). The kernel turns this into a
//! [`GovernanceVerdict`](crate::verdict::GovernanceVerdict).
//!
//! The type is deliberately small, `serde`-serializable, and validated at the
//! trust boundary — the kernel never trusts an unvalidated request.

use crate::error::GovernanceKernelError;
use serde::{Deserialize, Serialize};

/// The category of action an agent is attempting. This is the governance-local
/// action union; it is a superset of the policy action and drives which pipeline
/// stages can short-circuit (e.g. a `Push`/`Deploy` always reaches the
/// approval-required stage).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GovernanceAction {
    /// Read a file or resource (low blast radius).
    FileRead,
    /// Write or edit a file.
    FileWrite,
    /// Delete a file or resource.
    FileDelete,
    /// Run a shell command.
    Command,
    /// Invoke an MCP tool.
    McpTool,
    /// Make a network egress call.
    Network,
    /// Push to a remote / open a pull request.
    Push,
    /// Deploy to an environment.
    Deploy,
    /// Write durable memory (always gated to a candidate).
    MemoryWrite,
    /// Any other tool invocation.
    ToolUse,
}

impl GovernanceAction {
    /// Whether this action is inherently a delivery/escalation boundary that
    /// must always reach the approval-required stage regardless of mode.
    #[must_use]
    pub const fn is_delivery_boundary(self) -> bool {
        matches!(
            self,
            GovernanceAction::Push | GovernanceAction::Deploy | GovernanceAction::MemoryWrite
        )
    }

    /// The canonical wire string.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            GovernanceAction::FileRead => "file_read",
            GovernanceAction::FileWrite => "file_write",
            GovernanceAction::FileDelete => "file_delete",
            GovernanceAction::Command => "command",
            GovernanceAction::McpTool => "mcp_tool",
            GovernanceAction::Network => "network",
            GovernanceAction::Push => "push",
            GovernanceAction::Deploy => "deploy",
            GovernanceAction::MemoryWrite => "memory_write",
            GovernanceAction::ToolUse => "tool_use",
        }
    }
}

/// Side-channel context the kernel needs to decide. All fields default empty so
/// the type round-trips with `#[serde(default)]` even from a minimal payload.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct GovernanceContext {
    /// The tool name the runtime is about to invoke (drives tool-policy + the
    /// fine-grained permission check). Empty when not a tool call.
    pub tool_name: String,
    /// The raw, secret-free tool input / command (used by command/mcp risk and
    /// the permission rules).
    pub tool_input: String,
    /// The subagent nesting depth (drives the depth filter).
    pub depth: u32,
    /// Paths the actor currently holds a write work-lock on. A write outside
    /// these paths is denied by the work-lock stage when `enforce_work_lock`.
    pub work_lock_paths: Vec<String>,
    /// Whether the work-lock stage is active for this request.
    pub enforce_work_lock: bool,
    /// Free-text complexity hints (message bodies) used to scope the route.
    pub messages: Vec<String>,
}

/// The canonical governance decision request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GovernanceRequest {
    /// The acting principal (agent id).
    pub actor: String,
    /// The task this action belongs to.
    pub task: String,
    /// The category of action.
    pub action: GovernanceAction,
    /// The target path/resource/tool the action operates on.
    pub target: String,
    /// Side-channel decision context.
    #[serde(default)]
    pub context: GovernanceContext,
}

impl GovernanceRequest {
    /// Maximum length of any free-text field. An over-long field is a sign of an
    /// untrusted/oversized payload and is rejected (fail-closed).
    pub const MAX_TEXT_LEN: usize = 8192;

    /// Build a request with an empty context.
    #[must_use]
    pub fn new(
        actor: impl Into<String>,
        task: impl Into<String>,
        action: GovernanceAction,
        target: impl Into<String>,
    ) -> Self {
        Self {
            actor: actor.into(),
            task: task.into(),
            action,
            target: target.into(),
            context: GovernanceContext::default(),
        }
    }

    /// Attach a decision context.
    #[must_use]
    pub fn with_context(mut self, context: GovernanceContext) -> Self {
        self.context = context;
        self
    }

    /// Validate the request at the trust boundary. Fails fast with a clear,
    /// secret-free message. The pipeline treats a validation failure as a deny.
    pub fn validate(&self) -> Result<(), GovernanceKernelError> {
        if self.actor.trim().is_empty() {
            return Err(GovernanceKernelError::InvalidRequest(
                "actor must not be empty".to_string(),
            ));
        }
        if self.task.trim().is_empty() {
            return Err(GovernanceKernelError::InvalidRequest(
                "task must not be empty".to_string(),
            ));
        }
        if self.target.trim().is_empty() {
            return Err(GovernanceKernelError::InvalidRequest(
                "target must not be empty".to_string(),
            ));
        }
        for (field, value) in [
            ("actor", &self.actor),
            ("task", &self.task),
            ("target", &self.target),
            ("context.tool_name", &self.context.tool_name),
            ("context.tool_input", &self.context.tool_input),
        ] {
            if value.len() > Self::MAX_TEXT_LEN {
                return Err(GovernanceKernelError::InvalidRequest(format!(
                    "{field} exceeds max length {}",
                    Self::MAX_TEXT_LEN
                )));
            }
        }
        Ok(())
    }

    /// The effective tool name for permission resolution: the explicit
    /// `context.tool_name` if set, else a synthetic name derived from the
    /// action (so a bare action still flows through tool-policy).
    #[must_use]
    pub fn effective_tool_name(&self) -> &str {
        if self.context.tool_name.trim().is_empty() {
            self.action.as_str()
        } else {
            &self.context.tool_name
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_request_passes() {
        let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "/a.txt");
        assert!(req.validate().is_ok());
    }

    #[test]
    fn empty_actor_is_rejected() {
        let req = GovernanceRequest::new("", "task-1", GovernanceAction::FileRead, "/a.txt");
        assert!(matches!(
            req.validate(),
            Err(GovernanceKernelError::InvalidRequest(m)) if m.contains("actor")
        ));
    }

    #[test]
    fn oversized_field_is_rejected() {
        let big = "x".repeat(GovernanceRequest::MAX_TEXT_LEN + 1);
        let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, big);
        assert!(req.validate().is_err());
    }

    #[test]
    fn effective_tool_name_falls_back_to_action() {
        let req =
            GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileWrite, "/a.txt");
        assert_eq!(req.effective_tool_name(), "file_write");
    }

    #[test]
    fn delivery_boundary_detection() {
        assert!(GovernanceAction::Push.is_delivery_boundary());
        assert!(GovernanceAction::Deploy.is_delivery_boundary());
        assert!(GovernanceAction::MemoryWrite.is_delivery_boundary());
        assert!(!GovernanceAction::FileRead.is_delivery_boundary());
    }

    #[test]
    fn round_trips_through_serde() {
        let req = GovernanceRequest::new("a", "t", GovernanceAction::Push, "origin/main");
        let json = serde_json::to_string(&req).unwrap();
        let back: GovernanceRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(req, back);
    }
}
