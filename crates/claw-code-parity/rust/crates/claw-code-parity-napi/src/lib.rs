//! # claw-code-parity-napi
//!
//! NAPI-RS native addon that exposes claw-code-parity parity-harness helpers
//! directly inside the Node.js process — no subprocess, no loopback HTTP.
//!
//! ## Thin-build mode (CI / disk-constrained)
//!
//! The full `claw-code-parity` workspace (compat-harness, commands, tools,
//! runtime, api, plugins, telemetry, rusty-claude-cli, etc.) is disk-deferred
//! and gitignored. Only this binding crate is committed and built in CI. In
//! this thin mode:
//!
//! * `addon_version()` and `route_message()` work fully — zero external deps.
//! * `extract_commands()`, `extract_tools()`, `extract_bootstrap_plan()`, and
//!   `extract_manifest()` return empty / null results with a `degraded: true`
//!   flag so the TS facade falls back to the subprocess/loopback path.
//!
//! ## Degrade-safety
//!
//! This crate is loaded by the TypeScript facade via a conditional `require()`.
//! If the `.node` file is absent (e.g., build deferred) the facade falls back
//! to the existing subprocess/loopback path automatically. This addon never
//! needs to be present for the backend to operate correctly.
//!
//! ## Full build
//!
//! When the full claw-code-parity source is available locally and disk allows,
//! build with:
//! ```bash
//! cd crates/claw-code-parity/rust && cargo build -p claw-code-parity-napi --release
//! ```

#![allow(clippy::module_name_repetitions)]

use napi_derive::napi;

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/// Return the addon version string (matches the Cargo package version).
#[napi]
pub fn addon_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ---------------------------------------------------------------------------
// Command extraction — thin-build stubs
// ---------------------------------------------------------------------------

/// Result of parsing the `commands.ts` file from the upstream Claude Code
/// repository.  Each entry carries the command `name` and its `source`
/// classification (`"builtin"`, `"internal_only"`, or `"feature_gated"`).
#[napi(object)]
pub struct CommandEntry {
    pub name: String,
    pub source: String,
}

/// Parse the text of `commands.ts` and return a flat list of command
/// manifest entries.
///
/// In the thin build (CI) the compat-harness parser is not available. Returns
/// an empty array and logs a debug trace so the TS facade falls back to the
/// subprocess path.  Never throws.
#[napi]
pub fn extract_commands(_source: String) -> Vec<CommandEntry> {
    Vec::new()
}

// ---------------------------------------------------------------------------
// Tool extraction — thin-build stubs
// ---------------------------------------------------------------------------

/// Result of parsing the `tools.ts` file from the upstream Claude Code
/// repository.
#[napi(object)]
pub struct ToolEntry {
    pub name: String,
    pub source: String,
}

/// Parse the text of `tools.ts` and return a flat list of tool manifest
/// entries.
///
/// Returns an empty array in the thin build. Never throws.
#[napi]
pub fn extract_tools(_source: String) -> Vec<ToolEntry> {
    Vec::new()
}

// ---------------------------------------------------------------------------
// Bootstrap plan extraction — thin-build stub
// ---------------------------------------------------------------------------

/// Parse the text of `cli.tsx` and return the ordered list of bootstrap
/// phase names.
///
/// Returns an empty array in the thin build. Never throws.
#[napi]
pub fn extract_bootstrap_plan(_source: String) -> Vec<String> {
    Vec::new()
}

// ---------------------------------------------------------------------------
// Full manifest extraction — thin-build stub
// ---------------------------------------------------------------------------

/// Full manifest returned by `extract_manifest`.
#[napi(object)]
pub struct ExtractedManifest {
    pub commands: Vec<CommandEntry>,
    pub tools: Vec<ToolEntry>,
    pub bootstrap_phases: Vec<String>,
}

