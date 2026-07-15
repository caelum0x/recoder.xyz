/**
 * `SocialConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (no `process.env` in domain code). The foundational
 * `AppConfig` does not yet carry a `social` slice, so bootstrap injects the
 * per-channel enable + secret-ref map, the ingress signing secret, and the zrok
 * tunnel settings through `overrides`.
 *
 * Hostile-by-default + truthful: a channel is `enabled` only when explicitly
 * turned on AND carries a secret ref; the allowlist defaults EMPTY (nothing
 * admitted); a missing ingress secret leaves the signed connector-ingress gate
 * inert (the channel-edge HMAC boundary is still in force).
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';
import { CHANNEL_IDS, type ChannelId } from './types.js';

/** Per-channel config: whether it is on + the vault reference for its secret. */
export const channelConfigSchema = z.object({
  enabled: z.boolean(),
  /** Vault REFERENCE (never the secret itself); `null` ⇒ channel `down`. */
  secretRef: z.string().nullable(),
});
export type ChannelConfig = z.infer<typeof channelConfigSchema>;

export const socialConfigSchema = z.object({
  isProduction: z.boolean(),
  /** Per-channel enable + secret-ref map (keyed by ChannelId). */
  channels: z.record(z.enum(CHANNEL_IDS), channelConfigSchema),
  /** Require an explicit @mention before acting in a group/channel. */
  requireMention: z.boolean(),
  /** Allowlist of channel-native sender ids/usernames; `*` = allow-all (opt-in). */
  allowlist: z.array(z.string()),
  /** Shared HMAC secret for the signed connector-ingress vouch; `null` ⇒ inert. */
  ingressSecret: z.string().nullable(),
  /** zrok public-URL tunnel settings for NAT webhook exposure. */
  zrok: z.object({
    enabled: z.boolean(),
    /** zrok binary path / share name; `null` ⇒ tunnel `down` (degrade-safe). */
    shareName: z.string().nullable(),
  }),
});
export type SocialConfig = z.infer<typeof socialConfigSchema>;

/** The not-yet-in-AppConfig social values bootstrap injects. */
export interface SocialConfigOverrides {
  readonly channels?: Partial<Record<ChannelId, ChannelConfig>>;
  readonly requireMention?: boolean;
  readonly allowlist?: readonly string[];
  readonly ingressSecret?: string | null;
  readonly zrok?: { enabled?: boolean; shareName?: string | null };
}

/** All channels default OFF with no secret (hostile-by-default). */
function defaultChannels(): Record<ChannelId, ChannelConfig> {
  const out = {} as Record<ChannelId, ChannelConfig>;
  for (const id of CHANNEL_IDS) out[id] = { enabled: false, secretRef: null };
  return out;
}

/**
 * Project the social slice out of the whole config. Everything is degrade-safe
 * by default; `overrides` supplies the real per-channel + secret + zrok config
 * without any env reads.
 */
export function sliceSocialConfig(app: AppConfig, overrides: SocialConfigOverrides = {}): SocialConfig {
  const channels = defaultChannels();
  if (overrides.channels) {
    for (const id of CHANNEL_IDS) {
      const c = overrides.channels[id];
      if (c) channels[id] = { enabled: c.enabled, secretRef: c.secretRef };
    }
  }
  return socialConfigSchema.parse({
    isProduction: app.runtime.isProduction,
    channels,
    requireMention: overrides.requireMention ?? true,
    allowlist: [...(overrides.allowlist ?? [])],
    ingressSecret: overrides.ingressSecret ?? null,
    zrok: {
      enabled: overrides.zrok?.enabled ?? false,
      shareName: overrides.zrok?.shareName ?? null,
    },
  });
}
