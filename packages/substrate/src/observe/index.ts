/**
 * observe/ barrel — run tailing + lifecycle telemetry (design §4.7).
 *
 * Substrate-pure: the run-tailer polls the injected substrate's capture/alive/
 * exitCode and emits started → log(delta) → completed/failed RunEvents through
 * the RunEventSink port. No tmux/Daytona import; the backend injects the
 * concrete substrate, sink, and ports.
 */
export {
  startRunTail,
  stopRunTail,
  activeTailCount,
  DEFAULT_INTERVAL_MS,
  DEFAULT_MAX_MS,
  CAPTURE_LINES,
} from './run-tailer.js';
export type { RunTailInput, RunTailerDeps, TailSubstrate } from './run-tailer.js';
export { TailRegistry } from './tail-registry.js';
export type { TailHandle } from './tail-registry.js';
export { computeDelta, MAX_DELTA_CHARS } from './delta.js';
export { detectInputWait } from './input-wait.js';
export type { CaptureDeltaResult } from './delta.js';
export type { RunEventSink } from './event-sink.port.js';
