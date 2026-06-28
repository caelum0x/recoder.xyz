/**
 * observe/event-sink.port — the run-tailer's emission seam (design §4.7).
 *
 * Re-exports the canonical RunEventSink port (defined in ports/) so the observe
 * module is self-describing: the run-tailer emits started → log → completed/
 * failed RunEvents through this sink. The backend injects the agent-os
 * repository's `appendEvent`; tests inject a recording fake.
 */
export type { RunEventSink } from '../ports/run-event-sink.port.js';
