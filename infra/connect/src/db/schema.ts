/**
 * Recoder Connect — accounts/entitlements schema (drizzle-orm, Postgres).
 *
 * Scope is deliberately narrow: this is the NEW Connect surface (accounts,
 * linked devices, Dodo entitlements, webhook idempotency), not a port of
 * third_party/t3code/infra/relay's full schema (mobile push, APNs/FCM,
 * managed-endpoint tunnels, agent-activity aggregation — those stay queued
 * for a later sync per docs/T3CODE-FORK.md's patch-queue policy). Better
 * Auth's own `user` / `session` / `account` / `verification` tables are
 * created by `better-auth`'s own migrator against this same database; this
 * file only owns the Connect-specific tables that sit beside them.
 */
import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Plan tiers Connect actually sells. Mirrors backend billing's PlanTier floor
 * but only the tiers this surface's pricing page offers (recoder.xyz/pricing):
 * free (no row needed), pro, team. `canceled` keeps the historical row instead
 * of deleting it (a lapsed subscriber must re-subscribe, not quietly keep
 * entitlement from a deleted-then-recreated row). */
export const PLAN_TIERS = ['free', 'pro', 'team'] as const;
export type ConnectPlanTier = (typeof PLAN_TIERS)[number];

export const SUBSCRIPTION_STATUSES = [
  'incomplete',
  'active',
  'past_due',
  'canceled',
  'expired',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * One row per Better-Auth user who has touched Connect (signed in, started a
 * checkout, or linked a device). `userId` is the Better Auth `user.id` — this
 * table does NOT duplicate identity, only the Connect-specific profile.
 */
export const connectAccounts = pgTable('connect_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  email: text('email').notNull(),
  dodoCustomerId: text('dodo_customer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdUnique: uniqueIndex('connect_accounts_user_id_key').on(t.userId),
  emailIdx: index('connect_accounts_email_idx').on(t.email),
  dodoCustomerIdx: index('connect_accounts_dodo_customer_idx').on(t.dodoCustomerId),
}));

/**
 * A linked desktop/device the account can push to or open a remote session
 * from. `lastSeenAt` drives staleness; `revokedAt` is set on sign-out instead
 * of deleting the row (so a revoked device's past session history survives
 * for audit).
 */
export const connectDevices = pgTable('connect_devices', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  label: text('label').notNull(),
  platform: text('platform').notNull(),
  dpopPublicKeyThumbprint: text('dpop_public_key_thumbprint'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  accountIdx: index('connect_devices_account_idx').on(t.accountId),
}));

/**
 * The durable, webhook-confirmed entitlement for an account. ONE row per
 * account (upserted on every processed webhook) — never a stub, never a
 * client-trusted claim. `currentPeriodEnd`/`cancelAtPeriodEnd` let the
 * desktop/web client compute a short grace window offline; the server copy
 * here is always the source of truth on reconnect.
 */
export const connectEntitlements = pgTable('connect_entitlements', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  plan: text('plan', { enum: PLAN_TIERS }).notNull().default('free'),
  status: text('status', { enum: SUBSCRIPTION_STATUSES }).notNull().default('active'),
  dodoSubscriptionId: text('dodo_subscription_id'),
  dodoProductId: text('dodo_product_id'),
  seats: integer('seats').notNull().default(1),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  accountIdUnique: uniqueIndex('connect_entitlements_account_id_key').on(t.accountId),
  dodoSubIdx: index('connect_entitlements_dodo_sub_idx').on(t.dodoSubscriptionId),
}));

/**
 * Webhook idempotency inbox. The Standard-Webhooks `webhook-id` header is the
 * natural key; a replay of an already-processed id is a truthful no-op, never
 * a silent double-apply. `receivedAt` alone (no retention-pruning column yet)
 * — the plan's security-review task tracks an inbox-retention policy.
 */
export const dodoWebhookEvents = pgTable('dodo_webhook_events', {
  id: text('id').primaryKey(), // the `webhook-id` header value
  type: text('type').notNull(),
  accountId: text('account_id'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  payload: text('payload').notNull(), // raw JSON, for audit/replay-debugging
}, (t) => ({
  receivedAtIdx: index('dodo_webhook_events_received_at_idx').on(t.receivedAt),
}));

/**
 * Short-lived device-link codes: the desktop generates a code and shows it to
 * the user, who claims it from an authenticated browser tab at
 * connect.recoder.xyz/link. Deliberately NOT a bearer credential — claiming
 * only creates a `connect_devices` row; it never hands back a session or
 * DPoP-bound token (minting one is queued — see infra/connect/README.md's
 * "explicitly out of scope" list). `claimedDeviceId` is set once and the
 * code becomes single-use.
 */
export const connectLinkCodes = pgTable('connect_link_codes', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
  platform: text('platform').notNull(),
  dpopPublicKeyThumbprint: text('dpop_public_key_thumbprint'),
  claimedByAccountId: text('claimed_by_account_id'),
  claimedDeviceId: text('claimed_device_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  expiresAtIdx: index('connect_link_codes_expires_at_idx').on(t.expiresAt),
}));

export const connectAccountsRelations = relations(connectAccounts, ({ many, one }) => ({
  devices: many(connectDevices),
  entitlement: one(connectEntitlements, {
    fields: [connectAccounts.id],
    references: [connectEntitlements.accountId],
  }),
}));

export const connectDevicesRelations = relations(connectDevices, ({ one }) => ({
  account: one(connectAccounts, {
    fields: [connectDevices.accountId],
    references: [connectAccounts.id],
  }),
}));
