import { initializeSentry } from "@repo/observability/client";

// biome-ignore lint/performance/noBarrelFile: barrel re-export is intentional
export { onRouterTransitionStart } from "@repo/observability/client";

initializeSentry();
