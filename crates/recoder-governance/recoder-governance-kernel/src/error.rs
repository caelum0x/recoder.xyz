//! [`GovernanceKernelError`] — the typed error surface of the kernel.
//!
//! The decision pipeline is **fail-closed**: an internal error never propagates
//! to the caller as an `allow`. Instead the pipeline converts any error into a
//! [`Effect::Deny`](crate::verdict::Effect::Deny) verdict carrying a *sanitized*
//! reason, while the full error context is available here for server-side logs.

use thiserror::Error;

/// A kernel-level error. Construction never leaks secrets; the `Display` text is
/// safe to surface in a denied verdict reason.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum GovernanceKernelError {
    /// The inbound [`GovernanceRequest`](crate::request::GovernanceRequest)
    /// failed validation at the trust boundary.
    #[error("invalid governance request: {0}")]
    InvalidRequest(String),

    /// A configuration value was incoherent (e.g. routing thresholds inverted).
    #[error("invalid governance config: {0}")]
    InvalidConfig(String),

    /// A pipeline stage encountered an internal fault. The pipeline converts
    /// this into a deny; this variant exists so the detail can be logged.
    #[error("governance pipeline fault in stage '{stage}': {detail}")]
    PipelineFault {
        /// The stage name where the fault occurred.
        stage: String,
        /// Sanitized fault detail.
        detail: String,
    },
}

/// Convenience result alias for kernel operations.
pub type KernelResult<T> = Result<T, GovernanceKernelError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_is_sanitized_and_stable() {
        let err = GovernanceKernelError::InvalidRequest("actor must not be empty".to_string());
        assert_eq!(
            err.to_string(),
            "invalid governance request: actor must not be empty"
        );
    }

    #[test]
    fn pipeline_fault_names_the_stage() {
        let err = GovernanceKernelError::PipelineFault {
            stage: "routing".to_string(),
            detail: "threshold inverted".to_string(),
        };
        assert!(err.to_string().contains("stage 'routing'"));
    }
}
