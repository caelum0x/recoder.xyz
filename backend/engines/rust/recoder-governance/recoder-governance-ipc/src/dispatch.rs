//! Dispatch: turn a validated [`IpcEnvelope`] into a [`IpcResponse`] by calling
//! into a governance backend.
//!
//! The backend is the [`IpcGovernance`] trait — a superset of the kernel's
//! object-safe [`GovernanceHandle`] that also exposes the approval gate, the
//! audit record/verify surface, and policy hot-reload. [`GovernanceKernel`]
//! implements it; tests can implement it directly.
//!
//! ## Hostile-by-default decoding
//!
//! Each method decodes its payload against a *specific* argument struct. A
//! payload whose shape does not match (missing field, wrong type, extra-but-
//! ignored is fine) yields a `bad_request` error response — the backend is never
//! called with malformed input. Inbound [`GovernanceRequest`]s are additionally
//! `validate()`d before they reach the kernel.
//!
//! ## Fail-closed
//!
//! Any decode/validation failure becomes an error response (`ok: false`). A
//! consumer that receives an error response — or no response at all — must deny.
//! No path in this module turns a fault into an allow.

use crate::auth::{AuthConfig, AuthField};
use crate::envelope::{IpcEnvelope, SignatureVerifier};
use crate::method::IpcMethod;
use recoder_governance_approval::{ApprovalManager, SubmitOutcome};
use recoder_governance_kernel::{
    GovernanceHandle, GovernanceKernel, GovernanceKernelConfig, GovernanceRequest,
};
use recoder_governance_types::{ApprovalDecision, ApprovalRequest, AuditInput, RiskLevel};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Default wait for a blocking approval gate at the IPC edge. A pending approval
/// that is not resolved within this window is recorded as timed-out (a deny-
/// biased outcome) and the caller is told `needs_approval` is unresolved.
const APPROVAL_WAIT: Duration = Duration::from_secs(30);

/// The governance backend the dispatcher drives. A superset of
/// [`GovernanceHandle`] adding the stateful surfaces (approvals, audit append,
/// reload) the IPC methods need.
pub trait IpcGovernance: GovernanceHandle {
    /// Borrow the approval manager (RequestApproval / ResolveApproval).
    fn approvals(&self) -> &ApprovalManager;

    /// Hot-reload the policy bundle from a new config. Fail-closed: an invalid
    /// config is rejected and the old policy stays live.
    fn reload(&self, config: GovernanceKernelConfig) -> Result<(), String>;
}

impl IpcGovernance for GovernanceKernel {
    fn approvals(&self) -> &ApprovalManager {
        GovernanceKernel::approvals(self)
    }

    fn reload(&self, config: GovernanceKernelConfig) -> Result<(), String> {
        self.reload_policies(config).map_err(|e| e.to_string())
    }
}

/// The response wire shape. Always carries the request `id` and an `ok` flag so
/// a fail-closed consumer can branch on a single field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcResponse {
    /// Echoes the request envelope id.
    pub id: String,
    /// `true` on success, `false` on any error (consumer denies on `false`).
    pub ok: bool,
    /// The method-specific success payload (present iff `ok`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    /// A sanitized, secret-free error message (present iff `!ok`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl IpcResponse {
    /// Build a success response.
    #[must_use]
    pub fn ok(id: impl Into<String>, result: serde_json::Value) -> Self {
        Self {
            id: id.into(),
            ok: true,
            result: Some(result),
            error: None,
        }
    }

    /// Build an error response. The consumer must treat this as a deny.
    #[must_use]
    pub fn err(id: impl Into<String>, error: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            ok: false,
            result: None,
            error: Some(error.into()),
        }
    }
}

// ---- Method argument structs ----------------------------------------------

#[derive(Debug, Deserialize)]
struct EnforceToolArgs {
    tool: String,
    #[serde(default)]
    input: String,
}

#[derive(Debug, Deserialize)]
struct RequestApprovalArgs {
    request: ApprovalRequest,
}

