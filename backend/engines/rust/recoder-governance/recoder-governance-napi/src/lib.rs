//! `recoder-governance-napi` — Native Node.js addon wrapping the Recoder
//! governance Rust kernel.
//!
//! Exposes [`NapiGovernanceKernel`] and [`NapiApprovalManager`] with `#[napi]`
//! wrappers so the TypeScript facade can call them synchronously in-process,
//! replacing the subprocess/loopback path entirely.
//!
//! ## Singleton
//!
//! [`NapiGovernanceKernel::new`] constructs a default kernel; the TS facade is
//! expected to call it once and store the instance (Node keeps the `.node`
//! loaded for the process lifetime).
//!
//! ## Degrade-safe contract
//!
//! This crate is purely additive. The TS facade `require()`s it at runtime; if
//! the module is absent (different arch, build not yet run) the facade falls
//! back through the UDS daemon then the pure-TS deny-biased path. No change to
//! existing behavior when the `.node` is absent.
//!
//! ## Safety
//!
//! There is no `unsafe` code in this file. The `napi_derive` macro generates
//! the FFI glue; its invariants are:
//! - The `#[napi]` attribute ensures every exported symbol is wrapped with the
//!   correct N-API lifetimes and error conversion.
//! - `Arc<Mutex<GovernanceKernel>>` is `Send + Sync`; N-API callbacks run on
//!   the main V8 thread (Node.js guarantees this for sync calls), so the mutex
//!   is never contested inside a single JS call — it only guards multi-threaded
//!   Rust-side access if the addon is ever called from Worker threads.

#![deny(clippy::unwrap_in_result)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use recoder_governance_kernel::{
    GovernanceAction, GovernanceContext, GovernanceHandle, GovernanceKernel,
    GovernanceKernelConfig, GovernanceRequest,
};
use recoder_governance_types::{AuditInput, AuditOutcome};
use std::sync::{Arc, Mutex};

// ---- free probes (no kernel instance required) ------------------------------

/// Classify a tool's inherent risk level from its name — the deny-biased
/// classifier the approval stage uses (`shell_exec` → critical, `file_write` /
/// `file_delete` → high, `web_fetch` / `browser_navigate` → medium, else low).
///
/// Returns the wire string: `"low" | "medium" | "high" | "critical"`. Pure and
/// side-effect-free, so the TS facade can call it before booting a kernel.
#[napi]
pub fn classify_risk(tool: String) -> String {
    recoder_governance_approval::classify_risk(&tool).to_string()
}

/// Native addon version + crate id, so the TS facade can confirm the loaded
/// `.node` matches the expected build. A pure read — no side effects.
#[napi]
pub fn native_version() -> String {
    serde_json::json!({
        "addon": env!("CARGO_PKG_VERSION"),
        "crate": "recoder-governance-napi",
        "build_profile": if cfg!(debug_assertions) { "debug" } else { "release" },
    })
    .to_string()
}

// ---- helpers ----------------------------------------------------------------

/// Convert a napi Error-compatible string into a napi::Error.
fn js_err(msg: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(msg.to_string())
}

/// Parse a JSON string into T; map serde errors to napi errors.
fn parse_json<T: serde::de::DeserializeOwned>(json: &str, field: &str) -> Result<T> {
    serde_json::from_str(json)
        .map_err(|e| js_err(format!("governance-napi: failed to parse {field}: {e}")))
}

/// Serialize T to a JSON string; map serde errors to napi errors.
fn to_json<T: serde::Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value)
        .map_err(|e| js_err(format!("governance-napi: failed to serialize: {e}")))
}

/// Map a snake_case action string from the TS facade to the kernel enum.
/// Unknown strings default to `ToolUse` (most conservative non-deny action).
fn parse_action(action: &str) -> GovernanceAction {
    match action {
        "file_read" => GovernanceAction::FileRead,
        "file_write" => GovernanceAction::FileWrite,
        "file_delete" => GovernanceAction::FileDelete,
        "command" => GovernanceAction::Command,
        "mcp_tool" => GovernanceAction::McpTool,
        "network" => GovernanceAction::Network,
        "push" => GovernanceAction::Push,
        "deploy" => GovernanceAction::Deploy,
        "memory_write" => GovernanceAction::MemoryWrite,
        _ => GovernanceAction::ToolUse,
    }
}

