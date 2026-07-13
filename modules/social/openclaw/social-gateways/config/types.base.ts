// Owned by Recoder. The raw gateway split its config types across
// `types.base.js` / `types.discord.js` / `types.js`. The extraction only needs
// the shared base types the Discord adapter reads; they live in `./types.ts`
// and are re-surfaced here so `../../config/types.base.js` imports resolve to the
// real definitions.

export type { MarkdownTableMode } from "./types.js";
