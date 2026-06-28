//! [`IpcMethod`] — the closed set of governance IPC methods.
//!
//! The method is a *closed* enum with `#[serde(rename_all = "snake_case")]`. An
//! unknown method name on the wire fails deserialization and is turned into an
//! error response by [`crate::dispatch`] — the server never dispatches a method
//! it does not recognize (hostile-by-default).

use serde::{Deserialize, Serialize};

/// A governance IPC method. The wire string is the snake_case form of each
/// variant (e.g. `"decide"`, `"enforce_tool"`, `"request_approval"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IpcMethod {
    /// Run the full fused decision pipeline for a request.
    Decide,
    /// Enforce a single tool invocation (permission check only).
    EnforceTool,
    /// Resolve only the route for a request.
    Route,
    /// Submit an approval request to the blocking gate.
    RequestApproval,
    /// Resolve a pending approval request.
    ResolveApproval,
    /// Append an audit record and return the new chain tip hash.
    RecordAudit,
    /// Verify the audit chain's integrity.
    VerifyAudit,
    /// Hot-reload the kernel's policy bundle.
    ReloadConfig,
    /// Liveness/readiness probe.
    Health,
}

impl IpcMethod {
    /// The canonical wire string for this method.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            IpcMethod::Decide => "decide",
            IpcMethod::EnforceTool => "enforce_tool",
            IpcMethod::Route => "route",
            IpcMethod::RequestApproval => "request_approval",
            IpcMethod::ResolveApproval => "resolve_approval",
            IpcMethod::RecordAudit => "record_audit",
            IpcMethod::VerifyAudit => "verify_audit",
            IpcMethod::ReloadConfig => "reload_config",
            IpcMethod::Health => "health",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_to_snake_case() {
        assert_eq!(
            serde_json::to_string(&IpcMethod::EnforceTool).unwrap(),
            "\"enforce_tool\""
        );
        assert_eq!(
            serde_json::to_string(&IpcMethod::RequestApproval).unwrap(),
            "\"request_approval\""
        );
    }

    #[test]
    fn deserializes_known_method() {
        let m: IpcMethod = serde_json::from_str("\"decide\"").unwrap();
        assert_eq!(m, IpcMethod::Decide);
    }

    #[test]
    fn rejects_unknown_method() {
        // The hostile case: an unknown method must NOT deserialize.
        let result: Result<IpcMethod, _> = serde_json::from_str("\"drop_table\"");
        assert!(result.is_err());
    }

    #[test]
    fn as_str_round_trips() {
        for m in [
            IpcMethod::Decide,
            IpcMethod::EnforceTool,
            IpcMethod::Route,
            IpcMethod::RequestApproval,
            IpcMethod::ResolveApproval,
            IpcMethod::RecordAudit,
            IpcMethod::VerifyAudit,
            IpcMethod::ReloadConfig,
            IpcMethod::Health,
        ] {
            let json = format!("\"{}\"", m.as_str());
            let back: IpcMethod = serde_json::from_str(&json).unwrap();
            assert_eq!(back, m);
        }
    }
}
