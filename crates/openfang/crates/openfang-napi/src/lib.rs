//! NAPI-RS binding for the OpenFang agent-engine core — REAL in-process fusion.
//!
//! The actual `openfang-kernel` (and its whole graph: runtime/wasmtime, memory/
//! sqlite, channels, skills, hands, wire, extensions) is compiled INTO this
//! `.node`. The Node.js conductor (docker-backend) boots the kernel and calls it
//! directly in-process — no subprocess, no loopback HTTP, no stub. This is the
//! Cursor↔VSCode model: the engine's real source, compiled in and called.
//!
//! # Surface
//! `OpenfangEngine` wraps a real, booted `Arc<OpenFangKernel>` plus an owned tokio
//! runtime for the async entry points. Every method calls the actual kernel:
//! agents (list / run / activate / kill / stop / sessions / model / skills),
//! Hands (bundled / active / activate / pause / resume / deactivate), triggers,
//! bindings, models, skills, and usage/budget. Methods return JSON strings the TS
//! facade parses — errors surface as `{ "ok": false, "error": "…" }` values.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use openfang_hands::bundled::bundled_hands;
use openfang_kernel::OpenFangKernel;
use openfang_types::agent::AgentId;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fmt::Display;
use std::path::PathBuf;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Free probes — available before any kernel boot
// ---------------------------------------------------------------------------

/// Native addon version + build mode. `build_mode: "full"` distinguishes this
/// real fusion build from the historical thin stub.
#[napi]
pub fn native_version() -> String {
    json!({
        "addon": env!("CARGO_PKG_VERSION"),
        "crate": "openfang-napi",
        "build_profile": if cfg!(debug_assertions) { "debug" } else { "release" },
        "build_mode": "full",
    })
    .to_string()
}

/// Fast liveness probe — confirms the `.node` loaded and is callable.
#[napi]
pub fn ping() -> bool {
    true
}

/// The bundled Hands compiled into the engine — `[{id, name, description}]`.
/// A pure read of the linked-in `openfang-hands` crate; works before any boot.
#[napi]
pub fn bundled_hands_json() -> String {
    let hands: Vec<_> = bundled_hands()
        .into_iter()
        .map(|(id, name, description)| json!({ "id": id, "name": name, "description": description }))
        .collect();
    json!({ "ok": true, "hands": hands }).to_string()
}

// ---------------------------------------------------------------------------
// JSON helpers — keep every method total (errors become values, never panics)
// ---------------------------------------------------------------------------

fn err_json(e: impl Display) -> String {
    json!({ "ok": false, "error": e.to_string() }).to_string()
}

/// Serialize a value into `{ ok: true, <key>: <value> }`, or an error object.
fn ok_data<T: serde::Serialize>(key: &str, value: T) -> String {
    match serde_json::to_value(&value) {
        Ok(v) => json!({ "ok": true, key: v }).to_string(),
        Err(e) => err_json(format!("serialize {key}: {e}")),
    }
}

/// Map `KernelResult<()>` to `{ ok: true }` / `{ ok: false, error }`.
/// (Explicit `std::result::Result` — the napi prelude glob shadows `Result`.)
fn unit_result<E: Display>(r: std::result::Result<(), E>) -> String {
    match r {
        Ok(()) => json!({ "ok": true }).to_string(),
        Err(e) => err_json(e),
    }
}

/// Parse a UUID string, mapping failure to a value-level error string.
fn parse_uuid(s: &str) -> std::result::Result<uuid::Uuid, String> {
    uuid::Uuid::parse_str(s).map_err(|e| format!("invalid uuid '{s}': {e}"))
}

/// Resolve an agent id string: a valid UUID maps directly; anything else uses the
/// kernel's own `AgentId::from_string` (SHA-1 namespace) so Hand names resolve to
/// the same stable id the kernel assigns them.
fn parse_agent_id(s: &str) -> AgentId {
    match uuid::Uuid::parse_str(s) {
        Ok(u) => AgentId(u),
        Err(_) => AgentId::from_string(s),
    }
}

// ---------------------------------------------------------------------------
// OpenfangEngine — a real, booted kernel held in-process
// ---------------------------------------------------------------------------

/// A live handle to the OpenFang engine, booted in the host Node process.
#[napi]
pub struct OpenfangEngine {
    kernel: Arc<OpenFangKernel>,
    rt: tokio::runtime::Runtime,
}

#[napi]
impl OpenfangEngine {
    /// Boot the real kernel from `~/.openfang/config.toml` (or an explicit path).
    #[napi(factory)]
    pub fn boot(config_path: Option<String>) -> Result<OpenfangEngine> {
        let path = config_path.map(PathBuf::from);
        let kernel = OpenFangKernel::boot(path.as_deref())
            .map_err(|e| Error::from_reason(format!("openfang kernel boot failed: {e}")))?;
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .map_err(|e| Error::from_reason(format!("tokio runtime init failed: {e}")))?;
        Ok(OpenfangEngine { kernel: Arc::new(kernel), rt })
    }

    // ---- Health / inventory (reads) ---------------------------------------

