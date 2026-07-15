/**
 * RunEventSinkPort — where the run-tailer writes `RunEvent`s.
 *
 * Two consumers of the same emission: (a) DURABLE — the agent-os repository's
 * `appendEvent` (the audit trail / live-terminal source), and (b) LIVE — the
 * `/sync` fan-out that streams state changes + log deltas to attached clients.
 * The tailer holds ONE `RunEventSinkPort`; the composer fans out.
 *
 * REUSE: the substrate package already defines the narrow `RunEventSink`
 * (`append(event)`), which the engine/observe tailer codes to. We re-export it as
 * the canonical sink shape.
 *
 * COUPLING (reported): the domain doc has the conductor CONSUME the agent-os
 * `RunEvent` emitter port from `src/domains/agent-os/ports/run-event.port.ts`. At
 * the time this port was written that file did NOT exist yet (the agent-os
 * domain — task #16 — has no `ports/` dir). To stay unblocked we define the
 * minimal `RunEventEmitterPort` LOCALLY here over the canonical
 * `@recoder/agent-os` `RunEvent` type. When agent-os publishes its port, swap the
 * local definition for a re-export of `../../agent-os/ports/run-event.port.js`
 * (structurally identical) — see the RECON report's "wiring needed" section.
 */
import type { RunEvent } from '@recoder/agent-os';

// Canonical narrow sink the substrate observe/run-tailer emits through.
export type { RunEventSink } from '@recoder/substrate';

/**
 * Minimal local RunEvent emitter (temporary — see COUPLING note above). The
 * conductor tailer emits through this; the composer provides an impl that fans
 * out to the durable repository sink AND the live `/sync` publisher.
 */
export interface RunEventEmitterPort {
  /** Emit a single RunEvent to every registered consumer (durable + live). */
  emit(event: RunEvent): Promise<void>;
}

/**
 * The conductor-facing sink: the durable+live emitter the composer wires. Named
 * distinctly from the substrate `RunEventSink` (which is `append`) so the two
 * seams don't collide when both are imported.
 */
export interface RunEventSinkPort {
  /** Append + fan out one RunEvent (durable audit trail + live `/sync` stream). */
  append(event: RunEvent): Promise<void>;
}
