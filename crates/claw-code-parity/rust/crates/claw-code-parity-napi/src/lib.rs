//! # claw-code-parity-napi
//!
//! NAPI-RS native addon that exposes the `compat-harness` parity-harness
//! core directly inside the Node.js process — no subprocess, no loopback HTTP.
//!
//! ## Exposed surface
//!
//! | JS function              | Rust implementation                        |
//! |-------------------------|--------------------------------------------|
//! | `extractCommands(src)`  | `compat_harness::extract_commands`         |
//! | `extractTools(src)`     | `compat_harness::extract_tools`            |
//! | `extractBootstrapPlan(src)` | `compat_harness::extract_bootstrap_plan` |
//! | `extractManifest(repoRoot)` | `compat_harness::extract_manifest` (sync FS) |
//! | `addonVersion()`        | package version constant                   |
//!
//! All functions are synchronous (no async) so that they can be called
//! from any context without `await`.  The manifest extraction reads the
//! upstream repo source files from disk — this is fast (< 5 ms on SSD)
//! and appropriate for a sync call.
//!
//! ## Degrade-safety
//!
//! This crate is loaded by the TypeScript facade via a conditional
//! `require()`.  If the `.node` file is absent (e.g., build deferred due to
//! disk pressure) the facade falls back to the existing subprocess/loopback
//! path automatically.  This addon never needs to be present for the backend
//! to operate correctly.

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
// Command extraction
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
/// manifest entries.  The input is the raw TypeScript source as a string.
///
/// Returns an empty array on parse failure (never throws).
#[napi]
pub fn extract_commands(source: String) -> Vec<CommandEntry> {
    let registry = compat_harness::extract_commands(&source);
    registry
        .entries()
        .iter()
        .map(|e| CommandEntry {
            name: e.name.clone(),
            source: format!("{:?}", e.source).to_lowercase(),
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Tool extraction
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
/// Returns an empty array on parse failure (never throws).
#[napi]
pub fn extract_tools(source: String) -> Vec<ToolEntry> {
    let registry = compat_harness::extract_tools(&source);
    registry
        .entries()
        .iter()
        .map(|e| ToolEntry {
            name: e.name.clone(),
            source: format!("{:?}", e.source).to_lowercase(),
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Bootstrap plan extraction
// ---------------------------------------------------------------------------

/// Parse the text of `cli.tsx` and return the ordered list of bootstrap
/// phase names that the CLI entry point activates.
///
/// Phase names are stable lowercase strings such as `"cli_entry"`,
/// `"fast_path_version"`, `"main_runtime"`, etc.
#[napi]
pub fn extract_bootstrap_plan(source: String) -> Vec<String> {
    let plan = compat_harness::extract_bootstrap_plan(&source);
    plan.phases()
        .iter()
        .map(|p| format!("{p:?}").to_lowercase())
        .collect()
}

// ---------------------------------------------------------------------------
// Full manifest extraction (disk-bound sync call)
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
/// This function reads three files synchronously:
/// - `<repo_root>/src/commands.ts`
/// - `<repo_root>/src/tools.ts`
/// - `<repo_root>/src/entrypoints/cli.tsx`
///
/// Returns `null` when the files cannot be read (e.g., repo not present).
/// Never throws.
#[napi]
pub fn extract_manifest(repo_root: String) -> Option<ExtractedManifest> {
    let paths = compat_harness::UpstreamPaths::from_repo_root(&repo_root);
    let manifest = compat_harness::extract_manifest(&paths).ok()?;

    Some(ExtractedManifest {
        commands: manifest
            .commands
            .entries()
            .iter()
            .map(|e| CommandEntry {
                name: e.name.clone(),
                source: format!("{:?}", e.source).to_lowercase(),
            })
            .collect(),
        tools: manifest
            .tools
            .entries()
            .iter()
            .map(|e| ToolEntry {
                name: e.name.clone(),
                source: format!("{:?}", e.source).to_lowercase(),
            })
            .collect(),
        bootstrap_phases: manifest
            .bootstrap
            .phases()
            .iter()
            .map(|p| format!("{p:?}").to_lowercase())
            .collect(),
    })
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
