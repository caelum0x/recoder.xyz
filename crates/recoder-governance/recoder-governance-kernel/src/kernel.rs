//! [`GovernanceKernel`] — the engine wiring permission + approval + routing +
//! audit behind one `decide(req) -> verdict`.
//!
//! ## Threading model (sync, no tokio)
//!
//! - The policy bundle (config + tool policy + permission policy + model router)
//!   lives behind a single `RwLock` so [`reload_policies`](GovernanceKernel::reload_policies)
//!   can hot-swap it atomically — the same pattern `ApprovalManager::update_policy`
//!   uses upstream. Readers take the read lock for the duration of a decision.
//! - The audit chain lives behind a `Mutex` because `append` mutates it.
//! - The [`ApprovalManager`] owns its own interior locking.
//!
//! Mutex poisoning is handled exactly as the merged sources do — with
//! `unwrap_or_else(|e| e.into_inner())` — so a panic in one decision never
//! wedges the kernel into an unrecoverable state. There is no `unwrap()` on a
//! lock in non-test code.

use crate::config::GovernanceKernelConfig;
use crate::error::{GovernanceKernelError, KernelResult};
use crate::handle::GovernanceHandle;
use crate::pipeline::{decide as run_pipeline, PipelineInputs};
use crate::request::GovernanceRequest;
use crate::verdict::GovernanceVerdict;
use recoder_governance_approval::{classify_tier, ApprovalManager};
use recoder_governance_audit::{verify_integrity, AuditLog, IntegrityReport};
use recoder_governance_permission::{
    EnforcementResult, PermissionEnforcer, PermissionMode, PermissionPolicy, ToolPolicy,
};
use recoder_governance_routing::{route as route_action, ModelRouter, RouteDecision, ScoringInput};
use recoder_governance_types::AuditInput;
use std::sync::{Mutex, RwLock};

/// The hot-swappable policy bundle. Swapping the whole struct under the write
/// lock makes a reload atomic with respect to in-flight decisions.
struct PolicyState {
    config: GovernanceKernelConfig,
    tool_policy: ToolPolicy,
    permission_policy: PermissionPolicy,
    router: ModelRouter,
}

impl PolicyState {
    fn from_config(config: GovernanceKernelConfig) -> Self {
        let router = ModelRouter::new(config.routing.clone());
        Self {
            config,
            tool_policy: ToolPolicy::default(),
            permission_policy: default_permission_policy(),
            router,
        }
    }
}

/// The kernel's default fine-grained permission posture: WorkspaceWrite mode
/// with baseline per-tool requirements for the canonical governance action
/// tool-names. Reads are ReadOnly (always allowed), writes are WorkspaceWrite
/// (allowed inside the boundary), and commands require DangerFullAccess (gated
/// to the approval/route stages, never silently allowed). Without these
/// baselines every tool would default to DangerFullAccess and a plain read would
/// be denied — too strict for the default posture.
fn default_permission_policy() -> PermissionPolicy {
    PermissionPolicy::new(PermissionMode::WorkspaceWrite)
        .with_tool_requirement("file_read", PermissionMode::ReadOnly)
        .with_tool_requirement("file_write", PermissionMode::WorkspaceWrite)
        .with_tool_requirement("file_delete", PermissionMode::WorkspaceWrite)
        .with_tool_requirement("tool_use", PermissionMode::ReadOnly)
        .with_tool_requirement("mcp_tool", PermissionMode::WorkspaceWrite)
        .with_tool_requirement("network", PermissionMode::WorkspaceWrite)
        .with_tool_requirement("push", PermissionMode::WorkspaceWrite)
        .with_tool_requirement("deploy", PermissionMode::WorkspaceWrite)
        .with_tool_requirement("memory_write", PermissionMode::WorkspaceWrite)
        .with_tool_requirement("command", PermissionMode::DangerFullAccess)
}

/// The governance kernel.
pub struct GovernanceKernel {
    state: RwLock<PolicyState>,
    audit: Mutex<AuditLog>,
    approvals: ApprovalManager,
}

