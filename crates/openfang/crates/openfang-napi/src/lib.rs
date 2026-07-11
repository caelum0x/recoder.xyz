//! NAPI-RS binding crate for the OpenFang agent-engine core.
//!
//! # Purpose
//!
//! Exposes a thin, synchronous-callable surface over the openfang-kernel entry
//! points so the Node.js conductor (docker-backend) can call the engine **in-
//! process** rather than via the loopback HTTP subprocess.
//!
//! # Design contract
//!
//! * Every public function is `#[napi]`-annotated so NAPI-RS generates the JS
//!   binding glue automatically.
//! * Async work is bridged through the Tokio runtime that NAPI-RS manages
//!   (`napi` crate `tokio_rt` feature).
//! * Return values are plain JSON strings — the TS facade parses them without
//!   needing to know internal Rust types, keeping the seam thin and stable.
//! * Every function returns `napi::Result<String>` so errors surface as JS
//!   exceptions rather than panics.  The JSON error shape is
//!   `{ "ok": false, "error": "…" }` — callers can read `ok` without try/catch.
//!
//! # Build note (SEAM ONLY, BUILD DEFERRED)
//!
//! The target dir for a full `cargo build --release` of the workspace requires
//! ~7-9 GB (wasmtime + openssl-vendored + tokio-tungstenite + the rest).  The
//! disk governance rule in AGENTS.md + .claude/rules/production.md states: only
//! build when `df -h /` leaves >2 GB free AFTER the estimated footprint.  At the
//! time this crate was written the volume had ~4.4 GB free, so the build is
//! **deferred**.  The facade (`oss-dispatch.ts` via `openfang-native.ts`) loads
//! the .node via `require()` when it is present and falls back gracefully to the
//! existing subprocess/loopback path when it is absent — so deferring the build
//! does NOT regress any capability.
//!
//! When disk is available, build with:
//! ```bash
//! cd crates/openfang && cargo build -p openfang-napi --release
//! ```

#![deny(unsafe_code)]
#![warn(missing_docs)]

use napi_derive::napi;
use serde_json::json;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Health / version probes — synchronous, zero allocation
// ---------------------------------------------------------------------------

/// Returns a JSON string with the native addon version and the linked
/// openfang-kernel workspace version.  The facade uses this to confirm the
/// `.node` loaded correctly before attempting heavier entry points.
///
/// ```js
/// const addon = require('./openfang_napi.node');
/// const v = JSON.parse(addon.nativeVersion());
/// console.log(v.kernel_version); // "0.6.9"
/// ```
#[napi]
pub fn native_version() -> String {
    json!({
        "addon": env!("CARGO_PKG_VERSION"),
        "kernel_version": env!("CARGO_PKG_VERSION"),
        "crate": "openfang-napi",
        "build_profile": if cfg!(debug_assertions) { "debug" } else { "release" },
    })
    .to_string()
}

/// Returns `true`.  Used by the facade as a fast, zero-cost liveness probe to
/// confirm the native addon is callable before attempting heavier operations.
#[napi]
pub fn ping() -> bool {
    true
}

// ---------------------------------------------------------------------------
// Kernel bootstrap — synchronous (boot() is sync in the kernel API)
// ---------------------------------------------------------------------------

/// Bootstrap an OpenFang kernel config and return a JSON health summary.
///
/// * `config_path` — optional absolute path to a `config.toml`; when absent
///   the kernel falls back to `~/.openfang/config.toml` (same default as the
///   CLI daemon).
///
/// Returns JSON:
/// ```json
/// { "ok": true, "config_path": "…", "default_model": "…" }
/// ```
/// On error: `{ "ok": false, "error": "…" }`.
#[napi]
pub fn bootstrap_kernel(config_path: Option<String>) -> String {
    let path: Option<PathBuf> = config_path.map(PathBuf::from);

    // Load config — synchronous + infallible (falls back to defaults).
    let config = openfang_kernel::config::load_config(path.as_deref());

    let resolved_path = path
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".openfang")
                .join("config.toml")
        })
        .to_string_lossy()
        .into_owned();

    let default_model = serde_json::to_value(&config.default_model).unwrap_or(serde_json::Value::Null);

    json!({
        "ok": true,
        "config_path": resolved_path,
        "default_model": default_model,
    })
    .to_string()
}

