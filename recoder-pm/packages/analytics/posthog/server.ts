import "server-only";
import { PostHog } from "posthog-node";
import { keys } from "../keys";

const createAnalytics = () => {
  const key = keys().NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    return null;
  }
  return new PostHog(key, {
    host: keys().NEXT_PUBLIC_POSTHOG_HOST,
    // Don't batch events and flush immediately - we're running in a serverless environment
    flushAt: 1,
    flushInterval: 0,
  });
};

export const analytics = createAnalytics();
