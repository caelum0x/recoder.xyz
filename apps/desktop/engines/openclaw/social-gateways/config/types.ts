// Owned by Recoder. Structural config types for the raw Discord gateway, which
// imported them from a monorepo `../config/types.js` (and `types.base` /
// `types.discord`) that the extraction did not carry over. These mirror only the
// fields the extracted Discord code actually reads; an index signature keeps
// them forward-compatible with the wider OpenClaw/Recoder config surface without
// pretending to enumerate it. Real types, not stubs — they describe the genuine
// shape the gateway consumes.

/** How outbound markdown tables are rendered for a channel. */
export type MarkdownTableMode = "off" | "ascii" | "unicode" | "image";

/** Per-guild channel override entry. */
export interface DiscordGuildChannelConfig {
  allow?: boolean;
  requireMention?: boolean;
  skills?: string[];
  enabled?: boolean;
  users?: Array<string | number>;
  systemPrompt?: string;
  includeThreadStarter?: boolean;
  autoThread?: boolean;
}

/** Per-guild config entry under `channels.discord.guilds[*]`. */
export interface DiscordGuildEntry {
  id?: string;
  slug?: string;
  requireMention?: boolean;
  reactionNotifications?: "off" | "own" | "all" | "allowlist";
  users?: Array<string | number>;
  channels?: Record<string, DiscordGuildChannelConfig>;
  [key: string]: unknown;
}

/** Exec-approval gating config for a Discord account. */
export interface DiscordExecApprovalConfig {
  enabled?: boolean;
  approvers?: Array<string | number>;
  timeoutMs?: number;
  [key: string]: unknown;
}

/** Gateway intents config for a Discord account. */
export interface DiscordIntentsConfig {
  presence?: boolean;
  reactions?: boolean;
  guildMembers?: boolean;
  [key: string]: unknown;
}

/** Config for a single Discord account (or the channel-level defaults). */
export interface DiscordAccountConfig {
  enabled?: boolean;
  name?: string;
  token?: string;
  requireMention?: boolean;
  markdownTables?: MarkdownTableMode;
  guilds?: Record<string, DiscordGuildEntry>;
  execApprovals?: DiscordExecApprovalConfig;
  intents?: DiscordIntentsConfig;
  [key: string]: unknown;
}

/** The `channels.discord` config block, including the per-account map. */
export interface DiscordChannelConfig extends DiscordAccountConfig {
  accounts?: Record<string, DiscordAccountConfig>;
}
