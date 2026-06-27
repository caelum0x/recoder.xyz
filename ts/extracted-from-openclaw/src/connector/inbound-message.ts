// Owned by Recoder. Wire-agnostic inbound message domain type — the output of
// every connector's `normalize()`. Each social gateway converts its native
// event (telegram Update, slack event, discord Message, signal envelope, line
// webhook event, feishu event, imessage row, whatsapp WAMessage) into this one
// shape so the gating + routing layers are channel-independent (interop §7.4).

import type { ChatType } from "./chat-type.js";
import type { ConnectorKind } from "./connector-kind.js";
import type { SenderIdentity } from "./sender-identity.js";

/** A normalized attachment reference (image/audio/file/etc.). */
export interface InboundAttachment {
  /** MIME type if known. */
  mimeType?: string;
  /** Channel-native file/media id used to fetch the bytes lazily. */
  remoteId?: string;
  /** Resolved URL if the channel exposes one. */
  url?: string;
  /** Original filename if provided. */
  filename?: string;
  /** Byte size if reported. */
  size?: number;
}

/**
 * A single inbound message, normalized off the wire. Hostile by default: until
 * gating authorizes it, this produces NO control-plane action (interop §2).
 */
export interface NormalizedInboundMessage {
  /** Which channel produced this message. */
  readonly channel: ConnectorKind;
  /** Connector account id the message arrived on (multi-account aware). */
  readonly accountId: string;
  /** Channel-native message id, used for replies/reactions/dedupe. */
  readonly messageId: string;
  /** Channel-native conversation id (chat/channel/thread). */
  readonly conversationId: string;
  /** Normalized conversation surface kind. */
  readonly chatType: ChatType;
  /** Unverified channel-side sender identity. */
  readonly sender: SenderIdentity;
  /** Plain-text body of the message (mentions stripped where applicable). */
  readonly text: string;
  /** Whether the assistant was explicitly @mentioned (drives mention gating). */
  readonly wasMentioned: boolean;
  /** Media attachments, lazily fetchable via the connector. */
  readonly attachments: readonly InboundAttachment[];
  /** Epoch milliseconds the channel reports for the message. */
  readonly timestamp: number;
  /** The original channel-native payload, retained for adapter-specific use. */
  readonly raw: unknown;
}