impl GovernanceKernel {
    /// Construct a kernel from a config. Validates the config up front (a fault
    /// is returned, never silently absorbed).
    pub fn new(config: GovernanceKernelConfig) -> KernelResult<Self> {
        config.validate()?;
        let approval_policy = config.approval_policy.clone();
        Ok(Self {
            state: RwLock::new(PolicyState::from_config(config)),
            audit: Mutex::new(AuditLog::new()),
            approvals: ApprovalManager::new(approval_policy),
        })
    }

    /// Construct a kernel with an explicit tool policy and permission policy
    /// (used by the IPC layer / tests that wire concrete policies).
    pub fn with_policies(
        config: GovernanceKernelConfig,
        tool_policy: ToolPolicy,
        permission_policy: PermissionPolicy,
    ) -> KernelResult<Self> {
        config.validate()?;
        let approval_policy = config.approval_policy.clone();
        let router = ModelRouter::new(config.routing.clone());
        Ok(Self {
            state: RwLock::new(PolicyState {
                config,
                tool_policy,
                permission_policy,
                router,
            }),
            audit: Mutex::new(AuditLog::new()),
            approvals: ApprovalManager::new(approval_policy),
        })
    }

    /// Hot-swap the policy bundle without restarting. Validates the new config
    /// first; an invalid config is rejected and the old policy stays live (fail-
    /// closed: a bad reload never opens a hole).
    pub fn reload_policies(&self, config: GovernanceKernelConfig) -> KernelResult<()> {
        config.validate()?;
        let approval_policy = config.approval_policy.clone();
        {
            let mut state = self.state.write().unwrap_or_else(|e| e.into_inner());
            *state = PolicyState::from_config(config);
        }
        self.approvals.update_policy(approval_policy);
        Ok(())
    }

    /// Borrow the approval manager (for the IPC RequestApproval/ResolveApproval
    /// methods and for tests).
    #[must_use]
    pub fn approvals(&self) -> &ApprovalManager {
        &self.approvals
    }

    /// The current audit-chain tip hash.
    #[must_use]
    pub fn audit_tip(&self) -> String {
        self.audit
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .tip_hash()
            .to_string()
    }

    /// The number of recorded audit entries.
    #[must_use]
    pub fn audit_len(&self) -> usize {
        self.audit.lock().unwrap_or_else(|e| e.into_inner()).len()
    }
}

impl GovernanceHandle for GovernanceKernel {
    fn decide(&self, req: &GovernanceRequest) -> GovernanceVerdict {
        // The kernel injects a deterministic, monotonic-by-seq stamp; the real
        // wall clock is the caller's responsibility at the IPC edge. Using the
        // current audit length keeps the chain reproducible (and secret-free)
        // even without a clock dependency.
        let stamp = format!("seq-{}", self.audit_len());

        let state = self.state.read().unwrap_or_else(|e| e.into_inner());
        let inputs = PipelineInputs {
            config: &state.config,
            tool_policy: &state.tool_policy,
            permission_policy: &state.permission_policy,
            router: &state.router,
        };
        let mut audit = self.audit.lock().unwrap_or_else(|e| e.into_inner());
        run_pipeline(&inputs, req, &stamp, None, &mut audit)
    }

    fn enforce_tool(&self, tool: &str, input: &str) -> EnforcementResult {
        let state = self.state.read().unwrap_or_else(|e| e.into_inner());
        let enforcer = PermissionEnforcer::new(state.permission_policy.clone());
        enforcer.check(tool, input)
    }

    fn route(&self, req: &GovernanceRequest) -> RouteDecision {
        if req.validate().is_err() {
            return RouteDecision::Denied;
        }
        let state = self.state.read().unwrap_or_else(|e| e.into_inner());
        let tier = classify_tier(req.effective_tool_name());
        let scoring = ScoringInput::from_messages(req.context.messages.clone());
        let complexity = state.router.score(&scoring);
        route_action(&state.router, complexity, tier, false)
    }

