/**
 * HandoffEnvelope — the signed/dedup-keyed transport envelope a handoff travels
 * in. The `dedupKey` makes delivery effectively-once (MERGED from the
 * `_localEventIds` dedup in `docker-backend/src/a2a/a2a-event-bus.ts`); the
 * optional `signature` is the sign/verify seam for cross-agent A2A interop.
 */

import type { Handoff } from './handoff';

export type HandoffEnvelope = {
  /** Stable id for this delivery attempt. */
  envelopeId: string;
  /** Idempotency key — duplicate deliveries with the same key are dropped. */
  dedupKey: string;
  handoff: Handoff;
  /** ISO time the envelope was emitted. */
  emittedAt: string;
  /** Optional detached signature over the canonical handoff bytes. */
  signature?: string;
  /** Trace-context for end-to-end tracing across the bus. */
  traceId?: string;
};
