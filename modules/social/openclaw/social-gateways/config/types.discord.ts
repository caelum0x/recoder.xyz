// Owned by Recoder. Re-surfaces the Discord-specific config types from
// `./types.ts` so the raw gateway's `../../config/types.discord.js` imports
// resolve to the real definitions.

export type {
  DiscordAccountConfig,
  DiscordChannelConfig,
  DiscordExecApprovalConfig,
  DiscordGuildChannelConfig,
  DiscordGuildEntry,
  DiscordIntentsConfig,
} from "./types.js";
