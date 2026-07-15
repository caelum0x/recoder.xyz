/**
 * `inbound-pipeline` — the end-to-end path ONE inbound channel message travels
 * after it crosses the transport boundary (webhook HMAC verified / long-poll):
 *
 *   1. DEDUP     — `repository.wasSeen` drops an already-processed provider msg;
 *   2. TRUST     — the hostile-by-default `MentionGate.admit` decides admission;
 *   3. DISPATCH  — an admitted `/run …` → conductor; anything else → reply agent;
 *   4. REPLY     — a produced reply is sent back over the ConnectorPort (best-effort);
 *   5. AUDIT     — every outcome is recorded via `repository.recordInbound` (which
 *                  is also the idempotency guard for step 1).
 *
 * This is the reference proof that TELEGRAM works end-to-end. Every step is
 * degrade-safe: a dropped/rejected message is recorded truthfully, a dispatch that
 * cannot proceed yields an `error` outcome (never a faked run/reply), and a reply
 * send failure is surfaced, never swallowed silently.
 */
import type { MentionGate } from '../ports/mention-gate.port.js';
import type { DispatchPort } from '../ports/dispatch.port.js';
import type { SocialRepository } from '../ports/social-repository.port.js';
import type { ChannelAdapterRegistry } from '../adapters/channel-adapter-registry.js';
import type { ChannelId, DispatchOutcome, InboundEnvelope, MentionDecision } from '../types.js';

/** The result of running one inbound message through the pipeline. */
export interface IngestResult {
  /** True when the message was a duplicate (already processed) and skipped. */
  readonly deduped: boolean;
  readonly decision?: MentionDecision;
  readonly outcome?: DispatchOutcome;
  /** True when a produced reply was successfully delivered back to the channel. */
  readonly replied?: boolean;
}

export interface InboundPipelineDeps {
  readonly repository: SocialRepository;
  readonly mentionGate: MentionGate;
  readonly dispatch: DispatchPort;
  readonly channels: ChannelAdapterRegistry;
  /** Maps a channel to its connector row id (default: the channel name). */
  readonly connectorIdFor?: (channel: ChannelId) => string;
}

let inboundSeq = 0;
function newInboundId(): string {
  inboundSeq += 1;
  return `inb_${Date.now().toString(36)}_${inboundSeq.toString(36)}`;
}

export interface InboundPipeline {
  ingest(env: InboundEnvelope): Promise<IngestResult>;
}

/** Build the inbound pipeline. Pure factory; degrade-safe end to end. */
export function createInboundPipeline(deps: InboundPipelineDeps): InboundPipeline {
  const connectorIdFor = deps.connectorIdFor ?? ((channel: ChannelId) => channel);

  return {
    async ingest(env: InboundEnvelope): Promise<IngestResult> {
      const connectorId = connectorIdFor(env.channel);

      // --- 1. DEDUP (replay/idempotency guard) --------------------------------
      if (await safe(() => deps.repository.wasSeen(connectorId, env.providerMsgId))) {
        return { deduped: true };
      }

      // --- 2. TRUST boundary (hostile-by-default) -----------------------------
      const decision = await deps.mentionGate.admit(env);
      if (!decision.admitted) {
        await record(deps, connectorId, env, 'rejected', decision.reason);
        return { deduped: false, decision };
      }

      // --- 3. DISPATCH --------------------------------------------------------
      const outcome =
        decision.dispatchKind === 'conductor' && decision.command
          ? await deps.dispatch.dispatchToConductor(env, decision.command)
          : await deps.dispatch.replyInChannel(env);

      // --- 4. REPLY (best-effort; failures surfaced, never swallowed) ---------
      let replied = false;
      if (outcome.kind === 'reply' && outcome.reply) {
        const send = await deps.channels.send(env.channel, {
          target: { channel: env.channel as never, accountId: 'default', conversationId: env.chatRef, replyTo: env.providerMsgId },
          text: outcome.reply,
        });
        replied = send.delivered;
      }

      // --- 5. AUDIT -----------------------------------------------------------
      await record(
        deps,
        connectorId,
        env,
        'admitted',
        outcome.error,
        decision.dispatchKind === 'none' ? undefined : decision.dispatchKind,
        outcome.runId,
      );

      return { deduped: false, decision, outcome, replied };
    },
  };
}

async function record(
  deps: InboundPipelineDeps,
  connectorId: string,
  env: InboundEnvelope,
  decision: 'admitted' | 'rejected' | 'ignored',
  reason?: string,
  dispatchKind?: 'conductor' | 'reply',
  runId?: string,
): Promise<void> {
  await safe(() =>
    deps.repository.recordInbound({
      id: newInboundId(),
      connectorId,
      chatRef: env.chatRef,
      providerMsg: env.providerMsgId,
      decision,
      ...(reason ? { reason } : {}),
      ...(dispatchKind ? { dispatchKind } : {}),
      ...(runId ? { runId } : {}),
    }),
  );
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
