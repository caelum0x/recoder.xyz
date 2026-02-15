import type { ReactNode } from "react";
import { GoogleAnalytics } from "./google";
import { keys } from "./keys";
import { PostHogProvider } from "./posthog/client";
import { VercelAnalytics } from "./vercel";

type AnalyticsProviderProps = {
  readonly children: ReactNode;
};

const { NEXT_PUBLIC_GA_MEASUREMENT_ID, NEXT_PUBLIC_POSTHOG_KEY } = keys();

const hasPostHog = Boolean(NEXT_PUBLIC_POSTHOG_KEY);

export const AnalyticsProvider = ({ children }: AnalyticsProviderProps) => {
  const content = (
    <>
      {children}
      {process.env.VERCEL === "1" && <VercelAnalytics />}
      {!!NEXT_PUBLIC_GA_MEASUREMENT_ID && (
        <GoogleAnalytics gaId={NEXT_PUBLIC_GA_MEASUREMENT_ID} />
      )}
    </>
  );

  if (hasPostHog) {
    return <PostHogProvider>{content}</PostHogProvider>;
  }

  return content;
};
