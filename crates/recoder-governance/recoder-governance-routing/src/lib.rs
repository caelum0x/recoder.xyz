//! `recoder-governance-routing` — complexity + risk routing for the Recoder
//! governance kernel.
//!
//! Merged from openfang `routing.rs` and extended per governance.md §3.4:
//!
//! - [`complexity`] / [`model_router`] (merged): [`model_router::ModelRouter::score`]
//!   over a self-contained [`complexity::ScoringInput`] (token proxy + tool
//!   count + code markers + conversation depth + system-prompt length) and
//!   [`model_router::ModelRouter::select_model`].
//! - [`risk_tier_router`] (NEW): [`risk_tier_router::route`] **fuses** the scored
//!   [`complexity::TaskComplexity`] with the policy
//!   [`recoder_governance_types::RiskTier`] — a high-risk action on a simple
//!   prompt still routes high, and a denied action never routes.
//! - [`runtime_router`] (NEW): maps the resolved tier to a preferred runtime
//!   adapter for `packages/agent-runtimes`.

pub mod complexity;
pub mod model_router;
pub mod risk_tier_router;
pub mod runtime_router;

pub use complexity::{score_raw, ScoringInput, TaskComplexity};
pub use model_router::{ModelRouter, ModelRoutingConfig};
pub use risk_tier_router::{complexity_to_tier, route, RouteDecision};
pub use runtime_router::{runtime_for_tier, RuntimeAdapter};
