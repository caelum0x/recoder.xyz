// Owned by Recoder. Public surface of the WhatsApp ConnectorPort adapter. This
// is the real, working WhatsApp connector for @recoder/connectors: it implements
// the foundation's ConnectorPort by wrapping the WhatsApp Web (Baileys) bridge
// daemon (monitor/send/probe/normalize/react) with multi-account auth profiles.

export { WhatsAppConnector, createWhatsAppConnector } from "./connector.js";

export {
  resolveWhatsAppAccount,
  listWhatsAppAccountIds,
  listEnabledWhatsAppAccounts,
  normalizeAccountId,
  DEFAULT_ACCOUNT_ID,
  type ResolvedWhatsAppAccount,
} from "./accounts.js";

export {
  normalizeWhatsAppEvent,
  mediaKindFromMime,
} from "./normalize.js";

export {
  normalizeWhatsAppTarget,
  isWhatsAppGroupJid,
  isWhatsAppUserTarget,
  extractUserJidPhone,
  resolveWhatsAppSendJid,
  normalizeE164,
} from "./target.js";

export {
  chunkWhatsAppText,
  sendWhatsAppSegment,
  sendWhatsAppMedia,
  reactWhatsApp,
  WHATSAPP_TEXT_CHUNK_LIMIT,
  type WhatsAppSendContext,
  type WhatsAppSendResult,
  type WhatsAppOutboundMedia,
} from "./outbound.js";

export {
  whatsappPost,
  whatsappCheck,
  streamWhatsAppEvents,
  normalizeBaseUrl,
  type WhatsAppHttpOptions,
  type WhatsAppSseEvent,
  type WhatsAppCheckResult,
} from "./transport.js";

export {
  runWhatsAppSseLoop,
  computeBackoff,
  sleepWithAbort,
  type BackoffPolicy,
  type WhatsAppSseLoopParams,
} from "./monitor-loop.js";

export type {
  WhatsAppMessageKey,
  WhatsAppMediaMessage,
  WhatsAppExtendedTextMessage,
  WhatsAppContextInfo,
  WhatsAppMessageContent,
  WhatsAppInboundMessage,
  WhatsAppMessageEvent,
} from "./wire.js";
