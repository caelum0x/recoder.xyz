// Owned by Recoder. ConnectorPort adapter barrel for the Feishu channel. Only
// exports the self-contained, compiling adapter surface (this is the entrypoint
// the connectors layer wires behind the uniform ConnectorPort). The legacy
// `index.ts` barrel re-exports the original OpenClaw-coupled modules and is left
// untouched; new consumers import from here.

export {
  FeishuConnector,
  FEISHU_CONNECTOR_IDENTITY,
  type FeishuConnectorOptions,
} from "./connector.js";
export {
  FeishuAccountRegistry,
  registryFromEnv,
  normalizeAccountId,
  DEFAULT_FEISHU_ACCOUNT_ID,
  type FeishuAccount,
} from "./auth-store.js";
export {
  FeishuRestClient,
  describeError,
  type FeishuCredentials,
  type FeishuBotIdentity,
  type FeishuReceiveIdType,
} from "./rest-client.js";
export { normalizeFeishuEvent } from "./normalize.js";
export { chunkFeishuText, FEISHU_DEFAULT_TEXT_CHUNK_LIMIT } from "./chunk.js";
export {
  loadLarkSdk,
  setLarkSdkLoader,
  type LarkSdkModule,
  type LarkSdkLoader,
  type LarkWsClient,
  type LarkEventDispatcher,
} from "./lark-ws-port.js";
