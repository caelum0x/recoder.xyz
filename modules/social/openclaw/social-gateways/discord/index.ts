export { monitorDiscordProvider } from "./monitor.js";
export { sendMessageDiscord, sendPollDiscord } from "./send.js";

// Recoder ConnectorPort adapter — wraps the real Discord gateway behind the
// foundation's uniform connector contract (interop §7.4 connectors/social/*).
export {
  DiscordConnectorPort,
  discordConnectorPort,
} from "./connector-port.js";
export {
  DISCORD_CONNECTOR_KIND,
  discordChatTypeFromChannelType,
  isDiscordMessageEvent,
  normalizeDiscordMessageEvent,
} from "./normalize.js";
