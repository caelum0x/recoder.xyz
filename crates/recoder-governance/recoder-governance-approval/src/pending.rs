//! Pending-request map with per-agent cap enforcement.
//!
//! Uses a `std::sync::mpsc::SyncSender` as the one-shot gate (capacity 1) so a
//! waiting `request_approval` thread unblocks exactly once when the request is
//! resolved. No tokio: this is pure-std and trivially testable.

use recoder_governance_types::{ApprovalDecision, ApprovalRequest};
use std::collections::HashMap;
use std::sync::mpsc::SyncSender;

/// A single pending request awaiting resolution.
pub struct PendingRequest {
    /// The request itself.
    pub request: ApprovalRequest,
    /// The one-shot gate; sending a decision unblocks the waiter.
    pub sender: SyncSender<ApprovalDecision>,
}

/// The set of in-flight pending requests, keyed by request id.
#[derive(Default)]
pub struct PendingMap {
    inner: HashMap<String, PendingRequest>,
}

impl PendingMap {
    /// Create an empty map.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Count pending requests belonging to a specific agent.
    #[must_use]
    pub fn count_for_agent(&self, agent_id: &str) -> usize {
        self.inner
            .values()
            .filter(|p| p.request.agent_id == agent_id)
            .count()
    }

    /// Insert a pending request.
    pub fn insert(&mut self, id: String, pending: PendingRequest) {
        self.inner.insert(id, pending);
    }

    /// Remove and return a pending request by id.
    pub fn remove(&mut self, id: &str) -> Option<PendingRequest> {
        self.inner.remove(id)
    }

    /// The total number of pending requests.
    #[must_use]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Whether there are no pending requests.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Snapshot all pending requests.
    #[must_use]
    pub fn list(&self) -> Vec<ApprovalRequest> {
        self.inner.values().map(|p| p.request.clone()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use recoder_governance_types::RiskLevel;
    use std::sync::mpsc::sync_channel;

    fn pending(id: &str, agent: &str) -> PendingRequest {
        let (tx, _rx) = sync_channel(1);
        PendingRequest {
            request: ApprovalRequest {
                id: id.to_string(),
                agent_id: agent.to_string(),
                tool_name: "shell_exec".to_string(),
                description: String::new(),
                action_summary: String::new(),
                risk_level: RiskLevel::High,
                requested_at_ms: 0,
                timeout_secs: 60,
            },
            sender: tx,
        }
    }

    #[test]
    fn counts_per_agent() {
        let mut map = PendingMap::new();
        map.insert("1".to_string(), pending("1", "a"));
        map.insert("2".to_string(), pending("2", "a"));
        map.insert("3".to_string(), pending("3", "b"));
        assert_eq!(map.count_for_agent("a"), 2);
        assert_eq!(map.count_for_agent("b"), 1);
        assert_eq!(map.count_for_agent("c"), 0);
        assert_eq!(map.len(), 3);
    }

    #[test]
    fn remove_returns_request() {
        let mut map = PendingMap::new();
        map.insert("1".to_string(), pending("1", "a"));
        let removed = map.remove("1");
        assert!(removed.is_some());
        assert!(map.is_empty());
        assert!(map.remove("1").is_none());
    }
}
