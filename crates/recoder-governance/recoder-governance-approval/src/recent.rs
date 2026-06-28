//! Recent-approvals ring buffer (merged from openfang-kernel `approval.rs`).

use recoder_governance_types::{ApprovalDecision, ApprovalRequest};
use std::collections::VecDeque;

/// A resolved approval retained for history/UI visibility.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovalRecord {
    /// The original request.
    pub request: ApprovalRequest,
    /// The decision reached.
    pub decision: ApprovalDecision,
    /// When the decision was made (unix millis).
    pub decided_at_ms: i64,
    /// Who decided, if known.
    pub decided_by: Option<String>,
}

/// A bounded newest-first ring buffer of [`ApprovalRecord`]s.
#[derive(Debug, Default)]
pub struct RecentApprovals {
    buffer: VecDeque<ApprovalRecord>,
    capacity: usize,
}

impl RecentApprovals {
    /// Create a ring buffer holding at most `capacity` records.
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: VecDeque::new(),
            capacity: capacity.max(1),
        }
    }

    /// Push a record to the front, evicting the oldest beyond capacity.
    pub fn push(&mut self, record: ApprovalRecord) {
        self.buffer.push_front(record);
        while self.buffer.len() > self.capacity {
            self.buffer.pop_back();
        }
    }

    /// The most recent `limit` records, newest first.
    #[must_use]
    pub fn recent(&self, limit: usize) -> Vec<ApprovalRecord> {
        self.buffer.iter().take(limit).cloned().collect()
    }

    /// The number of retained records.
    #[must_use]
    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    /// Whether the buffer is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use recoder_governance_types::RiskLevel;

    fn record(id: &str) -> ApprovalRecord {
        ApprovalRecord {
            request: ApprovalRequest {
                id: id.to_string(),
                agent_id: "a".to_string(),
                tool_name: "shell_exec".to_string(),
                description: String::new(),
                action_summary: String::new(),
                risk_level: RiskLevel::High,
                requested_at_ms: 0,
                timeout_secs: 60,
            },
            decision: ApprovalDecision::Approved,
            decided_at_ms: 0,
            decided_by: None,
        }
    }

    #[test]
    fn evicts_oldest_beyond_capacity() {
        let mut ring = RecentApprovals::new(2);
        ring.push(record("1"));
        ring.push(record("2"));
        ring.push(record("3"));
        assert_eq!(ring.len(), 2);
        let recent = ring.recent(10);
        // Newest first: 3, 2.
        assert_eq!(recent[0].request.id, "3");
        assert_eq!(recent[1].request.id, "2");
    }

    #[test]
    fn recent_respects_limit() {
        let mut ring = RecentApprovals::new(10);
        for i in 0..5 {
            ring.push(record(&i.to_string()));
        }
        assert_eq!(ring.recent(3).len(), 3);
        assert!(!ring.is_empty());
    }

    #[test]
    fn zero_capacity_is_clamped_to_one() {
        let mut ring = RecentApprovals::new(0);
        ring.push(record("1"));
        ring.push(record("2"));
        assert_eq!(ring.len(), 1);
    }
}
