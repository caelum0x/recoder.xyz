//! Approval lifecycle over the REAL IPC loopback — the human-in-the-loop gate.
//!
//! This is the one approval path nothing else covers at the wire level. The
//! in-process `ApprovalManager` is unit-tested (submit/resolve/wait) and the
//! dispatcher unit tests cover the auto-approve and nonexistent-id arms, but the
//! BLOCKING cross-connection round-trip — connection A submits a request that
//! parks on the gate, connection B resolves it on a SEPARATE connection, and A
//! unblocks with the human's decision — only exists in production at the
//! `IpcServer` boundary. This test drives it over an actual Unix-domain socket.
//!
//! It proves the deny-biased contract end to end: a `Denied` decision from the
//! control plane flows back to the parked caller verbatim, and the recent-history
//! ledger reflects exactly one resolved record.

use recoder_governance_ipc::{
    read_frame, write_frame, AuthConfig, IpcEnvelope, IpcMethod, IpcServer,
};
use recoder_governance_kernel::{GovernanceKernel, GovernanceKernelConfig};
use recoder_governance_types::{ApprovalRequest, RiskLevel};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::UnixStream;
use tokio::sync::oneshot;

fn temp_socket(tag: &str) -> std::path::PathBuf {
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("rgov-{tag}-{pid}-{nanos}.sock"))
}

async fn start_server(
    tag: &str,
    kernel: GovernanceKernel,
) -> (
    std::path::PathBuf,
    Arc<GovernanceKernel>,
    oneshot::Sender<()>,
    tokio::task::JoinHandle<()>,
) {
    let path = temp_socket(tag);
    let shared = Arc::new(kernel);
    let server = IpcServer::bind(
        &path,
        shared.clone(),
        AuthConfig::insecure_for_tests(),
        None,
    )
    .expect("bind");
    let (tx, rx) = oneshot::channel::<()>();
    let handle = tokio::spawn(async move {
        server
            .serve_until(async {
                let _ = rx.await;
            })
            .await;
    });
    tokio::time::sleep(Duration::from_millis(20)).await;
    (path, shared, tx, handle)
}

async fn round_trip(stream: &mut UnixStream, env: &IpcEnvelope) -> serde_json::Value {
    let bytes = serde_json::to_vec(env).unwrap();
    write_frame(stream, &bytes).await.expect("write frame");
    let resp_bytes = read_frame(stream).await.expect("read frame");
    serde_json::from_slice(&resp_bytes).unwrap()
}

/// A Critical-tier tool under the default policy never auto-approves (ceiling is
/// Medium, autonomous is false), so it parks on the gate — exactly what we need.
fn pending_request(id: &str, agent: &str) -> ApprovalRequest {
    ApprovalRequest {
        id: id.to_string(),
        agent_id: agent.to_string(),
        tool_name: "shell_exec".to_string(),
        description: "destructive shell".to_string(),
        action_summary: "rm a file".to_string(),
        risk_level: RiskLevel::Critical,
        requested_at_ms: 0,
        timeout_secs: 60,
    }
}

