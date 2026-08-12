#[derive(Clone, Default)]
pub struct EventHub {
    inner: std::sync::Arc<std::sync::Mutex<EventHubState>>,
}

#[derive(Default)]
struct EventHubState {
    next_sequence: u64,
    events: Vec<(u64, crate::api::schema::EventEnvelope)>,
}

impl EventHub {
    const MAX_EVENTS: usize = 512;

    pub fn push(&self, event: crate::api::schema::EventEnvelope) {
        let Ok(mut state) = self.inner.lock() else {
            return;
        };
        state.next_sequence += 1;
        let sequence = state.next_sequence;
        state.events.push((sequence, event));
        let overflow = state.events.len().saturating_sub(Self::MAX_EVENTS);
        if overflow > 0 {
            state.events.drain(0..overflow);
        }
    }

    pub fn events_after(&self, sequence: u64) -> Vec<(u64, crate::api::schema::EventEnvelope)> {
        let Ok(state) = self.inner.lock() else {
            return Vec::new();
        };
        state
            .events
            .iter()
            .filter(|(event_sequence, _)| *event_sequence > sequence)
            .cloned()
            .collect()
    }

    pub fn current_sequence(&self) -> u64 {
        let Ok(state) = self.inner.lock() else {
            return 0;
        };
        state.next_sequence
    }

    /// Smallest sequence still held in the bounded ring, or `None` when no event
    /// has been retained yet. Anything at or below this minus one has been
    /// evicted and can no longer be replayed.
    pub fn earliest_sequence(&self) -> Option<u64> {
        let Ok(state) = self.inner.lock() else {
            return None;
        };
        state.events.first().map(|(sequence, _)| *sequence)
    }

    /// Whether a client holding cursor `since` can be resumed from the retained
    /// ring without a gap. The bounded ring evicts the oldest events on
    /// overflow, so a cursor older than what is retained would silently skip the
    /// evicted events; that case returns `false` so the caller can force a full
    /// re-subscribe instead of delivering a partial stream. A cursor that is
    /// already at or beyond the newest sequence (nothing to replay) is always
    /// resumable.
    pub fn can_resume_from(&self, since: u64) -> bool {
        let Ok(state) = self.inner.lock() else {
            return false;
        };
        match state.events.first() {
            None => since >= state.next_sequence,
            Some((earliest, _)) => {
                since.saturating_add(1) >= *earliest || since >= state.next_sequence
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::schema::{EventData, EventEnvelope, EventKind};

    fn focus_event(id: &str) -> EventEnvelope {
        EventEnvelope {
            event: EventKind::WorkspaceFocused,
            data: EventData::WorkspaceFocused {
                workspace_id: id.to_string(),
            },
        }
    }

    #[test]
    fn push_assigns_stable_monotonic_sequences() {
        let hub = EventHub::default();
        hub.push(focus_event("a"));
        hub.push(focus_event("b"));
        hub.push(focus_event("c"));

        let sequences: Vec<u64> = hub
            .events_after(0)
            .into_iter()
            .map(|(seq, _)| seq)
            .collect();
        assert_eq!(sequences, vec![1, 2, 3]);
        assert_eq!(hub.current_sequence(), 3);
        // A second read yields the identical sequence assignment (stable).
        let again: Vec<u64> = hub
            .events_after(0)
            .into_iter()
            .map(|(seq, _)| seq)
            .collect();
        assert_eq!(again, vec![1, 2, 3]);
    }

    #[test]
    fn events_after_returns_only_newer_events_in_order() {
        let hub = EventHub::default();
        for id in ["a", "b", "c", "d"] {
            hub.push(focus_event(id));
        }
        let after_two: Vec<u64> = hub
            .events_after(2)
            .into_iter()
            .map(|(seq, _)| seq)
            .collect();
        assert_eq!(after_two, vec![3, 4]);
    }

    #[test]
    fn earliest_sequence_tracks_ring_eviction() {
        let hub = EventHub::default();
        assert_eq!(hub.earliest_sequence(), None);
        for _ in 0..(EventHub::MAX_EVENTS + 10) {
            hub.push(focus_event("x"));
        }
        // The oldest 10 events were evicted; the ring now starts at seq 11.
        assert_eq!(hub.earliest_sequence(), Some(11));
        assert_eq!(hub.current_sequence(), (EventHub::MAX_EVENTS + 10) as u64);
    }

    #[test]
    fn can_resume_from_rejects_cursor_that_predates_retained_window() {
        let hub = EventHub::default();
        for _ in 0..(EventHub::MAX_EVENTS + 10) {
            hub.push(focus_event("x"));
        }
        // earliest retained is 11: a cursor of 10 needs event 11 (still present) -> ok.
        assert!(hub.can_resume_from(10));
        // A cursor of 9 needs event 10, which was evicted -> gap.
        assert!(!hub.can_resume_from(9));
        assert!(!hub.can_resume_from(1));
    }

    #[test]
    fn can_resume_from_allows_caught_up_and_empty_ring() {
        let hub = EventHub::default();
        // Empty ring: only the zero cursor (nothing seen) is resumable.
        assert!(hub.can_resume_from(0));

        hub.push(focus_event("a"));
        hub.push(focus_event("b"));
        // Caught up to the newest sequence -> resumable even with a small ring.
        assert!(hub.can_resume_from(2));
        // A cursor ahead of the newest sequence is still treated as caught up.
        assert!(hub.can_resume_from(5));
        // A cursor inside the retained window replays without a gap.
        assert!(hub.can_resume_from(1));
    }
}
