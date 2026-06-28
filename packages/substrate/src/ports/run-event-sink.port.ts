/**
 * RunEventSink — the run-tailer's emission seam (design §4.7 / §7).
 *
 * The observe/run-tailer polls the substrate's capture()/alive() and emits
 * lifecycle RunEvents through this sink. The backend injects the agent-os
 * repository's `appendEvent` as the sink; tests inject a recording fake to
 * assert the started → log → completed/failed sequence. Interface only.
 */
import type { RunEvent } from '@recoder/agent-os';

export interface RunEventSink {
  /** Emit a single RunEvent (started/log/completed/failed/…). */
  append(event: RunEvent): Promise<void>;
}
