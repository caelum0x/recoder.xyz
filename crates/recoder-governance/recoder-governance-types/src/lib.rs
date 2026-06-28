//! `recoder-governance-types` — shared domain types for the Recoder governance
//! kernel.
//!
//! This is the deep (Rust) tier under the already-shipped TypeScript governance
//! facade (`packages/governance`). The TS side mirrors these types; the wire
//! authority is Rust. The types here are deliberately small, pure, and
//! `serde`-serializable so they can cross the typed IPC boundary unchanged.
//!
//! Modules:
//! - [`approval`] — the [`approval::RiskLevel`], [`approval::ApprovalRequest`],
//!   [`approval::ApprovalResponse`], [`approval::ApprovalPolicy`], and
//!   [`approval::ApprovalDecision`] shapes that gate dangerous operations.
//! - [`risk`] — the totally-ordered [`risk::RiskTier`] classification.
//! - [`audit_action`] — the [`audit_action::AuditAction`] enum, mirroring the
//!   string-valued TS union so the audit hash pre-image is byte-identical.
//! - [`audit_entry`] — the [`audit_entry::AuditEntry`] / [`audit_entry::AuditInput`]
//!   records that form the links of the SHA-256 Merkle audit chain.
//! - [`error`] — [`error::GovernanceTypeError`], the typed error surface.

pub mod approval;
pub mod audit_action;
pub mod audit_entry;
pub mod error;
pub mod risk;

pub use approval::{
    ApprovalDecision, ApprovalPolicy, ApprovalRequest, ApprovalResponse, RiskLevel,
};
pub use audit_action::AuditAction;
pub use audit_entry::{AuditEntry, AuditInput, AuditOutcome};
pub use error::GovernanceTypeError;
pub use risk::RiskTier;
