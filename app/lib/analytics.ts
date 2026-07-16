/**
 * Main analytics entrypoint.
 *
 * This file intentionally stays at `lib/analytics.ts` for compatibility with
 * existing imports (`@/lib/analytics`), while re-exporting the typed taxonomy
 * from `lib/analytics/*`.
 */

import { trackEvent } from './analytics/tracker';
import { AnalyticsEvents } from './analytics/events';

export { AnalyticsEvents } from './analytics/events';
export type {
  AnalyticsEvent,
  BaseEventProperties,
  AuthEventProperties,
  OnboardingEventProperties,
  ActivationEventProperties,
  EngagementEventProperties,
  BillingEventProperties,
  PageViewEventProperties,
  EventPropertiesMap,
} from './analytics/events';
export { trackEvent, trackServerEvent } from './analytics/tracker';

// Backward-compatible convenience API used by older auth UI components.
export const analytics = {
  signUp: (method: 'email' | 'google' | 'github') => {
    trackEvent(AnalyticsEvents.SIGNUP_COMPLETED, { method });
  },
  signIn: (method: 'email' | 'google' | 'github') => {
    trackEvent(AnalyticsEvents.LOGIN_COMPLETED, { method });
  },
  signOut: () => {
    trackEvent(AnalyticsEvents.LOGOUT);
  },
  launchWebIDE: () => {
    trackEvent(AnalyticsEvents.PLATFORM_PAGE_VIEWED, { platform: 'web-ide' });
  },
  createProject: (type?: string) => {
    trackEvent(AnalyticsEvents.PROJECT_CREATED, { projectId: type });
  },
  apiKeyAdded: (provider: string) => {
    trackEvent(AnalyticsEvents.PLATFORM_PAGE_VIEWED, { platform: provider });
  },
  pageView: (pagePath: string, pageTitle?: string) => {
    trackEvent(AnalyticsEvents.PLATFORM_PAGE_VIEWED, {
      pagePath,
      pageTitle,
    });
  },
};
