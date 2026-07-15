/**
 * `reply-agent` — the conversational half of the {@link DispatchPort}. It answers
 * an admitted, non-command inbound with a bounded reply-agent turn via the Phase-6
 * inference gateway (consumed through a PORT, never a direct import).
 *
 * DEGRADE-SAFE, never a fabricated reply:
 *   - no inference port wired  ⇒ `error` outcome (inference unavailable);
 *   - inference faults / empty ⇒ `error` outcome carrying the reason.
 * A `reply` string is returned ONLY when the gateway genuinely produced one.
 */
import type { DispatchOutcome, InboundEnvelope } from '../types.js';

/** The narrow inference seam (bootstrap adapts the Phase-6 gateway). */
export interface ReplyInferencePort {
  /** Produce a bounded reply for an inbound message; `ok:false` ⇒ truthful error. */
  reply(input: {
    readonly channel: string;
    readonly chatRef: string;
    readonly senderId: string;
    readonly text: string;
  }): Promise<{ ok: boolean; text?: string; reason?: string }>;
}

export interface ReplyAgentDeps {
  /** Optional inference seam; absent ⇒ every reply errors truthfully. */
  readonly inference?: ReplyInferencePort;
}

function error(reason: string): DispatchOutcome {
  return { kind: 'reply', error: reason };
}

/** Build the reply-agent half of the DispatchPort. */
export function createReplyAgent(deps: ReplyAgentDeps) {
  return async function replyInChannel(env: InboundEnvelope): Promise<DispatchOutcome> {
    if (!deps.inference) {
      return error('inference gateway is not wired — cannot generate a reply');
    }
    const res = await safe(() =>
      deps.inference!.reply({ channel: env.channel, chatRef: env.chatRef, senderId: env.senderId, text: env.text }),
    );
    if (!res || !res.ok || !res.text) {
      return error(res?.reason ?? 'inference produced no reply');
    }
    return { kind: 'reply', reply: res.text };
  };
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