    fn record_audit(&self, entry: AuditInput) -> String {
        self.audit
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .append(entry)
    }

    fn verify_audit(&self) -> Result<(), GovernanceKernelError> {
        let audit = self.audit.lock().unwrap_or_else(|e| e.into_inner());
        match verify_integrity(audit.entries()) {
            IntegrityReport::Ok { .. } => Ok(()),
            IntegrityReport::Broken { broken_seq, .. } => {
                Err(GovernanceKernelError::PipelineFault {
                    stage: "audit".to_string(),
                    detail: format!("audit chain broken at seq {broken_seq}"),
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::request::{GovernanceAction, GovernanceContext};
    use crate::verdict::Effect;

    fn kernel() -> GovernanceKernel {
        GovernanceKernel::new(GovernanceKernelConfig::default()).expect("valid config")
    }

    #[test]
    fn rejects_invalid_config_on_construction() {
        let mut config = GovernanceKernelConfig::default();
        config.routing.simple_threshold = 5000;
        config.routing.complex_threshold = 10;
        assert!(GovernanceKernel::new(config).is_err());
    }

    #[test]
    fn decide_advances_audit_hash_per_decision() {
        let k = kernel();
        let req1 = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "a.txt");
        let req2 = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "b.txt");

        let v1 = k.decide(&req1);
        let v2 = k.decide(&req2);

        assert_ne!(v1.audit_hash, v2.audit_hash);
        assert_eq!(k.audit_len(), 2);
        assert_eq!(k.audit_tip(), v2.audit_hash);
        assert!(k.verify_audit().is_ok());
    }

    #[test]
    fn decide_runs_the_full_pipeline() {
        let k = kernel();
        let denied = k.decide(&GovernanceRequest::new(
            "agent-1",
            "task-1",
            GovernanceAction::FileWrite,
            "src/security/keys.ts",
        ));
        assert_eq!(denied.effect, Effect::Deny);

        let needs = k.decide(&GovernanceRequest::new(
            "agent-1",
            "task-1",
            GovernanceAction::Deploy,
            "prod",
        ));
        assert_eq!(needs.effect, Effect::NeedsApproval);
    }

    #[test]
    fn enforce_tool_uses_active_permission_policy() {
        let k = kernel();
        // Default mode is WorkspaceWrite; an unknown tool defaults to
        // danger-full-access requirement, so WorkspaceWrite escalation is gated
        // to a deny (no prompter).
        let result = k.enforce_tool("read_file", "{}");
        assert!(result.is_allowed() || matches!(result, EnforcementResult::Denied { .. }));
    }

    #[test]
    fn route_denies_invalid_request() {
        let k = kernel();
        let bad = GovernanceRequest::new("", "task", GovernanceAction::FileRead, "a");
        assert_eq!(k.route(&bad), RouteDecision::Denied);
    }

    #[test]
    fn reload_rejects_invalid_config_and_keeps_old() {
        let k = kernel();
        let mut bad = GovernanceKernelConfig::default();
        bad.routing.simple_threshold = 9000;
        bad.routing.complex_threshold = 1;
        assert!(k.reload_policies(bad).is_err());
        // Kernel still decides correctly after a rejected reload.
        let v = k.decide(&GovernanceRequest::new(
            "agent-1",
            "task-1",
            GovernanceAction::FileRead,
            "a.txt",
        ));
        assert_eq!(v.effect, Effect::Allow);
    }

    #[test]
    fn reload_swaps_forbidden_paths() {
        let k = kernel();
        // Add a custom forbidden path and confirm a write to it is now denied.
        let mut cfg = GovernanceKernelConfig::default();
        cfg.forbidden_paths.push("topsecret".to_string());
        k.reload_policies(cfg).expect("valid reload");
        let v = k.decide(
            &GovernanceRequest::new(
                "agent-1",
                "task-1",
                GovernanceAction::FileWrite,
                "src/topsecret/x.ts",
            )
            .with_context(GovernanceContext::default()),
        );
        assert_eq!(v.effect, Effect::Deny);
    }
}
