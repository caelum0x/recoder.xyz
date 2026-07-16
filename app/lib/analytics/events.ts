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
  // ---- Auth funnel ----
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  LOGIN_COMPLETED: 'login_completed',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',

  // ---- Onboarding ----
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_SKIPPED: 'onboarding_skipped',

  // ---- Activation (first-time milestones) ----
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
  // Auth
  [AnalyticsEvents.SIGNUP_STARTED]: AuthEventProperties;
  [AnalyticsEvents.SIGNUP_COMPLETED]: AuthEventProperties;
  [AnalyticsEvents.LOGIN_COMPLETED]: AuthEventProperties;
  [AnalyticsEvents.LOGIN_FAILED]: AuthEventProperties;
  [AnalyticsEvents.LOGOUT]: BaseEventProperties;

  // Onboarding
  [AnalyticsEvents.ONBOARDING_STARTED]: OnboardingEventProperties;
  [AnalyticsEvents.ONBOARDING_COMPLETED]: OnboardingEventProperties;
  [AnalyticsEvents.ONBOARDING_SKIPPED]: OnboardingEventProperties;

  // Activation
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
