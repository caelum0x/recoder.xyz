/**
 * Re-export Prisma-generated types for the unified database.
 *
 * Usage:
 *   import type { users, projects, sessions } from "@recoder/database/types";
 *
 * After running `prisma generate`, all model types will be available.
 * Types are organized by domain: App, PM, and Agency.
 */

export type {
  // ─── App: Auth ──────────────────────────────────────
  user,
  users,
  session,
  sessions,
  account,
  accounts,
  verification,
  verifications,

  // ─── App: Projects ──────────────────────────────────
  projects,
  templates,
  agents,
  ai_generated_projects,

  // ─── App: Billing ───────────────────────────────────
  subscriptions,
  subscription_plans,
  invoices,
  payment_methods,

  // ─── App: Usage ─────────────────────────────────────
  usage_records,
  usage_events,

  // ─── App: API Keys ──────────────────────────────────
  api_keys,
  cli_sessions,

  // ─── PM: Core ───────────────────────────────────────
  Organization,
  Feature,
  FeatureStatus,
  Product,
  Group,
  Initiative,

  // ─── PM: Feedback ───────────────────────────────────
  Feedback,
  FeedbackAnalysis,
  FeedbackUser,
  FeedbackOrganization,
  FeedbackFeatureLink,

  // ─── PM: Changelog & Portal ─────────────────────────
  Changelog,
  Portal,
  PortalFeature,
  PortalFeatureVote,
  Release,

  // ─── PM: AI ─────────────────────────────────────────
  AiInsight,
  AiJob,
  Proposal,

  // ─── Agency: Core ───────────────────────────────────
  agency_teams,
  agency_users,
  agency_workspaces,
  agency_apps,
  agency_tasks,

  // ─── Agency: Clients ────────────────────────────────
  agency_clients,
  agency_projects,
  agency_invoices,
  agency_quotes,
  agency_deliverables,

  // ─── Prisma client type ─────────────────────────────
  Prisma,
} from "@prisma/client";
