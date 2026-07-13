// Owned by Recoder. The WhatsApp Web (Baileys) inbound message wire shapes the
// adapter's normalize step consumes. These mirror the real Baileys `WAMessage`
// structure the gateway's WhatsApp Web bridge emits on each `message` SSE frame:
// a `key` (remoteJid / fromMe / id / participant), a `message` content union
// (conversation / extendedTextMessage / *Message media variants), and the
// sender `pushName` + `messageTimestamp`. Re-declared here (rather than imported
// from @whiskeysockets/baileys) so the adapter has zero hard dependency on the
// channel SDK at type-check time — the bridge daemon owns the live socket; the
// connector only consumes its already-serialized JSON frames.

/** WhatsApp message addressing key (Baileys `WAMessageKey`). */
export interface WhatsAppMessageKey {
  /** Conversation JID: "<phone>@s.whatsapp.net" or "<id>@g.us". */
  readonly remoteJid?: string | null;
  /** True when the message was sent by the linked account itself. */
  readonly fromMe?: boolean | null;
  /** Channel-native message id (used for replies/reactions/dedupe). */
  readonly id?: string | null;
  /** In groups, the JID of the actual sender (the remoteJid is the group). */
  readonly participant?: string | null;
}

/** A media message variant (image/video/audio/document/sticker). */
export interface WhatsAppMediaMessage {
  readonly mimetype?: string | null;
  readonly caption?: string | null;
  readonly fileName?: string | null;
  readonly fileLength?: number | string | null;
  /** Bridge-assigned id used to fetch the bytes lazily, when provided. */
  readonly mediaId?: string | null;
  readonly url?: string | null;
}

/** Text body carried by `extendedTextMessage` (replies, link previews, …). */
export interface WhatsAppExtendedTextMessage {
  readonly text?: string | null;
  readonly contextInfo?: WhatsAppContextInfo | null;
}

/** Mention / quote context (drives `wasMentioned` in groups). */
export interface WhatsAppContextInfo {
  /** JIDs explicitly @mentioned in the message body. */
  readonly mentionedJid?: ReadonlyArray<string> | null;
  /** Set when this message quotes another (reply). */
  readonly quotedMessage?: WhatsAppMessageContent | null;
  readonly participant?: string | null;
}

/** The Baileys `message` content union (only the actionable variants). */
export interface WhatsAppMessageContent {
  /** Plain text body. */
  readonly conversation?: string | null;
  readonly extendedTextMessage?: WhatsAppExtendedTextMessage | null;
  readonly imageMessage?: WhatsAppMediaMessage | null;
  readonly videoMessage?: WhatsAppMediaMessage | null;
  readonly audioMessage?: WhatsAppMediaMessage | null;
  readonly documentMessage?: WhatsAppMediaMessage | null;
  readonly stickerMessage?: WhatsAppMediaMessage | null;
  /** Present on edit/protocol/reaction frames the adapter skips. */
  readonly protocolMessage?: unknown;
  readonly reactionMessage?: unknown;
  readonly senderKeyDistributionMessage?: unknown;
}

/** One inbound WhatsApp message (Baileys `WAMessage`). */
export interface WhatsAppInboundMessage {
  readonly key?: WhatsAppMessageKey | null;
  readonly message?: WhatsAppMessageContent | null;
  /** Display name of the sender as WhatsApp reports it. */
  readonly pushName?: string | null;
  /** Unix seconds (Baileys) for the message. */
  readonly messageTimestamp?: number | string | null;
  /** Bridge-provided account id, when the frame carries it. */
  readonly accountId?: string | null;
}

/** The `message` SSE frame payload the bridge emits (a single WAMessage). */
export interface WhatsAppMessageEvent {
  readonly message?: WhatsAppInboundMessage | null;
  /** Some bridges wrap the WAMessage directly as the frame; supported too. */
  readonly key?: WhatsAppMessageKey | null;
}