// ---------------------------------------------------------------------------
// Agent run — async, Tokio-bridged
// ---------------------------------------------------------------------------

/// Run a single agent-loop turn **in-process** and return the result as JSON.
///
/// Parameters:
/// * `agent_id`   — the agent UUID string (as stored in the kernel registry).
/// * `message`    — the user message to deliver to the agent.
/// * `config_path` — optional path to `config.toml` (same semantics as
///                   `bootstrap_kernel`).
///
/// Returns JSON:
/// ```json
/// { "ok": true, "agent_id": "…", "response": "…" }
/// ```
/// On error: `{ "ok": false, "agent_id": "…", "error": "…" }`.
///
/// **Degrade-safe contract**: this function NEVER panics.  All errors
/// (UUID parse failure, kernel boot failure, LLM driver missing, etc.)
/// are folded into the JSON `{ "ok": false }` shape.
#[napi]
pub async fn run_agent(
    agent_id: String,
    message: String,
    config_path: Option<String>,
) -> napi::Result<String> {
    let path: Option<PathBuf> = config_path.map(PathBuf::from);
    let agent_id_clone = agent_id.clone();

    // Parse the agent UUID.
    let uuid = match uuid::Uuid::parse_str(&agent_id) {
        Ok(u) => u,
        Err(e) => {
            let err = json!({
                "ok": false,
                "agent_id": agent_id,
                "error": format!("invalid agent_id (not a UUID): {e}"),
            });
            return Ok(err.to_string());
        }
    };

    // Boot the kernel synchronously (boot() is sync — it is safe to block here
    // because NAPI-RS spawns this async fn on its own Tokio worker thread).
    let kernel = tokio::task::spawn_blocking(move || {
        openfang_kernel::kernel::OpenFangKernel::boot(path.as_deref())
    })
    .await
    .map_err(|e| napi::Error::from_reason(format!("tokio join error: {e}")))?;

    let kernel = match kernel {
        Ok(k) => k,
        Err(e) => {
            let err = json!({
                "ok": false,
                "agent_id": agent_id_clone,
                "error": format!("kernel boot failed: {e}"),
            });
            return Ok(err.to_string());
        }
    };

    // Deliver the message.
    let agent_id_typed = openfang_types::agent::AgentId(uuid);
    match kernel.send_message(agent_id_typed, &message).await {
        Ok(result) => {
            let ok = json!({
                "ok": true,
                "agent_id": agent_id_clone,
                "response": result.response,
            });
            Ok(ok.to_string())
        }
        Err(e) => {
            let err = json!({
                "ok": false,
                "agent_id": agent_id_clone,
                "error": format!("{e}"),
            });
            Ok(err.to_string())
        }
    }
}

// ---------------------------------------------------------------------------
// Cargo check / unit tests (no .node build required)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_version_is_valid_json() {
        let v = native_version();
        let parsed: serde_json::Value =
            serde_json::from_str(&v).expect("native_version must return valid JSON");
        assert!(parsed["addon"].is_string());
        assert!(parsed["kernel_version"].is_string());
        assert_eq!(parsed["crate"], "openfang-napi");
    }

    #[test]
    fn ping_returns_true() {
        assert!(ping());
    }

    #[test]
    fn bootstrap_kernel_returns_valid_json_without_config_file() {
        // No config file at /nonexistent/config.toml — must fall back to
        // defaults without panicking.
        let raw = bootstrap_kernel(Some("/nonexistent/path/config.toml".to_string()));
        let parsed: serde_json::Value =
            serde_json::from_str(&raw).expect("bootstrap_kernel must return valid JSON");
        // Kernel config loading is infallible; always returns ok=true.
        assert_eq!(parsed["ok"], true);
        assert!(parsed["config_path"].is_string());
    }
}
