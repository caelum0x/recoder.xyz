import { describe, expect, it } from 'vitest';
import {
  claimLinkCode,
  generateLinkCode,
  getLinkStatus,
  listDevices,
  pruneExpiredLinkCodes,
  revokeDevice,
  startLinkCode,
} from '../src/auth/link-codes.js';
import { createFakeDb } from './fake-db.js';

describe('generateLinkCode', () => {
  it('produces an 8-character code from an unambiguous alphabet (no 0/O/1/I)', () => {
    const code = generateLinkCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[01OI]/);
  });

  it('is deterministic for the same random bytes', () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 1, 2, 3, 4]);
    expect(generateLinkCode(bytes)).toBe(generateLinkCode(bytes));
  });
});

describe('startLinkCode', () => {
  it('inserts a row with a 10-minute TTL and returns the code + expiry', async () => {
    const fake = createFakeDb([]);
    const now = new Date('2026-01-01T00:00:00Z');
    const result = await startLinkCode(fake.db, { label: 'MacBook Pro', platform: 'macos' }, now);
    expect(result.code).toHaveLength(8);
    expect(result.expiresAt.getTime()).toBe(now.getTime() + 10 * 60 * 1000);
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0]).toMatchObject({ label: 'MacBook Pro', platform: 'macos' });
  });
});

describe('getLinkStatus', () => {
  it('reports not_found when the code does not exist', async () => {
    const fake = createFakeDb([]);
    expect(await getLinkStatus(fake.db, 'MISSING1')).toEqual({ state: 'not_found' });
  });

  it('reports claimed with the device id once claimedDeviceId is set', async () => {
    const fake = createFakeDb([{ claimedDeviceId: 'dev_1', expiresAt: new Date(Date.now() + 60_000) }]);
    expect(await getLinkStatus(fake.db, 'ABCD1234')).toEqual({ state: 'claimed', deviceId: 'dev_1' });
  });

  it('reports expired once past expiresAt, pending otherwise', async () => {
    const expired = createFakeDb([{ claimedDeviceId: null, expiresAt: new Date(Date.now() - 1000) }]);
    expect(await getLinkStatus(expired.db, 'ABCD1234')).toEqual({ state: 'expired' });
    const pending = createFakeDb([{ claimedDeviceId: null, expiresAt: new Date(Date.now() + 60_000) }]);
    expect(await getLinkStatus(pending.db, 'ABCD1234')).toEqual({ state: 'pending' });
  });
});

describe('claimLinkCode', () => {
  it('fails with not_found for a nonexistent code', async () => {
    const fake = createFakeDb([]);
    expect(await claimLinkCode(fake.db, 'MISSING1', 'acct_1')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('fails with already_claimed when claimedDeviceId is already set', async () => {
    const fake = createFakeDb([{ claimedDeviceId: 'dev_existing', expiresAt: new Date(Date.now() + 60_000) }]);
    expect(await claimLinkCode(fake.db, 'ABCD1234', 'acct_1')).toEqual({ ok: false, reason: 'already_claimed' });
  });

  it('fails with expired for a lapsed code', async () => {
    const fake = createFakeDb([{ claimedDeviceId: null, expiresAt: new Date(Date.now() - 1000) }]);
    expect(await claimLinkCode(fake.db, 'ABCD1234', 'acct_1')).toEqual({ ok: false, reason: 'expired' });
  });

  it('inserts a device row and marks the code claimed for a valid, unclaimed code', async () => {
    const fake = createFakeDb([
      { claimedDeviceId: null, expiresAt: new Date(Date.now() + 60_000), label: 'MacBook', platform: 'macos', dpopPublicKeyThumbprint: null },
    ]);
    const result = await claimLinkCode(fake.db, 'ABCD1234', 'acct_1');
    expect(result.ok).toBe(true);
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0]).toMatchObject({ accountId: 'acct_1', label: 'MacBook', platform: 'macos' });
    expect(fake.updated).toHaveLength(1);
    expect(fake.updated[0]).toMatchObject({ claimedByAccountId: 'acct_1' });
  });
});

describe('listDevices', () => {
  it('maps rows to the DeviceSummary shape', async () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const fake = createFakeDb([{ id: 'd1', label: 'MacBook', platform: 'macos', lastSeenAt: null, revokedAt: null, createdAt: created }]);
    const devices = await listDevices(fake.db, 'acct_1');
    expect(devices).toEqual([{ id: 'd1', label: 'MacBook', platform: 'macos', lastSeenAt: null, revokedAt: null, createdAt: created }]);
  });

  it('returns an empty list for an account with no devices', async () => {
    const fake = createFakeDb([]);
    expect(await listDevices(fake.db, 'acct_1')).toEqual([]);
  });
});

describe('revokeDevice', () => {
  it('returns true when a row was updated', async () => {
    const fake = createFakeDb([]);
    fake.nextUpdateRowCount = 1;
    expect(await revokeDevice(fake.db, 'acct_1', 'dev_1')).toBe(true);
    expect(fake.updated).toHaveLength(1);
    expect(fake.updated[0]).toHaveProperty('revokedAt');
  });

  it('returns false when no row matched (wrong account or unknown device)', async () => {
    const fake = createFakeDb([]);
    fake.nextUpdateRowCount = 0;
    expect(await revokeDevice(fake.db, 'acct_1', 'dev_other_account')).toBe(false);
  });
});

describe('pruneExpiredLinkCodes', () => {
  it('returns the number of deleted rows', async () => {
    const fake = createFakeDb([]);
    fake.nextDeleteRowCount = 3;
    expect(await pruneExpiredLinkCodes(fake.db)).toBe(3);
  });

  it('returns 0 when nothing was expired', async () => {
    const fake = createFakeDb([]);
    expect(await pruneExpiredLinkCodes(fake.db)).toBe(0);
  });
});
