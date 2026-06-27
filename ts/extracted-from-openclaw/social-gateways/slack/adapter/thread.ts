// Owned by Recoder. Slack threading resolution for inbound + outbound. Ported
// verbatim in behavior from the real extracted `slack/threading.ts`
// (`resolveSlackThreadContext` / `resolveSlackThreadTargets`). The original
// imported `ReplyToMode` from the OpenClaw config tree (not extracted); this
// owns the same three-value union. The thread-ts arithmetic is unchanged.

import type { SlackAppMentionEvent, SlackMessageEvent } from "./events.js";

/** Reply threading policy, ported from the real `ReplyToMode`. */
export type SlackReplyToMode = "off" | "first" | "all";

export interface SlackThreadContext {
  readonly incomingThreadTs?: string;
  readonly messageTs?: string;
  readonly isThreadReply: boolean;
  /** The ts to use as a reply anchor / dedupe key. */
  readonly replyToId?: string;
  /** The thread_ts an outbound reply should attach to (undefined = top-level). */
  readonly messageThreadId?: string;
}

/** Resolve inbound threading context (real `resolveSlackThreadContext`). */
export function resolveSlackThreadContext(params: {
  message: SlackMessageEvent | SlackAppMentionEvent;
  replyToMode: SlackReplyToMode;
}): SlackThreadContext {
  const incomingThreadTs = params.message.thread_ts;
  const eventTs = params.message.event_ts;
  const messageTs = params.message.ts ?? eventTs;
  const hasThreadTs = typeof incomingThreadTs === "string" && incomingThreadTs.length > 0;
  const isThreadReply =
    hasThreadTs && (incomingThreadTs !== messageTs || Boolean(params.message.parent_user_id));
  const replyToId = incomingThreadTs ?? messageTs;
  const messageThreadId = isThreadReply
    ? incomingThreadTs
    : params.replyToMode === "all"
      ? messageTs
      : undefined;
  return { incomingThreadTs, messageTs, isThreadReply, replyToId, messageThreadId };
}
