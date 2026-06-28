//! Typed error surface for the governance types crate.

use thiserror::Error;

/// Errors produced when parsing or validating governance domain types.
#[derive(Debug, Error, PartialEq, Eq, Clone)]
pub enum GovernanceTypeError {
    /// An input string did not match any known [`crate::risk::RiskTier`] variant.
    #[error("unknown risk tier: {0:?}")]
    UnknownRiskTier(String),

    /// An input string did not match any known [`crate::audit_action::AuditAction`]
    /// wire value.
    #[error("unknown audit action: {0:?}")]
    UnknownAuditAction(String),

    /// An input string did not match any known [`crate::audit_entry::AuditOutcome`]
    /// wire value.
    #[error("unknown audit outcome: {0:?}")]
    UnknownAuditOutcome(String),
}
