//! The approval manager (merged from openfang-kernel `approval.rs`, made sync).
//!
//! Keeps the per-agent pending cap, the recent ring buffer, `classify_risk`,
//! and a hot-reloadable [`ApprovalPolicy`]. The upstream tokio oneshot gate is
//! replaced with a std `sync_channel(1)` so the manager is fully synchronous and
//! testable without an async runtime.
//!
//! The blocking gate is exposed in two pieces so callers control threading:
//! - [`ApprovalManager::submit`] registers a request and returns a
//!   [`SubmitOutcome`] that is either an immediate decision (auto-approved or
//!   cap-rejected) or a [`Receiver`] to wait on.
//! - [`ApprovalManager::resolve`] (called by the control plane) sends the
//!   decision through the gate and records it.

use crate::auto_approve::can_auto_approve;
use crate::classifier::{classify_risk, classify_tier};
use crate::pending::{PendingMap, PendingRequest};
use crate::recent::{ApprovalRecord, RecentApprovals};
use recoder_governance_types::{
    ApprovalDecision, ApprovalPolicy, ApprovalRequest, ApprovalResponse, RiskLevel,
};
use std::sync::mpsc::{sync_channel, Receiver, RecvTimeoutError};
use std::sync::{Mutex, RwLock};
use std::time::Duration;

/// Max pending requests per agent.
pub const MAX_PENDING_PER_AGENT: usize = 5;
/// Max recent approval records to retain.
pub const MAX_RECENT_APPROVALS: usize = 100;

/// The outcome of submitting a request to the manager.
pub enum SubmitOutcome {
    /// A decision was reached immediately (auto-approve or cap rejection); no
    /// waiting is needed.
    Immediate(ApprovalDecision),
    /// The request is pending; block on the receiver until resolved.
    Pending {
        /// The id assigned to the pending request.
        request_id: String,
        /// The one-shot gate to wait on.
        receiver: Receiver<ApprovalDecision>,
    },
}

/// Synchronous approval manager.
pub struct ApprovalManager {
    pending: Mutex<PendingMap>,
    recent: Mutex<RecentApprovals>,
    policy: RwLock<ApprovalPolicy>,
}

impl ApprovalManager {
    /// Create a manager with the given policy.
    #[must_use]
    pub fn new(policy: ApprovalPolicy) -> Self {
        Self {
            pending: Mutex::new(PendingMap::new()),
            recent: Mutex::new(RecentApprovals::new(MAX_RECENT_APPROVALS)),
            policy: RwLock::new(policy),
        }
    }

    /// Whether a tool requires approval under the current policy.
    #[must_use]
    pub fn requires_approval(&self, tool_name: &str) -> bool {
        let policy = self.policy.read().unwrap_or_else(|e| e.into_inner());
        policy.require_approval.iter().any(|t| t == tool_name)
    }

    /// Classify a tool's risk level.
    #[must_use]
    pub fn classify_risk(tool_name: &str) -> RiskLevel {
        classify_risk(tool_name)
    }

    /// Submit a request. Enforces the per-agent cap and applies auto-approval
    /// (capped at the policy tier ceiling) before registering a pending gate.
    pub fn submit(&self, request: ApprovalRequest, now_ms: i64) -> SubmitOutcome {
        // Per-agent pending cap (deny-biased: reject when over the limit).
        {
            let pending = self.pending.lock().unwrap_or_else(|e| e.into_inner());
            if pending.count_for_agent(&request.agent_id) >= MAX_PENDING_PER_AGENT {
                drop(pending);
                self.push_recent(request, ApprovalDecision::Denied, None, now_ms);
                return SubmitOutcome::Immediate(ApprovalDecision::Denied);
            }
        }

        // Auto-approve fast path, capped by the tier ceiling.
        let tier = classify_tier(&request.tool_name).max(request.risk_level.to_tier());
        {
            let policy = self.policy.read().unwrap_or_else(|e| e.into_inner());
            if can_auto_approve(&policy, tier) {
                drop(policy);
                self.push_recent(
                    request,
                    ApprovalDecision::Approved,
                    Some("auto-approver".to_string()),
                    now_ms,
                );
                return SubmitOutcome::Immediate(ApprovalDecision::Approved);
            }
        }

        // Register a pending gate.
        let (tx, rx) = sync_channel(1);
        let id = request.id.clone();
        let mut pending = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        pending.insert(
            id.clone(),
            PendingRequest {
                request,
                sender: tx,
            },
        );
        SubmitOutcome::Pending {
            request_id: id,
            receiver: rx,
        }
    }

