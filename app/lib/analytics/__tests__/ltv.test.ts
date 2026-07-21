import { describe, it, expect } from 'vitest';
import {
  aggregateLtvByChannel,
  userRowToRevenueRecord,
  loadRevenueRecords,
  getLtvReport,
  type RevenueRecord,
  type UserRevenueRow,
  type RevenueUsersClient,
} from '../ltv';

const rec = (over: Partial<RevenueRecord> = {}): RevenueRecord => ({
  acquisitionSource: 'direct',
  userId: 'u1',
  isPaying: false,
  revenue: 0,
  planId: null,
  ...over,
});

describe('aggregateLtvByChannel — grouping', () => {
  it('groups signups + revenue by acquisitionSource', () => {
    const report = aggregateLtvByChannel([
      rec({ userId: 'a', acquisitionSource: 'utm:google', isPaying: true, revenue: 20 }),
      rec({ userId: 'b', acquisitionSource: 'utm:google', isPaying: true, revenue: 30 }),
      rec({ userId: 'c', acquisitionSource: 'referral', isPaying: true, revenue: 10 }),
      rec({ userId: 'd', acquisitionSource: 'referral', isPaying: false, revenue: 0 }),
    ]);

    expect(report.channels).toHaveLength(2);

    const google = report.channels.find((c) => c.channel === 'utm:google')!;
    expect(google.signups).toBe(2);
    expect(google.payingUsers).toBe(2);
    expect(google.recordedRevenue).toBe(50);
    expect(google.avgRevenuePerUser).toBe(25);
    expect(google.avgRevenuePerPayingUser).toBe(25);

    const referral = report.channels.find((c) => c.channel === 'referral')!;
    expect(referral.signups).toBe(2);
    expect(referral.payingUsers).toBe(1);
    expect(referral.recordedRevenue).toBe(10);
    expect(referral.avgRevenuePerUser).toBe(5);
    expect(referral.avgRevenuePerPayingUser).toBe(10);
  });

  it('sorts channels by recordedRevenue desc', () => {
    const report = aggregateLtvByChannel([
      rec({ userId: 'a', acquisitionSource: 'low', revenue: 5, isPaying: true }),
      rec({ userId: 'b', acquisitionSource: 'high', revenue: 100, isPaying: true }),
    ]);
    expect(report.channels.map((c) => c.channel)).toEqual(['high', 'low']);
  });

  it('buckets null/empty acquisitionSource as "unattributed"', () => {
    const report = aggregateLtvByChannel([
      rec({ userId: 'a', acquisitionSource: null, revenue: 5, isPaying: true }),
      rec({ userId: 'b', acquisitionSource: '   ', revenue: 5, isPaying: true }),
    ]);
    expect(report.channels).toHaveLength(1);
    expect(report.channels[0].channel).toBe('unattributed');
    expect(report.channels[0].signups).toBe(2);
  });

  it('rolls up correct totals', () => {
    const report = aggregateLtvByChannel([
      rec({ userId: 'a', acquisitionSource: 'x', revenue: 20, isPaying: true }),
      rec({ userId: 'b', acquisitionSource: 'y', revenue: 10, isPaying: true }),
      rec({ userId: 'c', acquisitionSource: 'y', revenue: 0, isPaying: false }),
    ]);
    expect(report.totals).toEqual({ signups: 3, payingUsers: 2, recordedRevenue: 30 });
    expect(report.hasData).toBe(true);
    expect(report.hasRevenue).toBe(true);
    expect(report.dataSource).toBe('db-user-records');
  });
});

