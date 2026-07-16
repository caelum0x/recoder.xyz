/**
 * Analytics barrel export.
 *
 * Import everything from `@/lib/analytics`:
 *
 *   import { trackEvent, trackServerEvent, AnalyticsEvents } from '@/lib/analytics';
 */

export { AnalyticsEvents } from './events';
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
} from './events';

export { trackEvent, trackServerEvent } from './tracker';
