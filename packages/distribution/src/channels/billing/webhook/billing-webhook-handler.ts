import type { EventBusPort } from '../../../ports/event-bus-port';
import type { SecretPort } from '../../../ports/secret-port';
import type { Result } from '../../../result';
import { ok, err } from '../../../result';
import { DistributionError } from '../../../errors/index';
import { ENV_KEYS } from '../../../config/index';
import {
  verifyWebhookSignature,
  type WebhookHeaders,
} from './webhook-signature';
import {
  PolarWebhookEnvelopeSchema,
  type PolarWebhookEnvelope,
} from './webhook-event';
import {
  webhookToEntitlementChange,
  entitlementChangeToRunEvent,
  type EntitlementChange,
} from './webhook-to-entitlement';

export interface WebhookProcessResult {
  readonly verified: true;
  readonly change: EntitlementChange;
  /** True when the RunEvent was emitted (a non-ignored, subject-resolved change). */
  readonly emitted: boolean;
  /** True when this webhook id was already processed (deduped, no re-emit). */
  readonly deduped: boolean;
}

/** Records processed webhook ids so a redelivery is not re-applied. */
export interface WebhookDedupeStore {
  seen(webhookId: string): boolean;
  record(webhookId: string): void;
}

export function createInMemoryWebhookDedupeStore(): WebhookDedupeStore {
  const ids = new Set<string>();
  return { seen: (id) => ids.has(id), record: (id) => void ids.add(id) };
}

/**
 * The Polar billing webhook handler.
 *
 * Pipeline (every failure denies, NEVER trusts the wire):
 *  1. read the webhook secret from env/vault — absent → deny (`webhook_untrusted`);
 *  2. cryptographically verify the Standard-Webhooks signature + timestamp;
 *  3. parse the envelope (Zod) — a malformed body denies;
 *  4. dedupe by `webhook-id` (a redelivery is acknowledged but not re-applied);
 *  5. map the event → an `EntitlementChange` and emit a `RunEvent` to the outbox.
 *
 * The handler returns a `Result`: a deny `err` (with a `DistributionError`) or
 * an `ok` describing the verified change. It never throws on bad input.
 */
export interface BillingWebhookHandler {
  process(input: {
    rawBody: string;
    headers: WebhookHeaders;
    now?: () => Date;
  }): Promise<Result<WebhookProcessResult, DistributionError>>;
}

export interface BillingWebhookHandlerDeps {
  readonly secrets: SecretPort;
  readonly events: EventBusPort;
  readonly dedupe?: WebhookDedupeStore;
  /** The task id the audit RunEvents are attributed to. */
  readonly taskId: string;
  readonly eventId?: () => string;
  readonly toleranceSeconds?: number;
}

export function createBillingWebhookHandler(
  deps: BillingWebhookHandlerDeps,
): BillingWebhookHandler {
  const dedupe = deps.dedupe ?? createInMemoryWebhookDedupeStore();
  const newEventId = deps.eventId ?? (() => `evt_${Math.random().toString(36).slice(2)}`);

  return {
    async process(input) {
      // 1. Secret — absent → deny (fail safe; never a faked trust).
      const secret = deps.secrets.get(ENV_KEYS.POLAR_WEBHOOK_SECRET);
      if (!secret) {
        return err(
          new DistributionError(
            'webhook_untrusted',
            `${ENV_KEYS.POLAR_WEBHOOK_SECRET} is not set — webhook denied`,
          ),
        );
      }

      // 2. Signature + timestamp.
      const sig = verifyWebhookSignature({
        rawBody: input.rawBody,
        headers: input.headers,
        secret,
        ...(deps.toleranceSeconds !== undefined ? { toleranceSeconds: deps.toleranceSeconds } : {}),
        ...(input.now ? { now: input.now } : {}),
      });
      if (!sig.ok) return err(sig.error);

      // 3. Parse the (now-trusted) envelope.
      let envelope: PolarWebhookEnvelope;
      try {
        envelope = PolarWebhookEnvelopeSchema.parse(JSON.parse(input.rawBody));
      } catch {
        return err(new DistributionError('invalid_input', 'malformed webhook body'));
      }

      // 4. Dedupe by webhook id (redelivery is acknowledged, not re-applied).
      const webhookId = input.headers.id!;
      const change = webhookToEntitlementChange(envelope);
      if (dedupe.seen(webhookId)) {
        return ok({ verified: true, change, emitted: false, deduped: true });
      }
      dedupe.record(webhookId);

      // 5. Emit the entitlement-change RunEvent (when actionable).
      const runEvent = entitlementChangeToRunEvent(change, {
        taskId: deps.taskId,
        eventId: newEventId,
        ...(input.now ? { now: input.now } : {}),
      });
      if (runEvent) {
        await deps.events.emit(runEvent);
        return ok({ verified: true, change, emitted: true, deduped: false });
      }
      return ok({ verified: true, change, emitted: false, deduped: false });
    },
  };
}