    /// Live engine health — a real read of the booted kernel's agent registry.
    #[napi]
    pub fn health(&self) -> String {
        json!({
            "ok": true,
            "agents": self.kernel.registry.count(),
            "active_hands": self.kernel.hand_registry.list_instances().len(),
            "addon_version": env!("CARGO_PKG_VERSION"),
            "build_mode": "full",
        })
        .to_string()
    }

    /// Agents registered in the booted kernel — `{id, name, state}` each.
    #[napi]
    pub fn list_agents(&self) -> String {
        let agents: Vec<Value> = self
            .kernel
            .registry
            .list()
            .into_iter()
            .map(|e| json!({ "id": e.id.to_string(), "name": e.name, "state": e.state }))
            .collect();
        json!({ "ok": true, "agents": agents }).to_string()
    }

    /// Active Hand instances in the live kernel (full HandInstance objects).
    #[napi]
    pub fn list_active_hands(&self) -> String {
        ok_data("hands", self.kernel.hand_registry.list_instances())
    }

    /// All Hand definitions known to the kernel (bundled + user-installed).
    #[napi]
    pub fn list_hand_definitions(&self) -> String {
        ok_data("hands", self.kernel.hand_registry.list_definitions())
    }

    /// Event triggers (optionally filtered by agent id).
    #[napi]
    pub fn list_triggers(&self, agent_id: Option<String>) -> String {
        let filter = agent_id.map(|s| parse_agent_id(&s));
        ok_data("triggers", self.kernel.list_triggers(filter))
    }

    /// Channel/agent bindings from the live config.
    #[napi]
    pub fn list_bindings(&self) -> String {
        ok_data("bindings", self.kernel.list_bindings())
    }

    /// Model catalog entries visible to the engine.
    #[napi]
    pub fn list_models(&self) -> String {
        match self.kernel.model_catalog.read() {
            Ok(catalog) => ok_data("models", catalog.list_models()),
            Err(e) => err_json(format!("model_catalog lock poisoned: {e}")),
        }
    }

    /// Installed skill names.
    #[napi]
    pub fn list_skills(&self) -> String {
        match self.kernel.skill_registry.read() {
            Ok(reg) => json!({ "ok": true, "skills": reg.skill_names() }).to_string(),
            Err(e) => err_json(format!("skill_registry lock poisoned: {e}")),
        }
    }

    /// Usage/budget summary across the kernel (or a single agent when `agent_id`).
    #[napi]
    pub fn usage_summary(&self, agent_id: Option<String>) -> String {
        let filter = agent_id.map(|s| parse_agent_id(&s));
        match self.kernel.metering.get_summary(filter) {
            Ok(summary) => ok_data("usage", summary),
            Err(e) => err_json(e),
        }
    }

    /// Per-session token/cost usage for one agent: `{ input, output, cost }`.
    #[napi]
    pub fn session_usage_cost(&self, agent_id: String) -> String {
        match self.kernel.session_usage_cost(parse_agent_id(&agent_id)) {
            Ok((input, output, cost)) => {
                json!({ "ok": true, "input_tokens": input, "output_tokens": output, "cost": cost }).to_string()
            }
            Err(e) => err_json(e),
        }
    }

    /// Session ids/metadata for one agent.
    #[napi]
    pub fn list_agent_sessions(&self, agent_id: String) -> String {
        match self.kernel.list_agent_sessions(parse_agent_id(&agent_id)) {
            Ok(sessions) => json!({ "ok": true, "sessions": sessions }).to_string(),
            Err(e) => err_json(e),
        }
    }

    // ---- Agent lifecycle (writes) -----------------------------------------

    /// Send a message to an agent and run one real agent-loop turn (async, blocked on).
    #[napi]
    pub fn run_agent(&self, agent_id: String, message: String) -> String {
        let aid = parse_agent_id(&agent_id);
        match self.rt.block_on(self.kernel.send_message(aid, &message)) {
            Ok(r) => json!({
                "ok": true,
                "agent_id": agent_id,
                "response": r.response,
                "iterations": r.iterations,
                "input_tokens": r.total_usage.input_tokens,
                "output_tokens": r.total_usage.output_tokens,
            })
            .to_string(),
            Err(e) => json!({ "ok": false, "agent_id": agent_id, "error": format!("{e}") }).to_string(),
        }
    }

    /// Activate a registered agent — returns a status string on success.
    #[napi]
    pub fn activate_agent(&self, agent_id: String) -> String {
        match self.kernel.activate_agent(parse_agent_id(&agent_id)) {
            Ok(status) => json!({ "ok": true, "status": status }).to_string(),
            Err(e) => err_json(e),
        }
    }

    /// Stop the current run of an agent — returns `{ ok, stopped }`.
    #[napi]
    pub fn stop_agent_run(&self, agent_id: String) -> String {
        match self.kernel.stop_agent_run(parse_agent_id(&agent_id)) {
            Ok(stopped) => json!({ "ok": true, "stopped": stopped }).to_string(),
            Err(e) => err_json(e),
        }
    }

