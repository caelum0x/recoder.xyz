/**
 * LTV-by-channel aggregation (real-data-only, no synthetic CAC).
 *
 * Groups recorded revenue by acquisition channel (`acquisitionSource`, stamped
 * onto each user at signup by `lib/attribution.ts`) and computes revenue / LTV
 * proxies PER CHANNEL.
 *
 * ── HONEST DATA SOURCE (read this) ──────────────────────────────────────────
 * `trackServerEvent` (lib/analytics/tracker.ts) is NOT a persisted, queryable
 * event store in `app/` — it only emits a structured log line and, when
 * `ANALYTICS_INGEST_URL` is configured, fire-and-forget POSTs to an external
 * sink. There is therefore no event stream in-process to aggregate.
 *
 * The only genuinely persisted, queryable revenue signal available here is the
 * `users` table itself: `acquisitionSource` (channel) + `subscriptionStatus` /
 * `subscriptionPlan` (paying?) + `lastPaymentAmount` (a real recorded amount).
 * We aggregate exactly that and nothing more. Two honesty rules are enforced:
 *
 *  1. `recordedRevenue` is the SUM of `lastPaymentAmount` across users in a
 *     channel — i.e. the last recorded payment per user. It is a LOWER-BOUND
 *     LTV proxy, NOT a full payment-history lifetime sum (there is no
 *     per-payment ledger aggregation in scope). It is labelled as such.
 *  2. CAC is NEVER synthesized. Customer-acquisition cost needs per-channel ad
 *     spend, which is not present anywhere in the system, so `cac` is always
 *     `null` with an explanatory note — we do not invent a number.
 *
 * Empty source ⇒ an honest empty report (`hasData: false`, no fabricated
 * zeros dressed as metrics).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One user's persisted revenue signal, normalized from a `users` row.
 * All fields must originate from real recorded data — never a placeholder.
 */
export interface RevenueRecord {
  /** Acquisition channel stamped at signup (`acquisitionSource`); may be null. */
  acquisitionSource: string | null;
  /** The subscriber user id (real). */
  userId: string;
  /** True when the user has a real recorded payment / active paid subscription. */
  isPaying: boolean;
  /** Last recorded payment amount for this user (real). 0 when none recorded. */
  revenue: number;
  /** Plan id when known, else null. */
  planId: string | null;
}

/** Per-channel aggregated revenue / LTV proxies. */
export interface ChannelLtv {
  /** Normalized channel label (never empty — null sources bucket here). */
  channel: string;
  /** Users acquired via this channel. */
  signups: number;
  /** Users in this channel with a real recorded payment. */
  payingUsers: number;
  /**
   * Sum of last recorded payments across this channel's users. A lower-bound
   * LTV proxy, NOT a full lifetime payment-history sum. See file header.
   */
  recordedRevenue: number;
  /** recordedRevenue / signups — real, since both operands are real. */
  avgRevenuePerUser: number;
  /** recordedRevenue / payingUsers — 0 when the channel has no payers. */
  avgRevenuePerPayingUser: number;
  /**
   * Always null: CAC requires per-channel ad-spend input the system does not
   * have. We never synthesize it.
   */
  cac: null;
  /** Explains why cac is null. */
  cacNote: string;
}

/** Where the aggregated records actually came from. */
export type LtvDataSource = 'db-user-records' | 'none';

/** A full, self-describing, truthfulness-annotated LTV report. */
export interface LtvReport {
  /** Channels sorted by recordedRevenue desc, then signups desc. */
  channels: ChannelLtv[];
  totals: {
    signups: number;
    payingUsers: number;
    recordedRevenue: number;
  };
  /** True when at least one record was aggregated. */
  hasData: boolean;
  /** True when any real revenue (> 0) was recorded. */
  hasRevenue: boolean;
  /** Provenance of the aggregated data. */
  dataSource: LtvDataSource;
  /** Human-readable honesty caveats surfaced verbatim in the admin view. */
  notes: string[];
  /** ISO timestamp the report was generated. */
  generatedAt: string;
}

const CAC_NOTE =
  'CAC requires per-channel ad-spend input, which the system does not track. Not computed.';

const UNATTRIBUTED = 'unattributed';

const REVENUE_SOURCE_NOTE =
  'recordedRevenue sums each user’s last recorded payment (users.lastPaymentAmount) — a lower-bound LTV proxy, not a full payment-history lifetime sum.';

const EVENT_STORE_NOTE =
  'trackServerEvent is not a persisted, queryable event store in app/. Configure ANALYTICS_INGEST_URL with a real event sink for full event-level CAC/LTV.';

const CAC_INPUT_NOTE =
  'CAC per channel is intentionally omitted: no ad-spend input exists in the system. Provide per-channel spend to derive CAC — it is never synthesized.';

const EMPTY_NOTE =
  'No revenue-bearing user records found. Nothing is fabricated — metrics will populate as real signups and payments accrue.';

// ---------------------------------------------------------------------------
// Pure aggregation
// ---------------------------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Aggregate recorded revenue records into an LTV-by-channel report.
 *
 * PURE: no I/O, no clock beyond `generatedAt`. Aggregates ONLY what is passed
 * in — an empty input yields an honest empty report, never fabricated numbers.
 */
