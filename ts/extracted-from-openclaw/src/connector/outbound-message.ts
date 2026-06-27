// Owned by Recoder. Wire-agnostic outbound message + delivery target. The
// `deliver-outbound` seam (interop §7.4) converts one of these into a concrete
// channel send via ConnectorPort.send (e.g. sendMessageTelegram, slack
// chat.postMessage, discord REST, signal-cli send, line push, feishu im).

import type { ConnectorKind } from "./connector-kind.js";

/** Where an outbound message should be delivered. */
export interface OutboundTarget {
  readonly channel: ConnectorKind;
  /** Connector account id to send from. */
  readonly accountId: string;
  /** Channel-native conversation id to deliver to. */
  readonly conversationId: string;
  /** Optional message id to reply to / thread under. */
  readonly replyTo?: string;
}

/** A normalized outbound attachment to upload alongside the message. */
export interface OutboundAttachment {
  readonly mimeType?: string;
  readonly filename?: string;
  /** Local path or URL the connector resolves to bytes. */
  readonly source: string;
}

/** A message to deliver to a channel. */
export interface OutboundMessage {
  readonly target: OutboundTarget;
  /** Full text body. Connectors that cap message length chunk this. */
  readonly text: string;
  /**
   * Pre-chunked segments. If provided, the connector delivers each segment as a
   * separate message; otherwise it chunks `text` to the channel's max payload.
   */
  readonly chunks?: readonly string[];
  readonly attachments?: readonly OutboundAttachment[];
}

/** Result of a send attempt — the channel-native id(s) of delivered messages. */
export interface SendResult {
  readonly delivered: boolean;
  readonly messageIds: readonly string[];
}

/** A reaction (emoji ack) to apply to an inbound message. */
export interface ReactionRequest {
  readonly channel: ConnectorKind;
  readonly accountId: string;
  readonly conversationId: string;
  readonly messageId: string;
  /** Unicode emoji or channel-native reaction name. */
  readonly emoji: string;
  /**
   * Channel-native author of the message being reacted to. Required by channels
   * whose reaction API addresses the target by its author rather than only the
   * conversation — e.g. signal-cli `sendReaction` for a GROUP message needs the
   * original sender (`targetAuthor`), and an iMessage tapback / Signal group
   * tapback cannot be addressed by `conversationId` + `messageId` alone. For DM
   * conversations the author equals the conversation peer, so this is optional
   * and adapters fall back to `conversationId` when it is absent.
   */
  readonly targetAuthor?: string;
}
