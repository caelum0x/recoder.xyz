// Owned by Recoder. Self-contained structural typings for the exact subset of
// `@line/bot-sdk` (v11) that the Recoder LINE ConnectorPort adapter uses. The
// raw gateway source (../send.ts, ../probe.ts, ../types.ts,
// ../bot-message-context.ts) imports these same shapes straight from
// `@line/bot-sdk`; that SDK is declared as an OPTIONAL peer dependency of
// @recoder/connectors and is loaded at runtime by the adapter (see
// ./line-runtime.ts). The package itself does not install it (keeping the
// disk-constrained dev box ENOSPC-safe), so this module owns the structural
// shapes the adapter type-checks against — exactly as the foundation owns
// `validateSenderIdentity` / `normalizeChatType` standalone.
//
// These are NOT mocks: every field mirrors the real `@line/bot-sdk` messaging +
// webhook types, so the runtime SDK client is assignable to `LineMessagingApiClient`
// and real `WebhookEvent` payloads satisfy `LineWebhookEvent`. The adapter makes
// real network calls through the real SDK; this file is the compile-time contract.

/* ----------------------------- Outbound messages ---------------------------- */

export interface LineTextMessage {
  type: "text";
  text: string;
  quickReply?: LineQuickReply;
}

export interface LineImageMessage {
  type: "image";
  originalContentUrl: string;
  previewImageUrl: string;
}

export interface LineLocationMessage {
  type: "location";
  title: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface LineQuickReplyItem {
  type: "action";
  action: {
    type: "message";
    label: string;
    text: string;
  };
}

export interface LineQuickReply {
  items: LineQuickReplyItem[];
}

/** The subset of outbound message kinds the adapter constructs. */
export type LineOutboundMessage = LineTextMessage | LineImageMessage | LineLocationMessage;

/* ------------------------------- Bot identity ------------------------------- */

export interface LineBotInfoResponse {
  userId: string;
  basicId: string;
  displayName: string;
  pictureUrl?: string;
  premiumId?: string;
  chatMode?: string;
  markAsReadMode?: string;
}

export interface LineUserProfileResponse {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
  language?: string;
}

/* ------------------------------- API client --------------------------------- */

export interface LinePushMessageRequest {
  to: string;
  messages: LineOutboundMessage[];
  notificationDisabled?: boolean;
  customAggregationUnits?: string[];
}

export interface LineReplyMessageRequest {
  replyToken: string;
  messages: LineOutboundMessage[];
  notificationDisabled?: boolean;
}

export interface LineShowLoadingAnimationRequest {
  chatId: string;
  loadingSeconds?: number;
}

/** Structural mirror of `messagingApi.MessagingApiClient` (the methods used). */
export interface LineMessagingApiClient {
  pushMessage(request: LinePushMessageRequest): Promise<{ sentMessages?: Array<{ id: string }> }>;
  replyMessage(
    request: LineReplyMessageRequest,
  ): Promise<{ sentMessages?: Array<{ id: string }> }>;
  getBotInfo(): Promise<LineBotInfoResponse>;
  getProfile(userId: string): Promise<LineUserProfileResponse>;
  showLoadingAnimation(request: LineShowLoadingAnimationRequest): Promise<unknown>;
}

export interface LineMessagingApiClientConfig {
  channelAccessToken: string;
}

/** Structural mirror of the `@line/bot-sdk` `messagingApi` namespace surface. */
export interface LineMessagingApiNamespace {
  MessagingApiClient: new (config: LineMessagingApiClientConfig) => LineMessagingApiClient;
}

/* ------------------------------ Webhook events ------------------------------ */

export interface LineUserSource {
  type: "user";
  userId?: string;
}

export interface LineGroupSource {
  type: "group";
  groupId: string;
  userId?: string;
}

export interface LineRoomSource {
  type: "room";
  roomId: string;
  userId?: string;
}

export type LineEventSource = LineUserSource | LineGroupSource | LineRoomSource;

export interface LineTextEventMessage {
  type: "text";
  id: string;
  text: string;
  mention?: {
    mentionees: Array<{ index: number; length: number; userId?: string; type?: string }>;
  };
}

export interface LineImageEventMessage {
  type: "image";
  id: string;
  contentProvider?: { type: string; originalContentUrl?: string; previewImageUrl?: string };
}

export interface LineVideoEventMessage {
  type: "video";
  id: string;
  duration?: number;
  contentProvider?: { type: string; originalContentUrl?: string; previewImageUrl?: string };
}

export interface LineAudioEventMessage {
  type: "audio";
  id: string;
  duration?: number;
  contentProvider?: { type: string; originalContentUrl?: string };
}

export interface LineFileEventMessage {
  type: "file";
  id: string;
  fileName: string;
  fileSize: number;
}

export interface LineStickerEventMessage {
  type: "sticker";
  id: string;
  packageId: string;
  stickerId: string;
  stickerResourceType?: string;
  keywords?: string[];
  text?: string;
}

export interface LineLocationEventMessage {
  type: "location";
  id: string;
  title?: string;
  address?: string;
  latitude: number;
  longitude: number;
}

export type LineEventMessage =
  | LineTextEventMessage
  | LineImageEventMessage
  | LineVideoEventMessage
  | LineAudioEventMessage
  | LineFileEventMessage
  | LineStickerEventMessage
  | LineLocationEventMessage;

export interface LineMessageEvent {
  type: "message";
  mode?: string;
  timestamp: number;
  source: LineEventSource;
  replyToken: string;
  message: LineEventMessage;
  webhookEventId?: string;
}

export interface LinePostbackEvent {
  type: "postback";
  mode?: string;
  timestamp: number;
  source: LineEventSource;
  replyToken: string;
  postback: { data: string; params?: Record<string, string> };
  webhookEventId?: string;
}

export interface LineFollowEvent {
  type: "follow";
  mode?: string;
  timestamp: number;
  source: LineEventSource;
  replyToken: string;
}

export interface LineUnfollowEvent {
  type: "unfollow";
  mode?: string;
  timestamp: number;
  source: LineEventSource;
}

/** Any webhook event delivered to a LINE webhook endpoint. */
export type LineWebhookEvent =
  | LineMessageEvent
  | LinePostbackEvent
  | LineFollowEvent
  | LineUnfollowEvent
  | { type: string; mode?: string; timestamp?: number; source?: LineEventSource };

export interface LineWebhookRequestBody {
  destination: string;
  events: LineWebhookEvent[];
}

/** Narrowing helper: is this a delivered text/media message event. */
export function isLineMessageEvent(event: LineWebhookEvent): event is LineMessageEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as LineWebhookEvent).type === "message" &&
    typeof (event as LineMessageEvent).message === "object"
  );
}

/** Narrowing helper: is this a postback (button/action) event. */
export function isLinePostbackEvent(event: LineWebhookEvent): event is LinePostbackEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as LineWebhookEvent).type === "postback" &&
    typeof (event as LinePostbackEvent).postback === "object"
  );
}