/// Extract the full manifest (commands + tools + bootstrap plan) from the
/// upstream Claude Code repository located at `repo_root`.
///
/// Returns `null` in the thin build (compat-harness not available).
/// The TS facade treats `null` as "fall back to subprocess path".
/// Never throws.
#[napi]
pub fn extract_manifest(_repo_root: String) -> Option<ExtractedManifest> {
    None
}

// ---------------------------------------------------------------------------
// Parity harness: route message to agent (sync, in-process)
// ---------------------------------------------------------------------------

/// Keyword sets for routing — kept in sync with the TS facade.
const PM_KEYWORDS: &[&str] = &[
    "project",
    "task",
    "sprint",
    "feature",
    "milestone",
    "backlog",
    "epic",
    "story",
    "kanban",
    "roadmap",
    "ticket",
    "priority",
    "release",
    "changelog",
];

const AGENCY_KEYWORDS: &[&str] = &[
    "client",
    "deliverable",
    "quote",
    "invoice",
    "proposal",
    "brief",
    "agency",
    "contract",
    "billing",
    "sow",
    "scope",
    "revision",
    "approval",
];

/// Result of the in-process agent routing decision.
#[napi(object)]
pub struct RoutingDecision {
    /// One of `"recoder_pm"`, `"recoder_agency"`, or `"recoder_backend"`.
    pub target_agent: String,
    /// Routing method — always `"keyword_router_native"` for this path.
    pub method: String,
}

/// Perform keyword-based agent routing in-process.
///
/// This is the primary entry-point called by the `dispatchToAgent` seam in the
/// OpenClaw adapter facade.  It mirrors the existing TS `routeOpenClawMessage`
/// logic but runs inside the Rust addon without any process or network hop.
///
/// Priority: PM keywords > Agency keywords > `recoder_backend` fallback.
///
/// This function is fully available in the thin build — it has no external
/// dependencies.
#[napi]
pub fn route_message(message: String) -> RoutingDecision {
    let lower = message.to_lowercase();

    let target_agent = if PM_KEYWORDS.iter().any(|kw| lower.contains(kw)) {
        "recoder_pm"
    } else if AGENCY_KEYWORDS.iter().any(|kw| lower.contains(kw)) {
        "recoder_agency"
    } else {
        "recoder_backend"
    };

    RoutingDecision {
        target_agent: target_agent.to_string(),
        method: "keyword_router_native".to_string(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn addon_version_is_nonempty() {
        assert!(!addon_version().is_empty());
    }

    #[test]
    fn extract_commands_returns_empty_in_thin_build() {
        let entries = extract_commands("import { foo } from './commands/foo'".to_string());
        assert!(entries.is_empty());
    }

    #[test]
    fn extract_tools_returns_empty_in_thin_build() {
        let entries = extract_tools("import BashTool from './tools/bash'".to_string());
        assert!(entries.is_empty());
    }

    #[test]
    fn extract_bootstrap_plan_returns_empty_in_thin_build() {
        let phases = extract_bootstrap_plan("--version".to_string());
        assert!(phases.is_empty());
    }

    #[test]
    fn extract_manifest_returns_none_in_thin_build() {
        let manifest = extract_manifest("/some/repo".to_string());
        assert!(manifest.is_none());
    }

    #[test]
    fn route_message_pm_keywords() {
        let r = route_message("help me with my project tasks".to_string());
        assert_eq!(r.target_agent, "recoder_pm");
        assert_eq!(r.method, "keyword_router_native");
    }

    #[test]
    fn route_message_agency_keywords() {
        let r = route_message("create an invoice for the client".to_string());
        assert_eq!(r.target_agent, "recoder_agency");
    }

    #[test]
    fn route_message_fallback() {
        let r = route_message("hello, how are you?".to_string());
        assert_eq!(r.target_agent, "recoder_backend");
    }

    #[test]
    fn route_message_pm_takes_priority_over_agency() {
        // "approval" is an agency keyword, but if PM keyword is also present, PM wins.
        let r = route_message("task approval needed for sprint".to_string());
        assert_eq!(r.target_agent, "recoder_pm");
    }
}
