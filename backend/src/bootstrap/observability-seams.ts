/**
 * Observability composition-root seams — the small, PURE pieces of the bootstrap →
 * observability wiring, extracted so they are unit-testable without a full boot
 * (mirrors {@link ./billing-seams.ts} / {@link ./interop-wire-seams.ts} /
 * {@link ./conductor-seams.ts}):
 *
 *   - {@link createObservabilityDelivery} — the three delivery objects the
 *     observability module consumes: `runEvents` (normalized work-signals ingest
 *     onto the agent-os RunEvent bus, provenance `'engine'`), `board` (needs-you
 *     signals surfaced through the notify webhook), and `notifier` (fired alerts
 *     delivered through the SAME truthful notify seam). Each degrades truthfully —
 *     a gate-refused ingest / an unconfigured notify webhook surfaces as a truthful
 *     rejection, never a masked success.
 *
 * Reads no `process.env` and owns no state; the module decides when they are present.
 */
import type { RunEvent } from '@recoder/agent-os';
import type { NotifyInput, NotifyResult } from '@recoder/agent-notify';
import type { RunEventEmitter, SignalBoard } from '../domains/observability/services/work-signals.service.js';
import type { AlertNotifier } from '../domains/observability/services/alerting.service.js';

/** The narrow agent-os RunEvent bus surface the signals bridge ingests onto. */
export interface ObservabilityRunEventBus {
  ingest(event: RunEvent, source: 'engine'): Promise<unknown>;
}

/** The narrow notify surface the board + alert notifier deliver through. */
export interface ObservabilityNotifyEngine {
  notify(input: NotifyInput): Promise<NotifyResult>;
}

/** Deps for the observability delivery seams. */
export interface ObservabilityDeliveryDeps {
  readonly runEventBus: ObservabilityRunEventBus;
  readonly notifyEngine: ObservabilityNotifyEngine;
}

/**
 * Build the observability delivery objects (`runEvents` / `board` / `notifier`).
 * Signals ingest onto the agent-os RunEvent bus (`source:'engine'`), needs-you
 * signals + fired alerts post through the SAME truthful notify webhook. Each
 * degrades truthfully — never a fabricated ingest/send.
 */
export function createObservabilityDelivery(deps: ObservabilityDeliveryDeps): {
  runEvents: RunEventEmitter;
  board: SignalBoard;
  notifier: AlertNotifier;
} {
  const { runEventBus, notifyEngine } = deps;
  return {
    // Signals → state-of-record bridge: every normalized work signal ingests
    // into the agent-os RunEvent bus (provenance 'engine' — the ops-recorder
    // sidecar is an engine). Idempotent by eventId; a gate-refused ingest is a
    // truthful rejection, never a masked success.
    runEvents: {
      async ingest(event): Promise<void> {
        await runEventBus.ingest(event, 'engine');
      },
    },
    // Needs-you signals surface through the notify webhook (the board seam).
    board: {
      async notify(signal): Promise<void> {
        await notifyEngine.notify({
          title: `needs-you: ${signal.title}`,
          message: `${signal.reason} (${signal.sourceUrl})`,
          level: signal.priority === 'high' ? 'warn' : 'info',
        });
      },
    },
    // Alert delivery: fired alerts post through the same truthful notify seam.
    notifier: {
      async deliver(rule, event): Promise<void> {
        await notifyEngine.notify({
          title: `alert ${rule.severity}: ${rule.name}`,
          message: `status=${event.status} value=${event.value ?? 'n/a'} fired_at=${event.firedAt}`,
          level:
            rule.severity === 'critical' ? 'error' : rule.severity === 'warning' ? 'warn' : 'info',
        });
      },
    },
  };
}
