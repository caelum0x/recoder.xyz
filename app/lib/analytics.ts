/**
 * Main analytics entrypoint.
 *
 * This file intentionally stays at `lib/analytics.ts` for compatibility with
 * existing imports (`@/lib/analytics`), while re-exporting the typed taxonomy
 * from `lib/analytics/*`.
 */

import { trackEvent } from './analytics/tracker';

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
    trackEvent('sign_up' as any, { method });
  },
  signIn: (method: 'email' | 'google' | 'github') => {
    trackEvent('login' as any, { method });
  },
  signOut: () => {
    trackEvent('logout' as any);
  },
  launchWebIDE: () => {
    trackEvent('launch_web_ide' as any);
  },
  createProject: (type?: string) => {
    trackEvent('create_project' as any, { project_type: type });
  },
  apiKeyAdded: (provider: string) => {
    trackEvent('api_key_added' as any, { provider });
  },
  pageView: (pagePath: string, pageTitle?: string) => {
    trackEvent('page_view' as any, {
      page_path: pagePath,
      page_title: pageTitle,
    });
  },
};
