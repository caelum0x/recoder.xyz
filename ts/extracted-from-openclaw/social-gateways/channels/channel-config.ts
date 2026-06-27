// Owned by Recoder. The raw Discord gateway imports
// `../../channels/channel-config.js` for the per-channel allowlist/config
// matching primitives (`buildChannelKeyCandidates`,
// `resolveChannelEntryMatchWithFallback`, `resolveChannelMatchConfig`, and the
// `ChannelMatchSource` discriminator). That sibling already exists, verbatim, in
// the raw extraction at `gateway-core/channels/channel-config.ts` — pure,
// zero-dependency code shared by every channel's config resolution. This module
// re-points the social-gateways-relative import to that real source so the
// Discord adapter resolves the SAME implementation the other channels use,
// instead of a duplicated copy.

export {
  applyChannelMatchMeta,
  buildChannelKeyCandidates,
  type ChannelEntryMatch,
  type ChannelMatchSource,
  normalizeChannelSlug,
  resolveChannelEntryMatch,
  resolveChannelEntryMatchWithFallback,
  resolveChannelMatchConfig,
  resolveNestedAllowlistDecision,
} from "../../gateway-core/channels/channel-config.js";
