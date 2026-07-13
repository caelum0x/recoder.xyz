// Owned by Recoder. Barrel for the LINE ConnectorPort adapter — the real LINE
// Messaging API gateway exposed through the foundation's uniform connector
// contract. Construct a `LineConnector` with an HTTP ingress + LINE config and
// the control plane can monitor / send / probe / normalize / react LINE
// uniformly with every other connector.

export { LineConnector, type LineConnectorOptions } from "./line-connector.js";
export {
  LineAccountRegistry,
} from "./line-registry.js";
export {
  DEFAULT_ACCOUNT_ID,
  listLineAccountIds,
  normalizeAccountId,
  resolveLineAccount,
  type LineAccountConfig,
  type LineConnectorConfig,
  type LineTokenSource,
  type ResolvedLineAccount,
} from "./line-accounts.js";
export {
  startLineMonitor,
  validateLineSignature,
  type LineIngress,
  type LineMonitorParams,
  type LineWebhookReceiver,
} from "./line-monitor.js";
export {
  normalizeLineEvent,
  replyTokenForEvent,
} from "./line-normalize.js";
export { probeLineAccount, type LineProbeOutcome } from "./line-probe.js";
export {
  chunkLineText,
  deliverLineMessage,
  normalizeLineTarget,
  LINE_REPLY_BATCH,
  LINE_TEXT_LIMIT,
  type LineDeliveryParams,
  type LineDeliveryResult,
} from "./line-send.js";
export {
  createLineMessagingClient,
  loadLineMessagingApi,
} from "./line-runtime.js";
export * from "./line-sdk-types.js";
