//! NAPI-RS binding crate for the OpenFang agent-engine core.
//!
//! # Purpose
//!
//! Exposes a thin, synchronous-callable surface over the openfang-kernel entry
//! points so the Node.js conductor (docker-backend) can call the engine **in-
//! process** rather than via the loopback HTTP subprocess.
//!
//! # Thin-build mode (CI / disk-constrained)
//!
//! The full openfang workspace (14 crates, wasmtime, openssl-vendored, tokio-
//! tungstenite, etc.) is disk-deferred and gitignored. Only this binding crate is
//! committed and built in CI. In this thin mode:
//!
//! * `native_version()` and `ping()` work fully — zero deps.
//! * `bootstrap_kernel()` and `run_agent()` return degrade-safe JSON
//!   `{ "ok": false, "error": "kernel not available in thin build" }` so the TS
//!   facade falls back to the subprocess/loopback path automatically.
//!
//! # Design contract
//!
//! * Every public function is `#[napi]`-annotated.
//! * Return values are plain JSON strings — the TS facade parses them without
//!   needing to know internal Rust types.
//! * Every function returns `String` or `bool` so errors surface as values, not
//!   panics. The JSON error shape is `{ "ok": false, "error": "…" }`.
//!
//! # Full build (disk available, full workspace present)
//!
//! When disk allows and all 14 openfang crates are present, build with:
//! ```bash
//! cd crates/openfang && cargo build -p openfang-napi --release
//! ```

use napi_derive::napi;
use serde_json::json;

// ---------------------------------------------------------------------------
// Health / version probes — synchronous, zero allocation, always available
// ---------------------------------------------------------------------------

/// Returns a JSON string with the native addon version.  The facade uses this
/// to confirm the `.node` loaded correctly before attempting heavier entry points.
///
/// ```js
/// const addon = require('./openfang_napi.node');
/// const v = JSON.parse(addon.nativeVersion());
/// console.log(v.addon_version); // "0.6.9"
/// ```
#[napi]
pub fn native_version() -> String {
    json!({
        "addon": env!("CARGO_PKG_VERSION"),
        "kernel_version": env!("CARGO_PKG_VERSION"),
        "crate": "openfang-napi",
        "build_profile": if cfg!(debug_assertions) { "debug" } else { "release" },
        "build_mode": "thin",
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
// Kernel bootstrap — degrade-safe stub
// ---------------------------------------------------------------------------

/// Bootstrap an OpenFang kernel config and return a JSON health summary.
///
/// In the thin build (CI / disk-constrained) the kernel is not available.
/// Returns `{ "ok": false, "error": "kernel not available in thin build" }` so
/// the TS facade falls back to the subprocess/loopback path automatically.
///
/// In the full build (when all 14 openfang crates are compiled in), this stub
/// is replaced by the real implementation that loads `~/.openfang/config.toml`.
#[napi]
pub fn bootstrap_kernel(_config_path: Option<String>) -> String {
    json!({
        "ok": false,
        "error": "openfang-napi thin build: kernel not compiled in. \
                  The TS facade will fall back to the subprocess path.",
        "build_mode": "thin",
    })
    .to_string()
}

// ---------------------------------------------------------------------------
// Agent run — degrade-safe stub
// ---------------------------------------------------------------------------

/// Run a single agent-loop turn and return the result as JSON.
///
/// In the thin build the kernel is not available. Returns
/// `{ "ok": false, "error": "kernel not available in thin build" }` so the TS
/// facade falls back gracefully.
#[napi]
pub fn run_agent(
    agent_id: String,
    _message: String,
    _config_path: Option<String>,
) -> String {
    json!({
        "ok": false,
        "agent_id": agent_id,
        "error": "openfang-napi thin build: kernel not compiled in. \
                  The TS facade will fall back to the subprocess path.",
        "build_mode": "thin",
    })
    .to_string()
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
        assert_eq!(parsed["crate"], "openfang-napi");
        assert_eq!(parsed["build_mode"], "thin");
    }

    #[test]
    fn ping_returns_true() {
        assert!(ping());
    }

    #[test]
    fn bootstrap_kernel_returns_degrade_safe_json() {
        let raw = bootstrap_kernel(None);
        let parsed: serde_json::Value =
            serde_json::from_str(&raw).expect("bootstrap_kernel must return valid JSON");
        assert_eq!(parsed["ok"], false);
        assert!(parsed["error"].is_string());
        assert_eq!(parsed["build_mode"], "thin");
    }

    #[test]
    fn run_agent_returns_degrade_safe_json() {
        let raw = run_agent("test-id".to_string(), "hello".to_string(), None);
        let parsed: serde_json::Value =
            serde_json::from_str(&raw).expect("run_agent must return valid JSON");
        assert_eq!(parsed["ok"], false);
        assert_eq!(parsed["agent_id"], "test-id");
        assert_eq!(parsed["build_mode"], "thin");
    }
}