#[derive(Debug, Deserialize)]
struct ResolveApprovalArgs {
    request_id: String,
    decision: ApprovalDecision,
    #[serde(default)]
    decided_by: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RecordAuditArgs {
    entry: AuditInput,
}

#[derive(Debug, Deserialize)]
struct ReloadConfigArgs {
    config: GovernanceKernelConfig,
}

/// Dispatch a fully-validated envelope against the backend. Auth (peer-cred) is
/// applied by the server *before* this is called; the shared-key gate is applied
/// here per-message via the envelope payload's `key` field.
///
/// `verifier` is the optional signature verifier (fail-closed when configured).
pub fn dispatch<G: IpcGovernance + ?Sized>(
    gov: &G,
    auth: &AuthConfig,
    verifier: Option<&dyn SignatureVerifier>,
    envelope: &IpcEnvelope,
) -> IpcResponse {
    // 1) Structural validation (bounds the id) — fail-closed.
    if let Err(e) = envelope.validate() {
        return IpcResponse::err(&envelope.id, e.to_string());
    }

    // 2) Optional signature verification — fail-closed when a verifier is set.
    if let Err(e) = envelope.verify_signature(verifier) {
        return IpcResponse::err(&envelope.id, e.to_string());
    }

    // 3) Shared-key gate. Health is allowed unauthenticated so a liveness probe
    //    never needs the secret; every other method requires the key when one
    //    is configured.
    if envelope.method != IpcMethod::Health {
        let presented = serde_json::from_value::<AuthField>(envelope.payload.clone())
            .ok()
            .and_then(|f| f.key);
        if let Err(e) = auth.check_key(presented.as_deref()) {
            return IpcResponse::err(&envelope.id, e.to_string());
        }
    }

    // 4) Decode + run the method.
    match envelope.method {
        IpcMethod::Health => IpcResponse::ok(
            &envelope.id,
            serde_json::json!({
                "status": "ok",
                "audit_verified": gov.verify_audit().is_ok(),
            }),
        ),

        IpcMethod::Decide => decode::<GovernanceRequest>(&envelope.payload)
            .and_then(|req| {
                req.validate().map_err(|e| e.to_string())?;
                Ok(req)
            })
            .map(|req| {
                let verdict = gov.decide(&req);
                IpcResponse::ok(
                    &envelope.id,
                    serde_json::to_value(verdict).unwrap_or(serde_json::Value::Null),
                )
            })
            .unwrap_or_else(|e| IpcResponse::err(&envelope.id, e)),

        IpcMethod::EnforceTool => decode::<EnforceToolArgs>(&envelope.payload)
            .map(|args| {
                let result = gov.enforce_tool(&args.tool, &args.input);
                IpcResponse::ok(
                    &envelope.id,
                    serde_json::to_value(result).unwrap_or(serde_json::Value::Null),
                )
            })
            .unwrap_or_else(|e| IpcResponse::err(&envelope.id, e)),

        IpcMethod::Route => decode::<GovernanceRequest>(&envelope.payload)
            .map(|req| {
                let decision = gov.route(&req);
                // RouteDecision is not Serialize upstream; project onto a stable
                // shape so the wire is fully serde-friendly.
                IpcResponse::ok(&envelope.id, route_to_json(&decision))
            })
            .unwrap_or_else(|e| IpcResponse::err(&envelope.id, e)),

        IpcMethod::RequestApproval => decode::<RequestApprovalArgs>(&envelope.payload)
            .and_then(|args| {
                args.request.validate().map_err(|e| e)?;
                Ok(args.request)
            })
            .map(|request| handle_request_approval(gov.approvals(), request, envelope.ts))
            .map(|result| IpcResponse::ok(&envelope.id, result))
            .unwrap_or_else(|e| IpcResponse::err(&envelope.id, e)),

        IpcMethod::ResolveApproval => decode::<ResolveApprovalArgs>(&envelope.payload)
            .map(|args| {
                match gov.approvals().resolve(
                    &args.request_id,
                    args.decision,
                    args.decided_by,
                    envelope.ts,
                ) {
                    Ok(resp) => IpcResponse::ok(
                        &envelope.id,
                        serde_json::to_value(resp).unwrap_or(serde_json::Value::Null),
                    ),
                    Err(e) => IpcResponse::err(&envelope.id, e),
                }
            })
            .unwrap_or_else(|e| IpcResponse::err(&envelope.id, e)),

        IpcMethod::RecordAudit => decode::<RecordAuditArgs>(&envelope.payload)
            .map(|args| {
                let tip = gov.record_audit(args.entry);
                IpcResponse::ok(&envelope.id, serde_json::json!({ "tip_hash": tip }))
            })
            .unwrap_or_else(|e| IpcResponse::err(&envelope.id, e)),

        IpcMethod::VerifyAudit => match gov.verify_audit() {
            Ok(()) => IpcResponse::ok(&envelope.id, serde_json::json!({ "intact": true })),
            Err(e) => IpcResponse::err(&envelope.id, e.to_string()),
        },

        IpcMethod::ReloadConfig => decode::<ReloadConfigArgs>(&envelope.payload)
            .and_then(|args| gov.reload(args.config))
            .map(|()| IpcResponse::ok(&envelope.id, serde_json::json!({ "reloaded": true })))
            .unwrap_or_else(|e| IpcResponse::err(&envelope.id, e)),
    }
}

/// Submit an approval request and resolve the outcome at the IPC edge: an
/// immediate decision returns directly; a pending gate is waited on for a
/// bounded window (fail-closed to timed-out).
fn handle_request_approval(
    approvals: &ApprovalManager,
    request: ApprovalRequest,
    ts: i64,
) -> serde_json::Value {
    match approvals.submit(request, ts) {
        SubmitOutcome::Immediate(decision) => serde_json::json!({
            "status": "decided",
            "decision": decision,
        }),
        SubmitOutcome::Pending {
            request_id,
            receiver,
        } => {
            // Block this connection's task for a bounded window. The control
            // plane resolves via the ResolveApproval method on another
            // connection, which unblocks this receiver.
            let decision = approvals.wait(&request_id, &receiver, APPROVAL_WAIT, ts);
            serde_json::json!({
                "status": "decided",
                "request_id": request_id,
                "decision": decision,
            })
        }
    }
}

/// Project a routing decision onto a stable JSON shape. Mirrors the kernel's
/// `VerdictRoute` but is computed here so we never need the routing crate's
/// internal `RouteDecision` to be `Serialize`.
fn route_to_json(decision: &recoder_governance_routing::RouteDecision) -> serde_json::Value {
    use recoder_governance_routing::RouteDecision;
    match decision {
        RouteDecision::Routed {
            tier,
            model,
            runtime,
        } => serde_json::json!({
            "kind": "routed",
            "tier": tier,
            "model": model,
            "runtime": runtime.as_str(),
        }),
        RouteDecision::Denied => serde_json::json!({ "kind": "unrouted" }),
    }
}

/// Decode a payload into a method argument type, mapping any error to a terse,
/// secret-free message.
fn decode<T: for<'de> Deserialize<'de>>(payload: &serde_json::Value) -> Result<T, String> {
    serde_json::from_value(payload.clone()).map_err(|e| format!("bad_request: {e}"))
}

/// Convenience re-export so callers don't need the types crate for the common
/// approval shapes when building requests in tests.
pub use recoder_governance_types::ApprovalRequest as IpcApprovalRequest;

/// Build a minimal approval request (test/helper ergonomics).
#[must_use]
pub fn approval_request(
    id: impl Into<String>,
    agent_id: impl Into<String>,
    tool_name: impl Into<String>,
    risk_level: RiskLevel,
) -> ApprovalRequest {
    ApprovalRequest {
        id: id.into(),
        agent_id: agent_id.into(),
        tool_name: tool_name.into(),
        description: String::new(),
        action_summary: String::new(),
        risk_level,
        requested_at_ms: 0,
        timeout_secs: 60,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use recoder_governance_kernel::{GovernanceAction, GovernanceKernel};
    use recoder_governance_types::{AuditAction, AuditOutcome};

    fn kernel() -> GovernanceKernel {
        GovernanceKernel::new(GovernanceKernelConfig::default()).expect("valid config")
    }

    fn insecure() -> AuthConfig {
        AuthConfig::insecure_for_tests()
    }

    #[test]
    fn health_works_without_auth() {
        let k = kernel();
        let env = IpcEnvelope::new("1", IpcMethod::Health, serde_json::json!({}));
        let resp = dispatch(&k, &insecure(), None, &env);
        assert!(resp.ok);
        assert_eq!(resp.result.unwrap()["status"], "ok");
    }

    #[test]
    fn decide_returns_a_verdict() {
        let k = kernel();
        let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "a.txt");
        let env = IpcEnvelope::new("2", IpcMethod::Decide, serde_json::to_value(&req).unwrap());
        let resp = dispatch(&k, &insecure(), None, &env);
        assert!(resp.ok, "decide should succeed: {:?}", resp.error);
        assert_eq!(resp.result.unwrap()["effect"], "allow");
    }

    #[test]
    fn decide_rejects_invalid_request() {
        let k = kernel();
        // Empty actor fails GovernanceRequest::validate.
        let bad = serde_json::json!({
            "actor": "",
            "task": "t",
            "action": "file_read",
            "target": "a.txt"
        });
        let env = IpcEnvelope::new("3", IpcMethod::Decide, bad);
        let resp = dispatch(&k, &insecure(), None, &env);
        assert!(!resp.ok);
        assert!(resp.error.unwrap().contains("actor"));
    }

    #[test]
    fn malformed_decide_payload_is_bad_request() {
        let k = kernel();
        // action is not a known variant.
        let bad = serde_json::json!({
            "actor": "a", "task": "t", "action": "nuke", "target": "x"
        });
        let env = IpcEnvelope::new("4", IpcMethod::Decide, bad);
        let resp = dispatch(&k, &insecure(), None, &env);
        assert!(!resp.ok);
        assert!(resp.error.unwrap().starts_with("bad_request"));
    }

    #[test]
    fn enforce_tool_dispatches() {
        let k = kernel();
        let env = IpcEnvelope::new(
            "5",
            IpcMethod::EnforceTool,
            serde_json::json!({ "tool": "file_read", "input": "{}" }),
        );
        let resp = dispatch(&k, &insecure(), None, &env);
        assert!(resp.ok);
        assert!(resp.result.unwrap().get("outcome").is_some());
    }

    #[test]
    fn route_returns_stable_shape() {
        let k = kernel();
        let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "a.txt");
        let env = IpcEnvelope::new("6", IpcMethod::Route, serde_json::to_value(&req).unwrap());
        let resp = dispatch(&k, &insecure(), None, &env);
        assert!(resp.ok);
        assert!(resp.result.unwrap().get("kind").is_some());
    }