/// Parse an `AuditOutcome` from its wire string; defaults to `Info` on unknown.
fn parse_outcome(outcome: &str) -> AuditOutcome {
    match outcome {
        "allow" => AuditOutcome::Allow,
        "deny" => AuditOutcome::Deny,
        "needs_approval" => AuditOutcome::NeedsApproval,
        "success" => AuditOutcome::Success,
        "failure" => AuditOutcome::Failure,
        _ => AuditOutcome::Info,
    }
}

// ---- NapiGovernanceKernel ---------------------------------------------------

/// The in-process governance kernel, accessible from Node.js via the native
/// addon. Backed by `Arc<Mutex<GovernanceKernel>>` so the instance can be
/// moved across calls without cloning the kernel.
#[napi]
pub struct NapiGovernanceKernel {
    inner: Arc<Mutex<GovernanceKernel>>,
}

#[napi]
impl NapiGovernanceKernel {
    /// Construct a new kernel with the default configuration.
    ///
    /// Returns an error if the default config is somehow invalid (should never
    /// happen; the default is always valid — but fail-closed if it ever does).
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        let config = GovernanceKernelConfig::default();
        let kernel = GovernanceKernel::new(config)
            .map_err(|e| js_err(format!("governance-napi: kernel init failed: {e}")))?;
        Ok(Self {
            inner: Arc::new(Mutex::new(kernel)),
        })
    }

    /// Run a governance decision.
    ///
    /// # Parameters
    /// - `actor` — the agent id
    /// - `task` — the task id
    /// - `action` — the action type (snake_case: "file_read", "command", …)
    /// - `target` — the target path / resource
    /// - `context_json` — optional JSON string matching `GovernanceContext`;
    ///   pass `""` or `"{}"` to use the default empty context
    ///
    /// # Returns
    /// A JSON string of `GovernanceVerdict` on success; napi error on failure.
    ///
    /// Failure (kernel lock poisoned, context parse error) always returns an
    /// error — the TS facade converts this to a fallback, never a silent allow.
    #[napi]
    pub fn decide(
        &self,
        actor: String,
        task: String,
        action: String,
        target: String,
        context_json: String,
    ) -> Result<String> {
        let ctx: GovernanceContext = if context_json.is_empty() || context_json == "{}" {
            GovernanceContext::default()
        } else {
            parse_json(&context_json, "context")?
        };

        let req =
            GovernanceRequest::new(&actor, &task, parse_action(&action), &target).with_context(ctx);

        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());

        // `decide` is sync and infallible at the kernel level (faults become
        // deny verdicts internally); we only propagate the JSON serialization
        // error, which should never occur given GovernanceVerdict derives Serialize.
        let verdict = kernel.decide(&req);
        to_json(&verdict)
    }

    /// Enforce a single tool invocation.
    ///
    /// # Parameters
    /// - `tool` — the tool name
    /// - `input` — the tool input string (secret-free)
    ///
    /// # Returns
    /// A JSON string of `EnforcementResult`.
    #[napi]
    pub fn enforce_tool(&self, tool: String, input: String) -> Result<String> {
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let result = kernel.enforce_tool(&tool, &input);
        to_json(&result)
    }

    /// Route a request (brain/planner hint).
    ///
    /// # Parameters
    /// Same as `decide` minus `context_json` (context is accepted but routing
    /// only consumes the messages list inside it).
    ///
    /// # Returns
    /// A JSON string of `RouteDecision`.
    #[napi]
    pub fn route(
        &self,
        actor: String,
        task: String,
        action: String,
        target: String,
        context_json: String,
    ) -> Result<String> {
        let ctx: GovernanceContext = if context_json.is_empty() || context_json == "{}" {
            GovernanceContext::default()
        } else {
            parse_json(&context_json, "context")?
        };

        let req =
            GovernanceRequest::new(&actor, &task, parse_action(&action), &target).with_context(ctx);

        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let decision = kernel.route(&req);
        // Convert to the serializable VerdictRoute mirror (RouteDecision itself
        // does not derive Serialize to keep the routing crate serde-free).
        let verdict_route: recoder_governance_kernel::VerdictRoute = decision.into();
        to_json(&verdict_route)
    }

    /// Record an audit entry and return the new tip hash.
    ///
    /// # Parameters
    /// - `timestamp` — ISO-8601 timestamp
    /// - `actor` — agent id
    /// - `action` — audit action string (see `AuditAction`)
    /// - `detail` — secret-free detail string
    /// - `outcome` — one of "allow" | "deny" | "needs_approval" | "success" | "failure" | "info"
    #[napi]
    pub fn record_audit(
        &self,
        timestamp: String,
        actor: String,
        action: String,
        detail: String,
        outcome: String,
    ) -> Result<String> {
        // Parse the action string via serde so we reuse the AuditAction
        // `#[serde(rename_all = "snake_case")]` mapping without duplicating it.
        let audit_action: recoder_governance_types::AuditAction =
            serde_json::from_value(serde_json::Value::String(action.clone()))
                .unwrap_or(recoder_governance_types::AuditAction::DecisionMade);

        let entry = AuditInput {
            timestamp,
            actor,
            action: audit_action,
            detail,
            outcome: parse_outcome(&outcome),
        };

        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let tip = kernel.record_audit(entry);
        Ok(tip)
    }

    /// Verify the audit chain. Returns `true` if the chain is intact.
    #[napi]
    pub fn verify_audit(&self) -> Result<bool> {
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        Ok(kernel.verify_audit().is_ok())
    }

    /// Current audit-chain tip hash.
    #[napi]
    pub fn audit_tip(&self) -> Result<String> {
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        Ok(kernel.audit_tip())
    }

    /// Number of recorded audit entries.
    #[napi]
    pub fn audit_len(&self) -> Result<u32> {
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        // Cast: audit_len() returns usize; a u32 is enough for any realistic chain.
        Ok(kernel.audit_len() as u32)
    }

    // ---- policy (hot-swap + live probes) ------------------------------------

    /// Hot-swap the kernel's policy bundle from a JSON `GovernanceKernelConfig`.
    ///
    /// Fail-closed: an invalid config is rejected (napi error) and the *old*
    /// policy stays live — a bad reload never opens a hole. On success the new
    /// forbidden/secret paths, routing thresholds and approval policy take effect
    /// for subsequent `decide()` calls atomically.
    #[napi]
    pub fn reload_policies(&self, config_json: String) -> Result<()> {
        let config: GovernanceKernelConfig = parse_json(&config_json, "GovernanceKernelConfig")?;
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        kernel
            .reload_policies(config)
            .map_err(|e| js_err(format!("governance-napi: reload_policies rejected: {e}")))
    }

    /// True if `target` is a forbidden path under the *live* policy — the same
    /// check the decision pipeline's forbidden-path stage applies. A read-only
    /// probe (no audit entry, no decision) so the facade can pre-gate a write.
    #[napi]
    pub fn is_forbidden_path(&self, target: String) -> Result<bool> {
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        Ok(kernel.is_forbidden_path(&target))
    }

    /// True if `target` is a secret path under the *live* policy. Same read-only
    /// contract as [`is_forbidden_path`](Self::is_forbidden_path).
    #[napi]
    pub fn is_secret_path(&self, target: String) -> Result<bool> {
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        Ok(kernel.is_secret_path(&target))
    }

    // ---- approvals on the SHARED kernel -------------------------------------
    // These operate on THIS kernel's own ApprovalManager, so an approval submitted
    // here is visible to the same kernel that runs `decide()` — unlike the
    // standalone `NapiApprovalManager`, which owns an independent kernel and is
    // kept only for callers that want an isolated approval gate.

    /// Submit an approval request against the shared kernel's approval manager.
    ///
    /// `request_json` matches `ApprovalRequest`. Returns
    /// `{ "outcome": "approved" | "denied" | "pending", "request_id": "..." }`.
    #[napi]
    pub fn submit_approval(&self, request_json: String) -> Result<String> {
        use recoder_governance_approval::SubmitOutcome;
        use recoder_governance_types::{ApprovalDecision, ApprovalRequest};

        let req: ApprovalRequest = parse_json(&request_json, "ApprovalRequest")?;
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let now_ms = now_ms();
        let outcome = kernel.approvals().submit(req.clone(), now_ms);
        let (outcome_str, request_id) = match outcome {
            SubmitOutcome::Immediate(ApprovalDecision::Approved) => {
                ("approved".to_string(), req.id.clone())
            }
            SubmitOutcome::Immediate(_) => ("denied".to_string(), req.id.clone()),
            SubmitOutcome::Pending { request_id, .. } => ("pending".to_string(), request_id),
        };
        to_json(&serde_json::json!({
            "outcome": outcome_str,
            "request_id": request_id,
        }))
    }

    /// Resolve a pending approval on the shared kernel. `decision` is
    /// `"approved"` | `"denied"`. Returns the `ApprovalResponse` JSON, or an error
    /// if no such pending request exists.
    #[napi]
    pub fn resolve_approval(
        &self,
        request_id: String,
        decision: String,
        decided_by: String,
    ) -> Result<String> {
        use recoder_governance_types::ApprovalDecision;

        let decision = match decision.as_str() {
            "approved" => ApprovalDecision::Approved,
            _ => ApprovalDecision::Denied,
        };
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let response = kernel
            .approvals()
            .resolve(&request_id, decision, Some(decided_by), now_ms())
            .map_err(|e| js_err(format!("governance-napi: resolve_approval: {e}")))?;
        to_json(&response)
    }

    /// JSON array of the shared kernel's currently pending `ApprovalRequest`s.
    #[napi]
    pub fn list_pending_approvals(&self) -> Result<String> {
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        to_json(&kernel.approvals().list_pending())
    }

    /// Count of pending approvals on the shared kernel.
    #[napi]
    pub fn pending_approval_count(&self) -> Result<u32> {
        let kernel = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        Ok(kernel.approvals().pending_count() as u32)
    }
}

