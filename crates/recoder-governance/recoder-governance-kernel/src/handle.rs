//! [`GovernanceHandle`] — the object-safe decision trait.
//!
//! The trait exists to break the runtime <-> kernel circular-dependency problem
//! (the same `KernelHandle` pattern openfang uses): a runtime adapter can depend
//! on this trait without depending on the concrete [`GovernanceKernel`], and the
//! kernel implements it. All methods are **synchronous** — the blocking approval
//! gate is intentionally *not* on this trait (it lives on the concrete kernel),
//! so `GovernanceHandle` stays object-safe and async-free.

use crate::error::GovernanceKernelError;
use crate::request::GovernanceRequest;
use crate::verdict::GovernanceVerdict;
use recoder_governance_permission::EnforcementResult;
use recoder_governance_routing::RouteDecision;
use recoder_governance_types::AuditInput;

/// The synchronous governance decision surface.
pub trait GovernanceHandle: Send + Sync {
    /// Run the full fused decision pipeline for a request.
    fn decide(&self, req: &GovernanceRequest) -> GovernanceVerdict;

    /// Enforce a single tool invocation (permission check only — no routing or
    /// approval). Returns the enforcer outcome.
    fn enforce_tool(&self, tool: &str, input: &str) -> EnforcementResult;

    /// Resolve only the route for a request (no enforcement side effects).
    fn route(&self, req: &GovernanceRequest) -> RouteDecision;

    /// Append an audit record and return the new chain tip hash.
    fn record_audit(&self, entry: AuditInput) -> String;

    /// Verify the audit chain's integrity. `Ok(())` if intact, otherwise an
    /// error naming the first broken sequence number.
    fn verify_audit(&self) -> Result<(), GovernanceKernelError>;
}
