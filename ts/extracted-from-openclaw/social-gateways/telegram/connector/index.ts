// Owned by Recoder. Telegram ConnectorPort adapter barrel.
//
// Public surface of the real Telegram connector: the ConnectorPort
// implementation plus the building blocks (API client, account resolution,
// normalization, chunking) the adapter composes. Implements the foundation
// `ConnectorPort` contract from `src/connector` against the real Telegram Bot
// API wire protocol.

export {
  TelegramConnector,
  createTelegramConnector,
  type TelegramConnectorOptions,
} from "./telegram-connector.js";

export {
  TelegramApiClient,
  TelegramApiError,
  TELEGRAM_MAX_MESSAGE_LENGTH,
  type TelegramBotIdentity,
  type TelegramChat,
  type TelegramMessage,
  type TelegramUpdate,
  type TelegramUser,
} from "./telegram-api.js";

export {
  resolveTelegramAccount,
  normalizeAccountId,
  DEFAULT_TELEGRAM_ACCOUNT_ID,
  type ResolvedTelegramAccount,
  type TelegramTokenSource,
} from "./accounts.js";

export {
  normalizeTelegramMessage,
  normalizeTelegramUpdate,
} from "./normalize.js";

export { chunkTelegramText } from "./chunk.js";
