/**
 * `createNeedsYouLoomStreamSource` — the composition-edge BRIDGE that turns the shipped
 * long-lived Loom `events.subscribe` stream into the push-callback
 * {@link NeedsYouStreamSource} the {@link NeedsYouQueueService} consumes (LOOM-ROADMAP.md
 * build-now #4). It REUSES the existing Loom client path (a second CLIENT over the SAME
 * daemon socket — NEVER a second daemon) and adds NO polling: one `pane.agent_status_changed`
 * subscription, translated edge-by-edge into attributed {@link NeedsYouEvent}s.
 *
 * Attribution is an INJECTED seam ({@link LoomStatusResolver}): a raw Loom event carries
 * only `{ pane_id, agent_status }`, so the bridge asks the resolver to map the pane to its
 * owning Recoder workspace (id, agent kind, owner, taskGroup). A pane the resolver cannot
 * attribute is DROPPED (truthful — the queue never guesses ownership), never fabricated.
 *
 * TRUTHFULNESS: the stream's own signals drive the callbacks — a yielded event ⇒ `onEvent`,
 * a normal end ⇒ `onClose`, a thrown/`LoomError` ⇒ `onError`. The bridge invents nothing;
 * the service's degrade + bounded re-subscribe do the rest.
 */
import type {
  AgentStatus,
  LoomEventStream,
  LoomSubscriptionEvent,
} from '@recoder/agent-runtimes/loom-client';
import type { LoggerPort } from '@recoder/substrate';
import type {
  NeedsYouEvent,
  NeedsYouStreamHandlers,
  NeedsYouStreamSource,
  NeedsYouSubscription,
} from './needs-you-queue.service.js';

/** The Loom subscription filter for the ONE stream this bridge opens. */
export const NEEDS_YOU_SUBSCRIPTION = {
  type: 'pane.agent_status_changed',
} as const;

/**
 * Resolve a raw Loom pane status edge to an attributed {@link NeedsYouEvent}, or `null`
 * when the pane cannot be mapped to a live Recoder workspace (⇒ the edge is dropped, never
 * guessed). Bound at bootstrap over the workspace records + a Loom pane index.
 */
export interface LoomStatusResolver {
  resolve(
    paneId: string,
    status: AgentStatus
  ): Promise<NeedsYouEvent | null> | NeedsYouEvent | null;
}

export interface NeedsYouLoomStreamDeps {
  /**
   * Open the long-lived Loom event stream (bind to
   * `loomClient.subscribe({ subscriptions:[NEEDS_YOU_SUBSCRIPTION] })` — the EXISTING
   * client over the SAME daemon socket). Called once per (re)subscribe.
   */
  readonly openStream: () => LoomEventStream;
  /** Map each raw pane status edge to an attributed workspace event (or drop it). */
  readonly resolver: LoomStatusResolver;
  readonly logger?: LoggerPort;
}

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Read `{ pane_id, agent_status }` out of a raw Loom subscription event's `data`. */
function readPaneStatus(
  event: LoomSubscriptionEvent
): { paneId: string; status: AgentStatus } | null {
  const data = event.data;
  if (data == null || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const paneId = record.pane_id;
  const status = record.agent_status;
  if (typeof paneId !== 'string' || paneId.length === 0) return null;
  // Loom omits `agent_status` when it went to `None`; treat that as a truthful `unknown`.
  const resolved: AgentStatus =
    typeof status === 'string' ? (status as AgentStatus) : 'unknown';
  return { paneId, status: resolved };
}

/**
 * Build the {@link NeedsYouStreamSource} over a Loom event stream. Each `subscribe`
 * opens ONE stream and drives its callbacks from the stream's own iterator lifecycle.
 */
export function createNeedsYouLoomStreamSource(
  deps: NeedsYouLoomStreamDeps
): NeedsYouStreamSource {
  const logger = deps.logger ?? NOOP_LOGGER;

  return {
    subscribe(handlers: NeedsYouStreamHandlers): NeedsYouSubscription {
      let stream: LoomEventStream;
      try {
        stream = deps.openStream();
      } catch (err) {
        // Opening the stream failed synchronously — surface it as a stream-down signal
        // so the service degrades + schedules a re-subscribe (never a fake live stream).
        handlers.onError(err);
        return { close: () => {} };
      }

      let closed = false;

      // Drive the async iterator; each yielded edge is attributed + pushed. The loop
      // owns exactly one of onClose/onError so the service's degrade fires once.
      void (async () => {
        try {
          for await (const raw of stream) {
            if (closed) break;
            const parsed = readPaneStatus(raw);
            if (parsed == null) continue; // non-status / malformed line — nothing to attribute
            let attributed: NeedsYouEvent | null;
            try {
              attributed = await deps.resolver.resolve(
                parsed.paneId,
                parsed.status
              );
            } catch (err) {
              // A resolver fault drops THIS edge only — never tears the stream down.
              logger.warn('needs-you bridge: pane attribution failed (edge dropped)', {
                paneId: parsed.paneId,
                err: message(err),
              });
              continue;
            }
            if (attributed == null) continue; // unattributable pane — dropped, never guessed
            if (!closed) handlers.onEvent(attributed);
          }
          if (!closed) handlers.onClose();
        } catch (err) {
          if (!closed) handlers.onError(err);
        }
      })();

      return {
        close: () => {
          if (closed) return;
          closed = true;
          try {
            stream.close();
          } catch (err) {
            logger.warn('needs-you bridge: stream close failed (ignored)', {
              err: message(err),
            });
          }
        },
      };
    },
  };
}
