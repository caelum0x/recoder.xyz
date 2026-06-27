/**
 * transport barrel — event-bus adapters (the wire). The in-proc bus is the
 * default; the NATS bus + scoped router + retention/redaction helpers are
 * deferred to wave-2 (see TODOs in design §3 file tree).
 */

export { InProcEventBus, type InProcEventBusOptions } from './inproc-event-bus';

// TODO(wave-2): NatsEventBus (transport/nats-event-bus.ts) — JetStream mirror +
// fan-in. Lazy `import("nats")` so the pure core keeps zero hard deps.
// TODO(wave-2): event-bus-router, event-codec, retention, redaction.
