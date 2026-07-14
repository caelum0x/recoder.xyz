//! `recoder-governance-kernel` — the engine that composes the four governance
//! crates (permission, approval, routing, audit) behind one fail-closed
//! `decide(request) -> verdict` entry point.
//!
//! This is the deep (Rust) tier under the shipped TypeScript governance facade
//! (`packages/governance`). It is **synchronous** by design — the typed IPC
//! daemon (`recoder-governance-ipc` / `recoder-governance-daemon`) is a later
//! step and owns the async/UDS/CBOR surface. The kernel itself never pulls in an
//! async runtime.
//!
//! ## Modules
//!
//! - [`request`] — the canonical [`request::GovernanceRequest`] (actor, task,
//!   action, target, context) and [`request::GovernanceAction`].
//! - [`verdict`] — the canonical [`verdict::GovernanceVerdict`] (effect, tier,
//!   route, reason, audit hash).
//! - [`pipeline`] — the ordered decision stages: secret-access -> forbidden-path
//!   -> work-lock -> approval-required -> command/mcp risk -> tool-policy ->
//!   permission -> routing -> audit. Fail-closed: any fault yields a `Deny`.
//! - [`kernel`] — [`kernel::GovernanceKernel`], the `RwLock`-hot-reloadable
//!   wiring of permission + approval + routing + audit.
//! - [`config`] — [`config::GovernanceKernelConfig`] (`#[serde(default)]`,
//!   validated load + hot-reload).
//! - [`lane_policy`] — the merged claw `policy_engine.rs`
//!   ([`lane_policy::PolicyEngine`]) for orchestration lane verdicts.
//! - [`handle`] — the [`handle::GovernanceHandle`] trait that avoids the
//!   runtime <-> kernel circular-dependency problem.
//! - [`error`] — [`error::GovernanceKernelError`], the typed (thiserror) surface.

pub mod config;
pub mod error;
pub mod handle;
pub mod kernel;
pub mod lane_policy;
pub mod pipeline;
pub mod request;
pub mod verdict;

pub use config::GovernanceKernelConfig;
pub use error::{GovernanceKernelError, KernelResult};
pub use handle::GovernanceHandle;
pub use kernel::GovernanceKernel;
pub use lane_policy::{
    evaluate as evaluate_lane_policy, DiffScope, LaneBlocker, LaneContext, PolicyAction,
    PolicyCondition, PolicyEngine, PolicyRule, ReviewStatus, STALE_BRANCH_THRESHOLD,
};
pub use pipeline::{decide, PipelineInputs};
pub use request::{GovernanceAction, GovernanceContext, GovernanceRequest};
pub use verdict::{Effect, GovernanceVerdict, VerdictRoute};
