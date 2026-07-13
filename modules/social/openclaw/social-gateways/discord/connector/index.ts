// Owned by Recoder. Discord ConnectorPort adapter barrel.
//
// Public surface of the real Discord connector: the ConnectorPort implementation
// plus the building blocks (REST client, account resolution, normalization,
// chunking, target/delivery) the adapter composes. Implements the foundation
// `ConnectorPort` contract from `src/connector` against the real Discord REST v10
// wire protocol. Construct a `DiscordConnector` with an optional gateway event
// source + config and the control plane can monitor / send / probe / normalize /
// react Discord uniformly with every other connector.

export {
  DiscordConnector,
  createDiscordConnector,
  type DiscordConnectorOptions,
  type DiscordEventSource,
  type DiscordGatewayHandler,
} from "./discord-connector.js";

export {
  DiscordApiClient,
  DiscordApiClientError,
  DISCORD_MAX_MESSAGE_LENGTH,
  type DiscordBotIdentity,
  type DiscordCreatedMessage,
  type DiscordUser,
} from "./discord-api.js";

export {
  resolveDiscordAccount,
  normalizeAccountId,
  normalizeDiscordToken,
  DEFAULT_DISCORD_ACCOUNT_ID,
  type DiscordAccountConfig,
  type DiscordConnectorConfig,
  type DiscordTokenSource,
  type ResolvedDiscordAccount,
} from "./accounts.js";

export {
  normalizeDiscordMessageEvent,
  isDiscordGatewayEvent,
  discordChatTypeFromChannelType,
  formatDiscordUserTag,
  resolveTimestampMs,
  type DiscordGatewayEvent,
  type DiscordEventMessage,
  type DiscordEventUser,
  type DiscordEventMember,
} from "./normalize.js";

export { chunkDiscordText, type ChunkDiscordTextOpts } from "./chunk.js";

export {
  deliverDiscordMessage,
  parseDiscordRecipient,
  normalizeReactionEmoji,
  type DiscordDeliveryParams,
  type DiscordDeliveryResult,
  type DiscordRecipient,
} from "./send.js";