    /// Kill an agent (removes it from the registry).
    #[napi]
    pub fn kill_agent(&self, agent_id: String) -> String {
        unit_result(self.kernel.kill_agent(parse_agent_id(&agent_id)))
    }

    /// Reset an agent's active session.
    #[napi]
    pub fn reset_session(&self, agent_id: String) -> String {
        unit_result(self.kernel.reset_session(parse_agent_id(&agent_id)))
    }

    /// Clear an agent's conversation history.
    #[napi]
    pub fn clear_agent_history(&self, agent_id: String) -> String {
        unit_result(self.kernel.clear_agent_history(parse_agent_id(&agent_id)))
    }

    /// Set an agent's model (optionally pinning an explicit provider).
    #[napi]
    pub fn set_agent_model(&self, agent_id: String, model: String, provider: Option<String>) -> String {
        unit_result(self.kernel.set_agent_model(parse_agent_id(&agent_id), &model, provider.as_deref()))
    }

    /// Set an agent's enabled skills.
    #[napi]
    pub fn set_agent_skills(&self, agent_id: String, skills: Vec<String>) -> String {
        unit_result(self.kernel.set_agent_skills(parse_agent_id(&agent_id), skills))
    }

    // ---- Hands lifecycle (writes) -----------------------------------------

    /// Activate a bundled Hand by id, creating a live instance in the kernel.
    #[napi]
    pub fn activate_hand(&self, hand_id: String) -> String {
        let config: HashMap<String, Value> = HashMap::new();
        match self.kernel.activate_hand(&hand_id, config, None) {
            Ok(instance) => match serde_json::to_value(&instance) {
                Ok(v) => json!({ "ok": true, "hand_id": hand_id, "instance": v }).to_string(),
                Err(e) => err_json(format!("serialize: {e}")),
            },
            Err(e) => json!({ "ok": false, "hand_id": hand_id, "error": format!("{e}") }).to_string(),
        }
    }

    /// Pause a running Hand instance (by instance uuid).
    #[napi]
    pub fn pause_hand(&self, instance_id: String) -> String {
        match parse_uuid(&instance_id) {
            Ok(id) => unit_result(self.kernel.pause_hand(id)),
            Err(e) => err_json(e),
        }
    }

    /// Resume a paused Hand instance (by instance uuid).
    #[napi]
    pub fn resume_hand(&self, instance_id: String) -> String {
        match parse_uuid(&instance_id) {
            Ok(id) => unit_result(self.kernel.resume_hand(id)),
            Err(e) => err_json(e),
        }
    }

    /// Deactivate (tear down) a Hand instance (by instance uuid).
    #[napi]
    pub fn deactivate_hand(&self, instance_id: String) -> String {
        match parse_uuid(&instance_id) {
            Ok(id) => unit_result(self.kernel.deactivate_hand(id)),
            Err(e) => err_json(e),
        }
    }

    // ---- Triggers (writes) ------------------------------------------------

    /// Remove a trigger by id — returns `{ ok, removed }`.
    #[napi]
    pub fn remove_trigger(&self, trigger_id: String) -> String {
        match parse_uuid(&trigger_id) {
            Ok(id) => {
                let removed = self.kernel.remove_trigger(openfang_kernel::triggers::TriggerId(id));
                json!({ "ok": true, "removed": removed }).to_string()
            }
            Err(e) => err_json(e),
        }
    }

    /// Enable/disable a trigger by id — returns `{ ok, updated }`.
    #[napi]
    pub fn set_trigger_enabled(&self, trigger_id: String, enabled: bool) -> String {
        match parse_uuid(&trigger_id) {
            Ok(id) => {
                let updated = self
                    .kernel
                    .set_trigger_enabled(openfang_kernel::triggers::TriggerId(id), enabled);
                json!({ "ok": true, "updated": updated }).to_string()
            }
            Err(e) => err_json(e),
        }
    }

    // ---- Skills (writes) --------------------------------------------------

    /// Reload skills from disk into the live registry.
    #[napi]
    pub fn reload_skills(&self) -> String {
        self.kernel.reload_skills();
        json!({ "ok": true }).to_string()
    }
}

// ---------------------------------------------------------------------------
// Unit tests (no .node build required)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_version_is_full_build() {
        let parsed: Value = serde_json::from_str(&native_version()).unwrap();
        assert_eq!(parsed["crate"], "openfang-napi");
        assert_eq!(parsed["build_mode"], "full");
    }

    #[test]
    fn ping_returns_true() {
        assert!(ping());
    }

    #[test]
    fn bundled_hands_are_real() {
        let parsed: Value = serde_json::from_str(&bundled_hands_json()).unwrap();
        assert_eq!(parsed["ok"], true);
        assert!(parsed["hands"].as_array().unwrap().len() > 0, "engine must link real bundled hands");
    }

    #[test]
    fn parse_agent_id_accepts_uuid_and_name() {
        let u = "4ca2f155-0318-4465-9f87-554d0a1a292f";
        assert_eq!(parse_agent_id(u).to_string(), u);
        // A non-uuid name is stable (same input → same id).
        assert_eq!(parse_agent_id("researcher"), parse_agent_id("researcher"));
    }
}