describe('aggregateLtvByChannel — truthfulness', () => {
  it('NEVER synthesizes CAC (always null with a note)', () => {
    const report = aggregateLtvByChannel([
      rec({ userId: 'a', acquisitionSource: 'x', revenue: 20, isPaying: true }),
    ]);
    for (const c of report.channels) {
      expect(c.cac).toBeNull();
      expect(c.cacNote).toMatch(/ad-spend/i);
    }
  });

  it('empty source ⇒ honest empty state (no fabricated numbers)', () => {
    const report = aggregateLtvByChannel([]);
    expect(report.channels).toEqual([]);
    expect(report.totals).toEqual({ signups: 0, payingUsers: 0, recordedRevenue: 0 });
    expect(report.hasData).toBe(false);
    expect(report.hasRevenue).toBe(false);
    expect(report.dataSource).toBe('none');
    expect(report.notes.join(' ')).toMatch(/nothing is fabricated/i);
  });

  it('records with zero revenue count as signups but produce no fake revenue', () => {
    const report = aggregateLtvByChannel([
      rec({ userId: 'a', acquisitionSource: 'x', revenue: 0, isPaying: false }),
      rec({ userId: 'b', acquisitionSource: 'x', revenue: 0, isPaying: false }),
    ]);
    expect(report.hasData).toBe(true);
    expect(report.hasRevenue).toBe(false);
    expect(report.channels[0].recordedRevenue).toBe(0);
    expect(report.channels[0].payingUsers).toBe(0);
    expect(report.channels[0].avgRevenuePerPayingUser).toBe(0);
  });

  it('treats a positive recorded payment as paying even if isPaying was false', () => {
    const report = aggregateLtvByChannel([
      rec({ userId: 'a', acquisitionSource: 'x', revenue: 12, isPaying: false }),
    ]);
    expect(report.channels[0].payingUsers).toBe(1);
  });

  it('ignores negative/non-finite revenue rather than trusting it', () => {
    const report = aggregateLtvByChannel([
      rec({ userId: 'a', acquisitionSource: 'x', revenue: -5, isPaying: true }),
      rec({ userId: 'b', acquisitionSource: 'x', revenue: Number.NaN, isPaying: true }),
    ]);
    expect(report.channels[0].recordedRevenue).toBe(0);
  });
});

describe('userRowToRevenueRecord', () => {
  const row = (over: Partial<UserRevenueRow> = {}): UserRevenueRow => ({
    id: 'u1',
    acquisitionSource: 'utm:google',
    subscriptionStatus: null,
    subscriptionPlan: null,
    lastPaymentAmount: null,
    ...over,
  });

  it('maps an active non-free plan to a paying record', () => {
    const r = userRowToRevenueRecord(
      row({ subscriptionStatus: 'active', subscriptionPlan: 'pro', lastPaymentAmount: 20 }),
    );
    expect(r.isPaying).toBe(true);
    expect(r.revenue).toBe(20);
    expect(r.planId).toBe('pro');
  });

  it('treats an active FREE plan with no payment as non-paying, zero revenue', () => {
    const r = userRowToRevenueRecord(
      row({ subscriptionStatus: 'active', subscriptionPlan: 'free', lastPaymentAmount: null }),
    );
    expect(r.isPaying).toBe(false);
    expect(r.revenue).toBe(0);
  });

  it('clamps a negative recorded amount to 0', () => {
    const r = userRowToRevenueRecord(row({ lastPaymentAmount: -10 }));
    expect(r.revenue).toBe(0);
  });
});

describe('loadRevenueRecords / getLtvReport — real-source loader', () => {
  const stubClient = (rows: UserRevenueRow[] | Error): RevenueUsersClient => ({
    users: {
      findMany: async () => {
        if (rows instanceof Error) throw rows;
        return rows;
      },
    },
  });

  it('maps persisted rows into revenue records', async () => {
    const records = await loadRevenueRecords(
      stubClient([
        {
          id: 'u1',
          acquisitionSource: 'utm:google',
          subscriptionStatus: 'active',
          subscriptionPlan: 'pro',
          lastPaymentAmount: 20,
        },
      ]),
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ userId: 'u1', isPaying: true, revenue: 20 });
  });

  it('degrades to empty (honest) when the DB query throws', async () => {
    const records = await loadRevenueRecords(stubClient(new Error('db down')));
    expect(records).toEqual([]);

    const report = await getLtvReport(stubClient(new Error('db down')));
    expect(report.hasData).toBe(false);
    expect(report.dataSource).toBe('none');
    expect(report.channels).toEqual([]);
  });

  it('getLtvReport builds a grouped report from real rows', async () => {
    const report = await getLtvReport(
      stubClient([
        {
          id: 'u1',
          acquisitionSource: 'utm:google',
          subscriptionStatus: 'active',
          subscriptionPlan: 'pro',
          lastPaymentAmount: 20,
        },
        {
          id: 'u2',
          acquisitionSource: 'utm:google',
          subscriptionStatus: 'active',
          subscriptionPlan: 'free',
          lastPaymentAmount: null,
        },
      ]),
    );
    expect(report.dataSource).toBe('db-user-records');
    expect(report.channels).toHaveLength(1);
    expect(report.channels[0].signups).toBe(2);
    expect(report.channels[0].payingUsers).toBe(1);
    expect(report.channels[0].recordedRevenue).toBe(20);
  });
});
