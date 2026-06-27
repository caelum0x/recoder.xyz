// Owned by Recoder. Slack connector adapter barrel — the real ConnectorPort
// implementation for the Slack channel, wrapping the extracted Slack SDK paths
// behind the foundation contract. Import `SlackConnector` /
// `createSlackConnector` to obtain a working Slack ConnectorPort.

export {
  SlackConnector,
  createSlackConnector,
  type SlackConnectorOptions,
} from "./slack-connector.js";

export {
  SlackAuthProfileStore,
  DEFAULT_SLACK_ACCOUNT_ID,
  normalizeSlackToken,
  type SlackAuthProfile,
  type ResolvedSlackAuthProfile,
  type SlackTokenSource,
  type SlackIngressMode,
} from "./auth-profiles.js";

export { normalizeSlackEvent } from "./normalize.js";
export { sendSlackMessage } from "./send.js";
export { reactSlackMessage, unreactSlackMessage, normalizeSlackEmoji } from "./react.js";
export { probeSlack, type SlackProbeOutcome } from "./probe.js";
export { monitorSlackAccount } from "./monitor.js";
export {
  createSlackWebClient,
  SLACK_DEFAULT_RETRY_OPTIONS,
  type SlackWebClient,
} from "./web-client.js";
export { parseSlackTarget, type SlackTarget, type SlackTargetKind } from "./target.js";
export { chunkSlackText, SLACK_TEXT_LIMIT } from "./chunk.js";
export {
  inferSlackChannelType,
  normalizeSlackChannelType,
  slackChatTypeToChatType,
  type SlackChannelType,
} from "./channel-type.js";
export {
  resolveSlackThreadContext,
  type SlackThreadContext,
  type SlackReplyToMode,
} from "./thread.js";
export {
  type SlackInboundEvent,
  type SlackMessageEvent,
  type SlackAppMentionEvent,
  type SlackFile,
} from "./events.js";
export {
  SLACK_CONNECTOR_KIND,
  RECODER_PRODUCT_NAME,
  RECODER_SLACK_WEBHOOK_PATH,
} from "./identity.js";
