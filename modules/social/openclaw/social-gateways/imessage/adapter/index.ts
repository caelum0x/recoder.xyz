// Owned by Recoder. iMessage ConnectorPort adapter barrel. Re-exports the port
// implementation plus the real, dependency-free pieces it composes (accounts,
// transport client, targets, normalize, outbound, probe) so downstream
// connectors-package code can wire iMessage behind the uniform ConnectorPort.

export {
  IMessageConnector,
  createIMessageConnector,
  imessageConnectorPort,
} from "./connector.js";

export {
  DEFAULT_ACCOUNT_ID,
  listEnabledIMessageAccounts,
  listIMessageAccountIds,
  normalizeAccountId,
  resolveIMessageAccount,
  type ResolvedIMessageAccount,
} from "./accounts.js";

export {
  IMESSAGE_CONNECTOR_KIND,
  isIMessagePayload,
  mediaKindFromMime,
  normalizeIMessageEvent,
  type IMessageAttachment,
  type IMessagePayload,
} from "./normalize.js";

export {
  createIMessageRpcClient,
  DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS,
  IMessageRpcClient,
  type IMessageRpcClientOptions,
  type IMessageRpcNotification,
} from "./client.js";

export {
  formatIMessageChatTarget,
  isAllowedIMessageSender,
  normalizeE164,
  normalizeIMessageHandle,
  parseIMessageAllowTarget,
  parseIMessageTarget,
  type IMessageAllowTarget,
  type IMessageService,
  type IMessageTarget,
} from "./targets.js";

export {
  chunkIMessageText,
  IMESSAGE_TEXT_CHUNK_LIMIT,
  reactIMessage,
  sendIMessageSegment,
  type IMessageSendContext,
  type IMessageSegmentResult,
} from "./outbound.js";

export {
  probeIMessage,
  type IMessageProbe,
  type IMessageProbeOptions,
} from "./probe.js";

export { resolveUserPath, type RuntimeEnv } from "./runtime.js";
