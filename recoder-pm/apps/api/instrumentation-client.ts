import {
  initializeSentry,
  onRouterTransitionStart as onRouterTransitionStartBase,
} from "@repo/observability/client";

initializeSentry();

export const onRouterTransitionStart = (
  ...args: Parameters<typeof onRouterTransitionStartBase>
) => onRouterTransitionStartBase(...args);
