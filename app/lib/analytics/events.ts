/**
 * Product Analytics Event Taxonomy
 *
 * Single source of truth for every tracked product event.
 * Events are grouped by funnel stage so dashboards can be built
 * directly from these constants.
 */

// ---------------------------------------------------------------------------
// Event names
// ---------------------------------------------------------------------------

export const AnalyticsEvents = {
  // ---- Acquisition / marketing ----
  CTA_CLICKED: 'cta_clicked',

  // ---- Lead capture (top of funnel, pre-signup) ----
  LEAD_CAPTURE_SUBMITTED: 'lead_capture_submitted',
  LEAD_CAPTURE_SUCCEEDED: 'lead_capture_succeeded',
  LEAD_CAPTURE_FAILED: 'lead_capture_failed',
  LEAD_CONVERTED_TO_SIGNUP: 'lead_converted_to_signup',

  // ---- Auth funnel ----
  SIGNUP_STARTED: 'signup_started',
  LOGIN_STARTED: 'login_started',
  SIGNUP_COMPLETED: 'signup_completed',
  LOGIN_COMPLETED: 'login_completed',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',

  // ---- Onboarding ----
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_VIEWED: 'onboarding_step_viewed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  API_KEY_SAVED: 'api_key_saved',

  // ---- Activation (first-time milestones) ----
  DASHBOARD_VIEWED: 'dashboard_viewed',
  PROJECTS_VIEWED: 'projects_viewed',
  FIRST_PROJECT_CREATED: 'first_project_created',
  FIRST_AGENT_RUN: 'first_agent_run',
  FIRST_CLI_SESSION: 'first_cli_session',

  // ---- Engagement ----
  PROJECT_CREATED: 'project_created',
  AGENT_RUN_STARTED: 'agent_run_started',
  CLI_SESSION_STARTED: 'cli_session_started',
  FILE_CREATED: 'file_created',

  // ---- Billing ----
  PRICING_PAGE_VIEWED: 'pricing_page_viewed',
  CHECKOUT_STARTED: 'checkout_started',
  SUBSCRIPTION_CREATED: 'subscription_created',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  UPGRADE_PROMPTED: 'upgrade_prompted',

  // ---- Feature usage ----
  PLATFORM_PAGE_VIEWED: 'platform_page_viewed',
  BLOG_POST_VIEWED: 'blog_post_viewed',
  DOCS_PAGE_VIEWED: 'docs_page_viewed',
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

// ---------------------------------------------------------------------------
// Per-event property schemas
// ---------------------------------------------------------------------------

/** Properties common to every event. All fields are optional at the call-site
 *  because the tracker will inject sensible defaults where possible. */
export interface BaseEventProperties {
  /** Authenticated user ID (server-side will always have this). */
  userId?: string;
  /** Current subscription plan at the time of the event. */
  plan?: string;
  /** Free-form source indicator (e.g. "email", "github", "cli"). */
  source?: string;
  /** ISO-8601 timestamp; auto-filled by the tracker when omitted. */
  timestamp?: string;
}

export interface CTAEventProperties extends BaseEventProperties {
  location?: string;
  ctaLabel?: string;
  destination?: string;
}

/** Lead-capture funnel properties (newsletter / pre-signup email capture). */
export interface LeadCaptureEventProperties extends BaseEventProperties {
  /** Where the lead form was rendered, e.g. "homepage_hero_lead_capture". */
  leadSource?: string;
  /** True when a previously-unsubscribed lead was reactivated. */
  reactivated?: boolean;
  /** True when the lead email already matched a registered user at capture time. */
  matchedExistingUser?: boolean;
  /** Signup method (LEAD_CONVERTED_TO_SIGNUP only). */
  method?: 'email' | 'google' | 'github' | 'cli';
  /** Failure reason (LEAD_CAPTURE_FAILED only). */
  reason?: string;
}

/** Auth funnel properties. */
export interface AuthEventProperties extends BaseEventProperties {
  method?: 'email' | 'google' | 'github' | 'cli';
  /** Why the login failed (only for LOGIN_FAILED). */
  reason?: string;
}

/** Onboarding properties. */
export interface OnboardingEventProperties extends BaseEventProperties {
  /** Which step the user was on when they completed / skipped. */
  step?: string;
  /** Total time spent in onboarding (ms). */
  durationMs?: number;
}

/** Activation milestone properties. */
export interface ActivationEventProperties extends BaseEventProperties {
  projectType?: string;
  agentId?: string;
}

/** Engagement properties. */
export interface EngagementEventProperties extends BaseEventProperties {
  projectId?: string;
  agentId?: string;
  fileType?: string;
  deviceType?: string;
}

/** Billing properties. */
export interface BillingEventProperties extends BaseEventProperties {
  planId?: string;
  priceAmount?: number;
  currency?: string;
  provider?: 'paddle' | 'dodo' | 'stripe';
  /** The prompt or surface that triggered an upgrade CTA. */
  promptSurface?: string;
}

/** Feature usage / page-view properties. */
export interface PageViewEventProperties extends BaseEventProperties {
  pagePath?: string;
  pageTitle?: string;
  platform?: string;
  locale?: string;
}

// ---------------------------------------------------------------------------
// Discriminated union mapping events -> their property types
// ---------------------------------------------------------------------------

export type EventPropertiesMap = {
  // Acquisition
  [AnalyticsEvents.CTA_CLICKED]: CTAEventProperties;

  // Lead capture
  [AnalyticsEvents.LEAD_CAPTURE_SUBMITTED]: LeadCaptureEventProperties;
  [AnalyticsEvents.LEAD_CAPTURE_SUCCEEDED]: LeadCaptureEventProperties;
  [AnalyticsEvents.LEAD_CAPTURE_FAILED]: LeadCaptureEventProperties;
  [AnalyticsEvents.LEAD_CONVERTED_TO_SIGNUP]: LeadCaptureEventProperties;

  // Auth
  [AnalyticsEvents.SIGNUP_STARTED]: AuthEventProperties;
  [AnalyticsEvents.LOGIN_STARTED]: AuthEventProperties;
  [AnalyticsEvents.SIGNUP_COMPLETED]: AuthEventProperties;
  [AnalyticsEvents.LOGIN_COMPLETED]: AuthEventProperties;
  [AnalyticsEvents.LOGIN_FAILED]: AuthEventProperties;
  [AnalyticsEvents.LOGOUT]: BaseEventProperties;

  // Onboarding
  [AnalyticsEvents.ONBOARDING_STARTED]: OnboardingEventProperties;
  [AnalyticsEvents.ONBOARDING_STEP_VIEWED]: OnboardingEventProperties;
  [AnalyticsEvents.ONBOARDING_COMPLETED]: OnboardingEventProperties;
  [AnalyticsEvents.ONBOARDING_SKIPPED]: OnboardingEventProperties;
  [AnalyticsEvents.API_KEY_SAVED]: OnboardingEventProperties;

  // Activation
  [AnalyticsEvents.DASHBOARD_VIEWED]: ActivationEventProperties;
  [AnalyticsEvents.PROJECTS_VIEWED]: ActivationEventProperties;
  [AnalyticsEvents.FIRST_PROJECT_CREATED]: ActivationEventProperties;
  [AnalyticsEvents.FIRST_AGENT_RUN]: ActivationEventProperties;
  [AnalyticsEvents.FIRST_CLI_SESSION]: ActivationEventProperties;

  // Engagement
  [AnalyticsEvents.PROJECT_CREATED]: EngagementEventProperties;
  [AnalyticsEvents.AGENT_RUN_STARTED]: EngagementEventProperties;
  [AnalyticsEvents.CLI_SESSION_STARTED]: EngagementEventProperties;
  [AnalyticsEvents.FILE_CREATED]: EngagementEventProperties;

  // Billing
  [AnalyticsEvents.PRICING_PAGE_VIEWED]: BillingEventProperties;
  [AnalyticsEvents.CHECKOUT_STARTED]: BillingEventProperties;
  [AnalyticsEvents.SUBSCRIPTION_CREATED]: BillingEventProperties;
  [AnalyticsEvents.SUBSCRIPTION_CANCELLED]: BillingEventProperties;
  [AnalyticsEvents.UPGRADE_PROMPTED]: BillingEventProperties;

  // Feature usage
  [AnalyticsEvents.PLATFORM_PAGE_VIEWED]: PageViewEventProperties;
  [AnalyticsEvents.BLOG_POST_VIEWED]: PageViewEventProperties;
  [AnalyticsEvents.DOCS_PAGE_VIEWED]: PageViewEventProperties;
};