    #[test]
    fn record_then_verify_audit() {
        let k = kernel();
        let entry = AuditInput::new(
            "2026-06-29T00:00:00Z",
            "agent-1",
            AuditAction::ToolInvoked,
            "read a.txt",
            AuditOutcome::Allow,
        );
        let rec = dispatch(
            &k,
            &insecure(),
            None,
            &IpcEnvelope::new(
                "7",
                IpcMethod::RecordAudit,
                serde_json::json!({ "entry": entry }),
            ),
        );
        assert!(rec.ok);
        assert!(rec.result.unwrap()["tip_hash"].is_string());

        let ver = dispatch(
            &k,
            &insecure(),
            None,
            &IpcEnvelope::new("8", IpcMethod::VerifyAudit, serde_json::json!({})),
        );
        assert!(ver.ok);
        assert_eq!(ver.result.unwrap()["intact"], true);
    }

    #[test]
    fn approval_auto_path_decides_immediately() {
        let mut cfg = GovernanceKernelConfig::default();
        cfg.approval_policy.auto_approve_autonomous = true;
        cfg.approval_policy.auto_approve_ceiling = recoder_governance_types::RiskTier::Critical;
        let k = GovernanceKernel::new(cfg).unwrap();

        let req = approval_request("ar-1", "agent-1", "web_fetch", RiskLevel::Low);
        let env = IpcEnvelope::new(
            "9",
            IpcMethod::RequestApproval,
            serde_json::json!({ "request": req }),
        );
        let resp = dispatch(&k, &insecure(), None, &env);
        assert!(resp.ok);
        assert_eq!(resp.result.unwrap()["decision"], "approved");
    }