    /// Resolve a pending request (called by API/UI). Sends the decision through
    /// the gate and records it. Returns an error if no such request is pending.
    pub fn resolve(
        &self,
        request_id: &str,
        decision: ApprovalDecision,
        decided_by: Option<String>,
        now_ms: i64,
    ) -> Result<ApprovalResponse, String> {
        let pending = {
            let mut map = self.pending.lock().unwrap_or_else(|e| e.into_inner());
            map.remove(request_id)
        };

        match pending {
            Some(pending) => {
                let response = ApprovalResponse {
                    request_id: request_id.to_string(),
                    decision,
                    decided_at_ms: now_ms,
                    decided_by: decided_by.clone(),
                };
                self.push_recent(pending.request, decision, decided_by, now_ms);
                // Unblock the waiter; ignore error if it already gave up.
                let _ = pending.sender.send(decision);
                Ok(response)
            }
            None => Err(format!("No pending approval request with id {request_id}")),
        }
    }

    /// Block on a submitted request until resolved or the timeout elapses.
    ///
    /// On timeout the request is removed and recorded as
    /// [`ApprovalDecision::TimedOut`]. This is a convenience for callers that
    /// own a worker thread; tests typically use [`Self::submit`] +
    /// [`Self::resolve`] directly to stay single-threaded.
    pub fn wait(
        &self,
        request_id: &str,
        receiver: &Receiver<ApprovalDecision>,
        timeout: Duration,
        now_ms: i64,
    ) -> ApprovalDecision {
        match receiver.recv_timeout(timeout) {
            Ok(decision) => decision,
            Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => {
                let removed = {
                    let mut map = self.pending.lock().unwrap_or_else(|e| e.into_inner());
                    map.remove(request_id)
                };
                if let Some(pending) = removed {
                    self.push_recent(pending.request, ApprovalDecision::TimedOut, None, now_ms);
                }
                ApprovalDecision::TimedOut
            }
        }
    }

    /// List pending requests.
    #[must_use]
    pub fn list_pending(&self) -> Vec<ApprovalRequest> {
        self.pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .list()
    }

    /// List recent resolved approvals, newest first.
    #[must_use]
    pub fn list_recent(&self, limit: usize) -> Vec<ApprovalRecord> {
        self.recent
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .recent(limit)
    }

    /// The number of pending requests.
    #[must_use]
    pub fn pending_count(&self) -> usize {
        self.pending.lock().unwrap_or_else(|e| e.into_inner()).len()
    }

    /// Hot-swap the policy.
    pub fn update_policy(&self, policy: ApprovalPolicy) {
        *self.policy.write().unwrap_or_else(|e| e.into_inner()) = policy;
    }

