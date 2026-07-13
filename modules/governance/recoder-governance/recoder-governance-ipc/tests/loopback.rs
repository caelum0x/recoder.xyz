//! Real loopback test: boot the [`IpcServer`] on a temp socket, connect a tokio
//! client, exchange framed messages, and assert the hostile-by-default and
//! fail-closed behavior over the actual UDS — not a mock.

use recoder_governance_ipc::{
    read_frame, write_frame, AuthConfig, IpcEnvelope, IpcMethod, IpcServer,
};
use recoder_governance_kernel::{
    GovernanceAction, GovernanceKernel, GovernanceKernelConfig, GovernanceRequest,
};
use std::sync::Arc;
use tokio::net::UnixStream;
use tokio::sync::oneshot;

/// A unique temp socket path for a test (the socket file name must be short
/// enough to fit the sockaddr_un limit, so we keep it in the system temp dir).
fn temp_socket(tag: &str) -> std::path::PathBuf {
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("rgov-{tag}-{pid}-{nanos}.sock"))
}

/// Start a server on a fresh socket and return its path + a shutdown trigger +
/// the server task handle.
async fn start_server(
    tag: &str,
    kernel: GovernanceKernel,
    auth: AuthConfig,
) -> (
    std::path::PathBuf,
    oneshot::Sender<()>,
    tokio::task::JoinHandle<()>,
) {
    let path = temp_socket(tag);
    let server = IpcServer::bind(&path, Arc::new(kernel), auth, None).expect("bind");
    let (tx, rx) = oneshot::channel::<()>();
    let handle = tokio::spawn(async move {
        server
            .serve_until(async {
                let _ = rx.await;
            })
            .await;
    });
    // Give the accept loop a moment to be ready.
    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    (path, tx, handle)
}

/// Send one envelope and read one response over a connection.
async fn round_trip(stream: &mut UnixStream, env: &IpcEnvelope) -> serde_json::Value {
    let bytes = serde_json::to_vec(env).unwrap();
    write_frame(stream, &bytes).await.expect("write frame");
    let resp_bytes = read_frame(stream).await.expect("read frame");
    serde_json::from_slice(&resp_bytes).unwrap()
}

#[tokio::test]
async fn decide_over_loopback_returns_a_verdict() {
    let kernel = GovernanceKernel::new(GovernanceKernelConfig::default()).unwrap();
    let (path, shutdown, handle) =
        start_server("decide", kernel, AuthConfig::insecure_for_tests()).await;

    let mut stream = UnixStream::connect(&path).await.expect("connect");

    let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "a.txt");
    let env = IpcEnvelope::new("c1", IpcMethod::Decide, serde_json::to_value(&req).unwrap());
    let resp = round_trip(&mut stream, &env).await;

    assert_eq!(resp["id"], "c1");
    assert_eq!(resp["ok"], true);
    assert_eq!(resp["result"]["effect"], "allow");

    // Health on the same connection too.
    let health = IpcEnvelope::new("c2", IpcMethod::Health, serde_json::json!({}));
    let hr = round_trip(&mut stream, &health).await;
    assert_eq!(hr["ok"], true);
    assert_eq!(hr["result"]["status"], "ok");

    let _ = shutdown.send(());
    let _ = handle.await;
}

#[tokio::test]
async fn bad_method_yields_error_response_not_a_verdict() {
    let kernel = GovernanceKernel::new(GovernanceKernelConfig::default()).unwrap();
    let (path, shutdown, handle) =
        start_server("badmethod", kernel, AuthConfig::insecure_for_tests()).await;

    let mut stream = UnixStream::connect(&path).await.expect("connect");

    // Hand-craft a frame with an unknown method string — it must NOT deserialize
    // into IpcMethod, so the server replies with a bad_request error.
    let raw = serde_json::json!({
        "id": "c1",
        "method": "drop_all_tables",
        "payload": {}
    });
    let bytes = serde_json::to_vec(&raw).unwrap();
    write_frame(&mut stream, &bytes).await.unwrap();
    let resp_bytes = read_frame(&mut stream).await.unwrap();
    let resp: serde_json::Value = serde_json::from_slice(&resp_bytes).unwrap();

    assert_eq!(resp["ok"], false, "unknown method must fail closed");
    assert!(
        resp["error"].as_str().unwrap().contains("bad_request"),
        "got: {resp:?}"
    );

    let _ = shutdown.send(());
    let _ = handle.await;
}