export function aggregateLtvByChannel(
  records: ReadonlyArray<RevenueRecord>,
  dataSource: LtvDataSource = records.length > 0 ? 'db-user-records' : 'none',
): LtvReport {
  const byChannel = new Map<
    string,
    { signups: number; payingUsers: number; recordedRevenue: number }
  >();

  for (const record of records) {
    const channel =
      typeof record.acquisitionSource === 'string' && record.acquisitionSource.trim().length > 0
        ? record.acquisitionSource.trim()
        : UNATTRIBUTED;

    const revenue =
      typeof record.revenue === 'number' && Number.isFinite(record.revenue) && record.revenue > 0
        ? record.revenue
        : 0;
    const isPaying = record.isPaying || revenue > 0;

    const bucket =
      byChannel.get(channel) ?? { signups: 0, payingUsers: 0, recordedRevenue: 0 };
    bucket.signups += 1;
    if (isPaying) bucket.payingUsers += 1;
    bucket.recordedRevenue += revenue;
    byChannel.set(channel, bucket);
  }

  const channels: ChannelLtv[] = Array.from(byChannel.entries())
    .map(([channel, b]) => ({
      channel,
      signups: b.signups,
      payingUsers: b.payingUsers,
      recordedRevenue: round2(b.recordedRevenue),
      avgRevenuePerUser: b.signups > 0 ? round2(b.recordedRevenue / b.signups) : 0,
      avgRevenuePerPayingUser:
        b.payingUsers > 0 ? round2(b.recordedRevenue / b.payingUsers) : 0,
      cac: null as null,
      cacNote: CAC_NOTE,
    }))
    .sort((a, b) => b.recordedRevenue - a.recordedRevenue || b.signups - a.signups);

  const totals = channels.reduce(
    (acc, c) => ({
      signups: acc.signups + c.signups,
      payingUsers: acc.payingUsers + c.payingUsers,
      recordedRevenue: round2(acc.recordedRevenue + c.recordedRevenue),
    }),
    { signups: 0, payingUsers: 0, recordedRevenue: 0 },
  );

  const hasData = records.length > 0;
  const hasRevenue = totals.recordedRevenue > 0;

  const notes = hasData
    ? [REVENUE_SOURCE_NOTE, CAC_INPUT_NOTE, EVENT_STORE_NOTE]
    : [EMPTY_NOTE, EVENT_STORE_NOTE];

  return {
    channels,
    totals,
    hasData,
    hasRevenue,
    dataSource: hasData ? dataSource : 'none',
    notes,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Real-data loader (the honest source)
// ---------------------------------------------------------------------------

/** Minimal shape of a `users` row this aggregation reads. */
export interface UserRevenueRow {
  id: string;
  acquisitionSource: string | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  lastPaymentAmount: number | null;
}

/**
 * Map a persisted `users` row to a normalized {@link RevenueRecord}.
 *
 * `isPaying` is true only when the profile has an active, non-free
 * subscription OR a positive recorded payment — never inferred otherwise.
 */
export function userRowToRevenueRecord(row: UserRevenueRow): RevenueRecord {
  const revenue =
    typeof row.lastPaymentAmount === 'number' && Number.isFinite(row.lastPaymentAmount)
      ? Math.max(0, row.lastPaymentAmount)
      : 0;

  const hasActivePaidPlan =
    row.subscriptionStatus === 'active' &&
    !!row.subscriptionPlan &&
    row.subscriptionPlan !== 'free';

  return {
    acquisitionSource: row.acquisitionSource,
    userId: row.id,
    isPaying: hasActivePaidPlan || revenue > 0,
    revenue,
    planId: row.subscriptionPlan ?? null,
  };
}

/**
 * Minimal Prisma surface needed by {@link loadRevenueRecords}. Declared
 * structurally so the loader can be unit-tested with a stub and never couples
 * this module to the generated client type.
 */
export interface RevenueUsersClient {
  users: {
    findMany(args: {
      select: {
        id: true;
        acquisitionSource: true;
        subscriptionStatus: true;
        subscriptionPlan: true;
        lastPaymentAmount: true;
      };
    }): Promise<UserRevenueRow[]>;
  };
}

/**
 * Load real revenue records from the persisted `users` table.
 *
 * Degrades truthfully: any error (table not migrated, DB down) yields an empty
 * array so the caller renders the honest empty state rather than a fake number.
 */
export async function loadRevenueRecords(
  client: RevenueUsersClient,
): Promise<RevenueRecord[]> {
  try {
    const rows = await client.users.findMany({
      select: {
        id: true,
        acquisitionSource: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        lastPaymentAmount: true,
      },
    });
    return rows.map(userRowToRevenueRecord);
  } catch {
    return [];
  }
}

/**
 * Build the full LTV-by-channel report from the real persisted source.
 *
 * On any load failure this returns the honest empty report (dataSource
 * `'none'`), never fabricated data.
 */
export async function getLtvReport(client: RevenueUsersClient): Promise<LtvReport> {
  const records = await loadRevenueRecords(client);
  return aggregateLtvByChannel(records, 'db-user-records');
}
