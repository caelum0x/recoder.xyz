/**
 * getDeviceFlowRequestByUserCode must resolve a user_code by EXACT match, never a
 * substring `contains` (recoder-caau). A substring match lets a short/partial code
 * resolve to another flow whose code merely contains it — a guessable/collidable
 * device-authorization lookup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirst = vi.fn(async (..._a: unknown[]) => null);
vi.mock('@/lib/prisma', () => ({ prisma: { deviceCode: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));

import { getDeviceFlowRequestByUserCode } from '@/lib/device-flow-storage';

beforeEach(() => vi.clearAllMocks());

describe('getDeviceFlowRequestByUserCode — exact match only', () => {
  it('never queries with a substring `contains` clause on userCode', async () => {
    await getDeviceFlowRequestByUserCode('ABCD');
    const where = (findFirst.mock.calls[0]![0] as { where: { OR: Array<Record<string, unknown>> } }).where;
    const usesContains = where.OR.some(
      (c) => c.userCode != null && typeof c.userCode === 'object' && 'contains' in (c.userCode as object),
    );
    expect(usesContains).toBe(false);
    // Exact-match clauses (with/without hyphen) remain.
    expect(where.OR).toEqual(expect.arrayContaining([{ userCode: 'ABCD' }]));
  });
});
