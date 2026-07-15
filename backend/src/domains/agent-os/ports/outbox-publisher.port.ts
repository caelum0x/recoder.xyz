/**
 * `OutboxPublisherPort` — the CloudEvents publish seam for the at-least-once
 * delivery spine (domain doc §1.3, §8). The outbox drain claims `pending`
 * `OutboxRecord`s from the repository and hands each `RecoderCloudEvent` to a
 * publisher; the NATS adapter publishes to a subject, and degrades to a
 * log-only sink when NATS is absent (records stay `pending`, never lost).
 *
 * FROZEN CONTRACT — Phase 5a seam. The drain (interop/edge can trigger it)
 * compiles against this; the NATS adapter (MOVED from the legacy
 * `nats-outbox-publisher.ts`) implements it. Keep the surface minimal — publish +
 * truthful health.
 *
 * Semantics:
 *  - `publish` resolves on a durable hand-off (NATS ack) and REJECTS on a
 *    delivery fault so the drain leaves the record `pending` for retry — never a
 *    silent drop. The log-only degrade sink resolves (records stay pending via
 *    the drain's own accounting, not a faked delivery).
 */
import type { RecoderCloudEvent } from '@recoder/agent-events';
import type { HealthStatus } from '../../../shared/health-types.js';

export interface OutboxPublisherPort {
  /**
   * Publish one CloudEvent to the transport. Resolves on durable hand-off;
   * rejects on a delivery fault (the drain then leaves the record `pending`).
   */
  publish(event: RecoderCloudEvent): Promise<void>;

  /**
   * Truthful transport health: `up` when the transport (NATS) is connected,
   * `down` when the publisher is the log-only degrade sink.
   */
  health(): HealthStatus | Promise<HealthStatus>;
}
