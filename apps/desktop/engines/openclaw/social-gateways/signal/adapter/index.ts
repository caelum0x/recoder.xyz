// Owned by Recoder. Public surface of the Signal ConnectorPort adapter. This is
// the real, working Signal connector for @recoder/connectors: it implements the
// foundation's ConnectorPort by wrapping the signal-cli JSON-RPC daemon
// (monitor/send/probe/normalize/react) with multi-account auth profiles.

export { SignalConnector, createSignalConnector } from "./connector.js";

export {
  resolveSignalAccount,
  listSignalAccountIds,
  listEnabledSignalAccounts,
  normalizeAccountId,
  DEFAULT_ACCOUNT_ID,
  type ResolvedSignalAccount,
} from "./accounts.js";

export {
  normalizeSignalEvent,
  mediaKindFromMime,
} from "./normalize.js";

export {
  parseSignalTarget,
  chunkSignalText,
  sendSignalSegment,
  reactSignal,
  SIGNAL_TEXT_CHUNK_LIMIT,
  type SignalSendContext,
  type SignalSendResult,
  type SignalReactionContext,
} from "./outbound.js";

export {
  resolveSignalSender,
  isSignalSenderAllowed,
  normalizeE164,
  formatSignalSenderId,
  formatSignalSenderDisplay,
  resolveSignalRecipient,
  resolveSignalPeerId,
  type SignalSender,
} from "./identity.js";

export {
  signalRpcRequest,
  signalCheck,
  streamSignalEvents,
  normalizeBaseUrl,
  type SignalRpcOptions,
  type SignalSseEvent,
  type SignalCheckResult,
} from "./transport.js";

export {
  runSignalSseLoop,
  computeBackoff,
  sleepWithAbort,
  type BackoffPolicy,
  type SignalSseLoopParams,
} from "./monitor-loop.js";

export type {
  SignalEnvelope,
  SignalDataMessage,
  SignalReactionMessage,
  SignalAttachment,
  SignalGroupInfo,
  SignalReceivePayload,
} from "./envelope.js";