#[tokio::test]
async fn keyed_server_rejects_unkeyed_decide_but_allows_health() {
    let kernel = GovernanceKernel::new(GovernanceKernelConfig::default()).unwrap();
    let auth = AuthConfig::new(
        Some("topsecret".to_string()),
        recoder_governance_ipc::PeerPolicy::any_uid(),
    );
    let (path, shutdown, handle) = start_server("keyed", kernel, auth).await;

    let mut stream = UnixStream::connect(&path).await.expect("connect");

    // Decide without a key -> rejected.
    let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "a.txt");
    let mut payload = serde_json::to_value(&req).unwrap();
    let unkeyed = IpcEnvelope::new("c1", IpcMethod::Decide, payload.clone());
    let resp = round_trip(&mut stream, &unkeyed).await;
    assert_eq!(resp["ok"], false);

    // Decide WITH the key -> accepted. The key rides alongside the request
    // fields in the payload object.
    payload
        .as_object_mut()
        .unwrap()
        .insert("key".to_string(), serde_json::json!("topsecret"));
    let keyed = IpcEnvelope::new("c2", IpcMethod::Decide, payload);
    let resp2 = round_trip(&mut stream, &keyed).await;
    assert_eq!(resp2["ok"], true, "keyed decide should pass: {resp2:?}");

    // Health needs no key.
    let health = IpcEnvelope::new("c3", IpcMethod::Health, serde_json::json!({}));
    let hr = round_trip(&mut stream, &health).await;
    assert_eq!(hr["ok"], true);

    let _ = shutdown.send(());
    let _ = handle.await;
}

#[tokio::test]
async fn oversized_frame_drops_the_connection() {
    let kernel = GovernanceKernel::new(GovernanceKernelConfig::default()).unwrap();
    let (path, shutdown, handle) =
        start_server("oversized", kernel, AuthConfig::insecure_for_tests()).await;

    let mut stream = UnixStream::connect(&path).await.expect("connect");

    // Write an oversized length prefix by hand. The server must drop the
    // connection (read returns EOF/err on our side) rather than allocate.
    use tokio::io::AsyncWriteExt;
    let huge = (recoder_governance_ipc::MAX_FRAME_LEN as u32 + 1).to_be_bytes();
    stream.write_all(&huge).await.unwrap();
    stream.flush().await.unwrap();

    // The server drops us; a subsequent read should hit EOF (no response frame).
    let result = read_frame(&mut stream).await;
    assert!(
        result.is_err(),
        "server must not respond to an oversized frame"
    );

    let _ = shutdown.send(());
    let _ = handle.await;
}

#[tokio::test]
async fn record_and_verify_audit_over_loopback() {
    let kernel = GovernanceKernel::new(GovernanceKernelConfig::default()).unwrap();
    let (path, shutdown, handle) =
        start_server("audit", kernel, AuthConfig::insecure_for_tests()).await;

    let mut stream = UnixStream::connect(&path).await.expect("connect");

    let entry = serde_json::json!({
        "entry": {
            "timestamp": "2026-06-29T00:00:00Z",
            "actor": "agent-1",
            "action": "tool.invoked",
            "detail": "read a.txt",
            "outcome": "allow"
        }
    });
    let rec = round_trip(
        &mut stream,
        &IpcEnvelope::new("c1", IpcMethod::RecordAudit, entry),
    )
    .await;
    assert_eq!(rec["ok"], true, "record_audit: {rec:?}");
    assert!(rec["result"]["tip_hash"].is_string());

    let ver = round_trip(
        &mut stream,
        &IpcEnvelope::new("c2", IpcMethod::VerifyAudit, serde_json::json!({})),
    )
    .await;
    assert_eq!(ver["ok"], true);
    assert_eq!(ver["result"]["intact"], true);

    let _ = shutdown.send(());
    let _ = handle.await;
}