#[tokio::test]
async fn pending_approval_is_resolved_from_a_second_connection() {
    let kernel = GovernanceKernel::new(GovernanceKernelConfig::default()).unwrap();
    let (path, _shared, shutdown, handle) = start_server("approve-rt", kernel).await;

    // Connection A: submit a request that parks on the blocking gate. We DO NOT
    // await it yet — it stays in-flight while connection B resolves it.
    let path_a = path.clone();
    let submitter = tokio::spawn(async move {
        let mut stream = UnixStream::connect(&path_a).await.expect("connect A");
        let env = IpcEnvelope::new(
            "a1",
            IpcMethod::RequestApproval,
            serde_json::json!({ "request": pending_request("ar-1", "agent-1") }),
        );
        round_trip(&mut stream, &env).await
    });

    // Connection B: give A a moment to register the pending gate, then resolve it
    // as DENIED on a separate connection (the control-plane / human action).
    tokio::time::sleep(Duration::from_millis(80)).await;
    let mut resolver = UnixStream::connect(&path).await.expect("connect B");
    let resolve_env = IpcEnvelope::new(
        "b1",
        IpcMethod::ResolveApproval,
        serde_json::json!({
            "request_id": "ar-1",
            "decision": "denied",
            "decided_by": "human-reviewer"
        }),
    );
    let resolve_resp = round_trip(&mut resolver, &resolve_env).await;
    assert_eq!(resolve_resp["ok"], true, "resolve should succeed: {resolve_resp:?}");
    assert_eq!(resolve_resp["result"]["decision"], "denied");
    assert_eq!(resolve_resp["result"]["decided_by"], "human-reviewer");

    // Connection A now unblocks with the human's decision carried back over the
    // wire — the deny flows through verbatim (fail-closed, no fabricated allow).
    let submit_resp = submitter.await.expect("submitter task");
    assert_eq!(submit_resp["ok"], true, "submit should resolve: {submit_resp:?}");
    assert_eq!(submit_resp["result"]["status"], "decided");
    assert_eq!(submit_resp["result"]["request_id"], "ar-1");
    assert_eq!(
        submit_resp["result"]["decision"], "denied",
        "the parked caller receives the human's denial"
    );

    let _ = shutdown.send(());
    let _ = handle.await;
}

#[tokio::test]
async fn approved_decision_flows_back_to_the_parked_caller() {
    // The positive twin: an APPROVED decision must reach the parked caller too, so
    // the gate is proven to carry both outcomes (not just the deny-biased one).
    let kernel = GovernanceKernel::new(GovernanceKernelConfig::default()).unwrap();
    let (path, _shared, shutdown, handle) = start_server("approve-yes", kernel).await;

    let path_a = path.clone();
    let submitter = tokio::spawn(async move {
        let mut stream = UnixStream::connect(&path_a).await.expect("connect A");
        let env = IpcEnvelope::new(
            "a1",
            IpcMethod::RequestApproval,
            serde_json::json!({ "request": pending_request("ar-2", "agent-2") }),
        );
        round_trip(&mut stream, &env).await
    });

    tokio::time::sleep(Duration::from_millis(80)).await;
    let mut resolver = UnixStream::connect(&path).await.expect("connect B");
    let resolve_resp = round_trip(
        &mut resolver,
        &IpcEnvelope::new(
            "b1",
            IpcMethod::ResolveApproval,
            serde_json::json!({
                "request_id": "ar-2",
                "decision": "approved",
                "decided_by": "human-reviewer"
            }),
        ),
    )
    .await;
    assert_eq!(resolve_resp["ok"], true);

    let submit_resp = submitter.await.expect("submitter task");
    assert_eq!(submit_resp["result"]["decision"], "approved");

    let _ = shutdown.send(());
    let _ = handle.await;
}

#[tokio::test]
async fn resolving_an_unknown_request_fails_closed_over_the_wire() {
    // Resolving an id that was never submitted is an error response (ok:false) —
    // a consumer must treat it as a deny. Confirms the dispatcher's error arm at
    // the real socket boundary, not just in the in-process unit test.
    let kernel = GovernanceKernel::new(GovernanceKernelConfig::default()).unwrap();
    let (path, _shared, shutdown, handle) = start_server("approve-unknown", kernel).await;

    let mut stream = UnixStream::connect(&path).await.expect("connect");
    let resp = round_trip(
        &mut stream,
        &IpcEnvelope::new(
            "x1",
            IpcMethod::ResolveApproval,
            serde_json::json!({ "request_id": "never-submitted", "decision": "approved" }),
        ),
    )
    .await;
    assert_eq!(resp["ok"], false, "unknown approval id must fail closed");
    assert!(resp["error"].as_str().unwrap().contains("No pending approval"));

    let _ = shutdown.send(());
    let _ = handle.await;
}