/// Milliseconds since the Unix epoch (monotonic-safe default of `0` on the
/// impossible pre-epoch clock — never panics).
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

// ---- NapiApprovalManager ----------------------------------------------------

/// Thin NAPI wrapper over `ApprovalManager` (the sync approval gate embedded
/// in the kernel). Exposed separately so the TS facade can submit/resolve
/// approvals without a full `decide()` round-trip.
#[napi]
pub struct NapiApprovalManager {
    kernel: Arc<Mutex<GovernanceKernel>>,
}

#[napi]
impl NapiApprovalManager {
    /// Construct a manager backed by the given kernel.
    ///
    /// The TS facade should share the same `NapiGovernanceKernel` instance and
    /// pass its inner `Arc` here; since NAPI does not expose `Arc` directly,
    /// the facade creates both wrappers from the same `NapiGovernanceKernel`.
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        let config = GovernanceKernelConfig::default();
        let kernel = GovernanceKernel::new(config).map_err(|e| {
            js_err(format!(
                "governance-napi: approval manager init failed: {e}"
            ))
        })?;
        Ok(Self {
            kernel: Arc::new(Mutex::new(kernel)),
        })
    }

    /// Submit an approval request.
    ///
    /// # Parameters (JSON object fields)
    /// - `id` — unique request id
    /// - `agent_id` — the requesting agent
    /// - `tool_name` — the tool requiring approval
    /// - `description` — human-readable description
    /// - `action_summary` — short summary of what will happen
    /// - `risk_level` — one of "low" | "medium" | "high" | "critical"
    /// - `timeout_secs` — timeout in seconds
    ///
    /// # Returns
    /// JSON string: `{ "outcome": "approved" | "denied" | "pending", "request_id": "..." }`
    #[napi]
    pub fn request_approval(&self, request_json: String) -> Result<String> {
        use recoder_governance_approval::SubmitOutcome;
        use recoder_governance_types::{ApprovalDecision, ApprovalRequest};

        let req: ApprovalRequest = parse_json(&request_json, "ApprovalRequest")?;

        let kernel = self.kernel.lock().unwrap_or_else(|e| e.into_inner());

        let outcome = kernel.approvals().submit(req.clone(), now_ms());

        let (outcome_str, request_id) = match outcome {
            SubmitOutcome::Immediate(ApprovalDecision::Approved) => {
                ("approved".to_string(), req.id.clone())
            }
            SubmitOutcome::Immediate(_) => ("denied".to_string(), req.id.clone()),
            SubmitOutcome::Pending { request_id, .. } => ("pending".to_string(), request_id),
        };

        to_json(&serde_json::json!({
            "outcome": outcome_str,
            "request_id": request_id,
        }))
    }

    /// Resolve a pending approval.
    ///
    /// # Parameters
    /// - `request_id` — the pending request id
    /// - `decision` — `"approved"` | `"denied"`
    /// - `decided_by` — identity of the resolver
    ///
    /// # Returns
    /// JSON string of `ApprovalResponse` on success; error if not found.
    #[napi]
    pub fn resolve_approval(
        &self,
        request_id: String,
        decision: String,
        decided_by: String,
    ) -> Result<String> {
        use recoder_governance_types::ApprovalDecision;

        let decision = match decision.as_str() {
            "approved" => ApprovalDecision::Approved,
            _ => ApprovalDecision::Denied,
        };

        let kernel = self.kernel.lock().unwrap_or_else(|e| e.into_inner());

        let response = kernel
            .approvals()
            .resolve(&request_id, decision, Some(decided_by), now_ms())
            .map_err(|e| js_err(format!("governance-napi: resolve_approval: {e}")))?;

        to_json(&response)
    }
}
