//! Integration test: per-agent pending cap + cross-thread resolution.

use recoder_governance_approval::{ApprovalManager, SubmitOutcome, MAX_PENDING_PER_AGENT};
use recoder_governance_types::{ApprovalDecision, ApprovalPolicy, ApprovalRequest, RiskLevel};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

fn request(id: &str, agent: &str) -> ApprovalRequest {
    ApprovalRequest {
        id: id.to_string(),
        agent_id: agent.to_string(),
        tool_name: "shell_exec".to_string(),
        description: "test".to_string(),
        action_summary: "test".to_string(),
        risk_level: RiskLevel::High,
        requested_at_ms: 0,
        timeout_secs: 60,
    }
}

#[test]
fn cap_blocks_sixth_request_for_same_agent() {
    let mgr = ApprovalManager::new(ApprovalPolicy::default());
    for i in 0..MAX_PENDING_PER_AGENT {
        assert!(matches!(
            mgr.submit(request(&format!("r{i}"), "agent-1"), 0),
            SubmitOutcome::Pending { .. }
        ));
    }
    assert!(matches!(
        mgr.submit(request("overflow", "agent-1"), 0),
        SubmitOutcome::Immediate(ApprovalDecision::Denied)
    ));
    // Distinct agent unaffected.
    assert!(matches!(
        mgr.submit(request("other", "agent-2"), 0),
        SubmitOutcome::Pending { .. }
    ));
}

#[test]
fn blocking_wait_resolved_from_another_thread() {
    let mgr = Arc::new(ApprovalManager::new(ApprovalPolicy::default()));
    let (id, rx) = match mgr.submit(request("r1", "agent-1"), 0) {
        SubmitOutcome::Pending {
            request_id,
            receiver,
        } => (request_id, receiver),
        SubmitOutcome::Immediate(_) => panic!("expected pending"),
    };

    let mgr2 = Arc::clone(&mgr);
    let id2 = id.clone();
    let resolver = thread::spawn(move || {
        thread::sleep(Duration::from_millis(20));
        mgr2.resolve(
            &id2,
            ApprovalDecision::Approved,
            Some("admin".to_string()),
            1,
        )
        .unwrap();
    });

    let decision = mgr.wait(&id, &rx, Duration::from_secs(5), 1);
    resolver.join().unwrap();
    assert_eq!(decision, ApprovalDecision::Approved);
    assert_eq!(mgr.pending_count(), 0);
}