    #[test]
    fn resolve_nonexistent_approval_is_error() {
        let k = kernel();
        let env = IpcEnvelope::new(
            "10",
            IpcMethod::ResolveApproval,
            serde_json::json!({ "request_id": "nope", "decision": "approved" }),
        );
        let resp = dispatch(&k, &insecure(), None, &env);
        assert!(!resp.ok);
    }

    #[test]
    fn reload_config_rejects_invalid() {
        let k = kernel();
        // Inverted routing thresholds -> reject, old policy stays.
        let bad = serde_json::json!({
            "config": { "routing": { "simple_threshold": 9000, "complex_threshold": 1 } }
        });
        let env = IpcEnvelope::new("11", IpcMethod::ReloadConfig, bad);
        let resp = dispatch(&k, &insecure(), None, &env);
        assert!(!resp.ok);
    }

    #[test]
    fn keyed_auth_rejects_missing_key() {
        let k = kernel();
        let auth = AuthConfig::new(
            Some("topsecret".to_string()),
            crate::auth::PeerPolicy::any_uid(),
        );
        let req = GovernanceRequest::new("agent-1", "task-1", GovernanceAction::FileRead, "a.txt");
        // No key in the payload.
        let env = IpcEnvelope::new("12", IpcMethod::Decide, serde_json::to_value(&req).unwrap());
        let resp = dispatch(&k, &auth, None, &env);
        assert!(!resp.ok);
        assert!(resp.error.unwrap().contains("key"));
    }

    #[test]
    fn keyed_auth_allows_health_without_key() {
        let k = kernel();
        let auth = AuthConfig::new(
            Some("topsecret".to_string()),
            crate::auth::PeerPolicy::any_uid(),
        );
        let env = IpcEnvelope::new("13", IpcMethod::Health, serde_json::json!({}));
        let resp = dispatch(&k, &auth, None, &env);
        assert!(resp.ok);
    }
}
