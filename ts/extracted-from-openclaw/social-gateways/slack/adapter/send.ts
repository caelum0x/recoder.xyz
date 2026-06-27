// Owned by Recoder. Outbound Slack delivery for the connector adapter. The real
// SDK call sequence is ported verbatim from the extracted `slack/send.ts`:
//   resolve recipient → open a DM channel for user targets
//     (conversations.open) → chunk text to SLACK_TEXT_LIMIT →
//     post each chunk via chat.postMessage (thread_ts preserved).
// The OpenClaw-specific pieces the original layered on (config-driven chunk
// mode, markdown-IR table rendering, web media loader) are not part of the
// extraction; this keeps the genuine Slack API path and the real 4000-char cap.

import type { OutboundMessage, SendResult } from "../../../src/connector/index.js";
import type { SlackWebClient } from "./web-client.js";
import { chunkSlackText, SLACK_TEXT_LIMIT } from "./chunk.js";
import { parseSlackTarget, type SlackTarget } from "./target.js";

async function resolveChannelId(
  client: SlackWebClient,
  target: SlackTarget,
): Promise<string> {
  if (target.kind === "channel") {
    return target.id;
  }
  const response = await client.conversations.open({ users: target.id });
  const channelId = response.channel?.id;
  if (!channelId) {
    throw new Error(
      `Failed to open Slack DM channel for user "${target.id}"${
        response.error ? ` (${response.error})` : ""
      }`,
    );
  }
  return channelId;
}

/**
 * Deliver one outbound message to Slack. `conversationId` is used verbatim as
 * the channel/DM id when it is a Slack id; otherwise it is parsed via the real
 * recipient grammar (user:/channel:/<@id>/#…). `replyTo` threads the post.
 * Returns the channel-native ts of each delivered chunk.
 */
export async function sendSlackMessage(params: {
  client: SlackWebClient;
  message: OutboundMessage;
  textChunkLimit?: number;
}): Promise<SendResult> {
  const { message } = params;
  const target =
    parseSlackTarget(message.target.conversationId, { defaultKind: "channel" }) ??
    ({ kind: "channel", id: message.target.conversationId, raw: message.target.conversationId } satisfies SlackTarget);

  const channelId = await resolveChannelId(params.client, target);
  const threadTs = message.target.replyTo;

  const limit = Math.min(params.textChunkLimit ?? SLACK_TEXT_LIMIT, SLACK_TEXT_LIMIT);
  const chunks =
    message.chunks && message.chunks.length > 0
      ? message.chunks.flatMap((chunk) => chunkSlackText(chunk, limit))
      : chunkSlackText(message.text ?? "", limit);

  const messageIds: string[] = [];
  let delivered = false;
  for (const chunk of chunks.length > 0 ? chunks : [""]) {
    const response = await params.client.chat.postMessage({
      channel: channelId,
      text: chunk,
      thread_ts: threadTs,
    });
    if (response.ok === false) {
      throw new Error(
        `Slack chat.postMessage failed for channel "${channelId}"${
          response.error ? ` (${response.error})` : ""
        }`,
      );
    }
    delivered = true;
    if (response.ts) {
      messageIds.push(response.ts);
    }
  }

  return { delivered, messageIds };
}
