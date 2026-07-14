//! `recoder-governance-approval` — the synchronous approval gate of the Recoder
//! governance kernel.
//!
//! Merged from openfang-kernel `approval.rs`, re-implemented with **std-only**
//! primitives (no tokio): a `sync_channel(1)` one-shot gate, `std::sync::Mutex`/
//! `RwLock`, and a bounded ring buffer. This keeps the crate pure, sync, and
//! trivially testable while preserving the upstream behavior:
//!
//! - [`manager::ApprovalManager`]: per-agent pending cap
//!   ([`manager::MAX_PENDING_PER_AGENT`]), recent ring buffer
//!   ([`manager::MAX_RECENT_APPROVALS`]), `classify_risk`, hot-reloadable policy.
//! - [`classifier`]: tool -> [`recoder_governance_types::RiskLevel`] /
//!   [`recoder_governance_types::RiskTier`].
//! - [`auto_approve`]: autonomous auto-approval capped at a configurable tier
//!   ceiling (never auto-approves above the ceiling).
//!
//! Canonical approval *state* still lives in agent-os; this manager is the
//! runtime blocking mechanism and emits decisions back.

pub mod auto_approve;
pub mod classifier;
pub mod manager;
pub mod pending;
pub mod recent;

pub use auto_approve::can_auto_approve;
pub use classifier::{classify_risk, classify_tier};
pub use manager::{ApprovalManager, SubmitOutcome, MAX_PENDING_PER_AGENT, MAX_RECENT_APPROVALS};
pub use pending::{PendingMap, PendingRequest};
pub use recent::{ApprovalRecord, RecentApprovals};