    /// A copy of the current policy.
    #[must_use]
    pub fn policy(&self) -> ApprovalPolicy {
        self.policy
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    fn push_recent(
        &self,
        request: ApprovalRequest,
        decision: ApprovalDecision,
        decided_by: Option<String>,
        decided_at_ms: i64,
    ) {
        let mut recent = self.recent.lock().unwrap_or_else(|e| e.into_inner());
        recent.push(ApprovalRecord {
            request,
            decision,
            decided_at_ms,
            decided_by,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manager() -> ApprovalManager {
        ApprovalManager::new(ApprovalPolicy::default())
    }

    fn request(id: &str, agent: &str, tool: &str) -> ApprovalRequest {
        ApprovalRequest {
            id: id.to_string(),
            agent_id: agent.to_string(),
            tool_name: tool.to_string(),
            description: "test".to_string(),
            action_summary: "test".to_string(),
            risk_level: RiskLevel::High,
            requested_at_ms: 0,
            timeout_secs: 60,
        }
    }

    #[test]
    fn requires_approval_default() {
        let mgr = manager();
        assert!(mgr.requires_approval("shell_exec"));
        assert!(!mgr.requires_approval("file_read"));
    }

    #[test]
    fn submit_then_resolve_unblocks() {
        let mgr = manager();
        let outcome = mgr.submit(request("r1", "a", "shell_exec"), 0);
        let (id, rx) = match outcome {
            SubmitOutcome::Pending {
                request_id,
                receiver,
            } => (request_id, receiver),
            SubmitOutcome::Immediate(_) => panic!("expected pending"),
        };
        assert_eq!(mgr.pending_count(), 1);

        let resp = mgr
            .resolve(
                &id,
                ApprovalDecision::Approved,
                Some("admin".to_string()),
                1,
            )
            .unwrap();
        assert_eq!(resp.decision, ApprovalDecision::Approved);
        // The gate now carries the decision.
        assert_eq!(rx.recv().unwrap(), ApprovalDecision::Approved);
        assert_eq!(mgr.pending_count(), 0);

        let recent = mgr.list_recent(10);
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].decision, ApprovalDecision::Approved);
        assert_eq!(recent[0].decided_by.as_deref(), Some("admin"));
    }

    #[test]
    fn per_agent_cap_rejects_overflow() {
        let mgr = manager();
        // Fill the cap with pending requests.
        for i in 0..MAX_PENDING_PER_AGENT {
            let outcome = mgr.submit(request(&format!("r{i}"), "a", "shell_exec"), 0);
            assert!(matches!(outcome, SubmitOutcome::Pending { .. }));
        }
        assert_eq!(mgr.pending_count(), MAX_PENDING_PER_AGENT);

        // The next one for the same agent is immediately denied.
        let overflow = mgr.submit(request("r-overflow", "a", "shell_exec"), 0);
        assert!(matches!(
            overflow,
            SubmitOutcome::Immediate(ApprovalDecision::Denied)
        ));

        // A different agent can still submit.
        let other = mgr.submit(request("r-other", "b", "shell_exec"), 0);
        assert!(matches!(other, SubmitOutcome::Pending { .. }));
    }

    #[test]
    fn auto_approve_capped_at_ceiling() {
        // Autonomous auto-approve, ceiling = Medium.
        let policy = ApprovalPolicy {
            auto_approve_autonomous: true,
            auto_approve_ceiling: recoder_governance_types::RiskTier::Medium,
            ..Default::default()
        };
        let mgr = ApprovalManager::new(policy);

        // A medium-tier tool auto-approves.
        let medium = mgr.submit(
            ApprovalRequest {
                risk_level: RiskLevel::Medium,
                ..request("r-med", "a", "web_fetch")
            },
            0,
        );
        assert!(matches!(
            medium,
            SubmitOutcome::Immediate(ApprovalDecision::Approved)
        ));

        // A critical tool (shell_exec) is above the ceiling -> still pending.
        let critical = mgr.submit(request("r-crit", "a", "shell_exec"), 0);
        assert!(matches!(critical, SubmitOutcome::Pending { .. }));
    }

    #[test]
    fn wait_times_out_and_records() {
        let mgr = manager();
        let outcome = mgr.submit(request("r1", "a", "shell_exec"), 0);
        let (id, rx) = match outcome {
            SubmitOutcome::Pending {
                request_id,
                receiver,
            } => (request_id, receiver),
            SubmitOutcome::Immediate(_) => panic!("expected pending"),
        };
        let decision = mgr.wait(&id, &rx, Duration::from_millis(10), 5);
        assert_eq!(decision, ApprovalDecision::TimedOut);
        assert_eq!(mgr.pending_count(), 0);
        let recent = mgr.list_recent(10);
        assert_eq!(recent[0].decision, ApprovalDecision::TimedOut);
    }

    #[test]
    fn resolve_nonexistent_errors() {
        let mgr = manager();
        let result = mgr.resolve("nope", ApprovalDecision::Approved, None, 0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No pending approval request"));
    }

    #[test]
    fn update_policy_hot_swaps() {
        let mgr = manager();
        assert!(mgr.requires_approval("shell_exec"));
        mgr.update_policy(ApprovalPolicy {
            require_approval: vec!["file_write".to_string()],
            timeout_secs: 120,
            ..Default::default()
        });
        assert!(!mgr.requires_approval("shell_exec"));
        assert!(mgr.requires_approval("file_write"));
        assert_eq!(mgr.policy().timeout_secs, 120);
    }

    #[test]
    fn classify_risk_delegates() {
        assert_eq!(
            ApprovalManager::classify_risk("shell_exec"),
            RiskLevel::Critical
        );
    }
}
