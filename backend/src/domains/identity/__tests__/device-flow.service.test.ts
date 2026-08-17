import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { DeviceFlowServiceImpl, normalizeUserCode } from '../device-flow.service.js';
import type { DeviceGrantStore, NewDeviceGrantRecord } from '../ports/device-flow.port.js';
import type { DeviceGrant } from '../types.js';
import type { IdentityConfig } from '../config.js';
import type { MintApiKeyParams, MintedApiKey } from '../ports/api-key.port.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

const baseConfig: IdentityConfig = {
  betterAuthSecretPresent: true,
  authDatabaseUrl: 'postgres://x',
  cookieDomain: '.recoder.xyz',
  strictAuth: false,
  internalServiceKey: 'k',
  internalServiceKeyPresent: true,
  isProduction: false,
  deviceCodeTtlSeconds: 900,
  devicePollIntervalSeconds: 5,
  apiKeyDefaultTtlDays: null,
  apiKeyPrefixLength: 12,
};

const noopLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as never;

/** A minimal in-memory {@link DeviceGrantStore} that mirrors the SQL semantics. */
class MemoryGrantStore implements DeviceGrantStore {
  readonly rows = new Map<string, DeviceGrant>();
  private seq = 0;

  async create(record: NewDeviceGrantRecord): Promise<DeviceGrant> {
    const grant: DeviceGrant = {
      id: record.id,
      deviceCodeHash: record.deviceCodeHash,
      userCode: record.userCode,
      userId: null,
      status: 'pending',
      scopes: record.scopes,
      clientId: record.clientId,
      intervalSeconds: record.intervalSeconds,
      lastPolledAt: null,
      approvedAt: null,
      expiresAt: record.expiresAt,
      createdAt: new Date(Date.now() + this.seq++), // stable ordering
    };
    this.rows.set(grant.id, grant);
    return grant;
  }

  async findByDeviceCodeHash(hash: string): Promise<DeviceGrant | null> {
    const found = [...this.rows.values()]
      .filter((g) => g.deviceCodeHash === hash)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return found ?? null;
  }

  async findByUserCode(userCode: string): Promise<DeviceGrant | null> {
    return [...this.rows.values()].find((g) => g.userCode === userCode) ?? null;
  }

  async approve(id: string, userId: string): Promise<boolean> {
    const g = this.rows.get(id);
    if (!g || g.status !== 'pending' || g.expiresAt.getTime() <= Date.now()) return false;
    this.rows.set(id, { ...g, status: 'approved', userId, approvedAt: new Date() });
    return true;
  }

  async deny(id: string, userId: string): Promise<boolean> {
    const g = this.rows.get(id);
    if (!g || g.status !== 'pending' || g.expiresAt.getTime() <= Date.now()) return false;
    this.rows.set(id, { ...g, status: 'denied', userId, approvedAt: new Date() });
    return true;
  }

  async consume(id: string): Promise<boolean> {
    const g = this.rows.get(id);
    if (!g || g.status !== 'approved') return false;
    this.rows.set(id, { ...g, status: 'consumed' });
    return true;
  }

  async touchPolled(id: string): Promise<void> {
    const g = this.rows.get(id);
    if (g) this.rows.set(id, { ...g, lastPolledAt: new Date(this.clockNow()) });
  }

  async expireStale(now: Date = new Date()): Promise<number> {
    let count = 0;
    for (const [id, g] of this.rows) {
      if (g.expiresAt.getTime() <= now.getTime() && (g.status === 'pending' || g.status === 'approved')) {
        this.rows.set(id, { ...g, status: 'expired' });
        count += 1;
      }
    }
    return count;
  }

  // Allow tests to align touch timestamps with the injected clock.
  clockNow: () => number = () => Date.now();
}

function keyIssuer(): { mint: (p: MintApiKeyParams) => Promise<MintedApiKey> } {
  return {
    mint: vi.fn(async (p: MintApiKeyParams): Promise<MintedApiKey> => ({
      rawKey: `sk_test_${p.userId}`,
      record: {
        id: 'k1',
        userId: p.userId,
        name: p.name,
        keyPrefix: 'sk_test_',
        keyHash: 'h',
        scopes: p.scopes ?? [],
        createdAt: new Date(),
      },
    })),
  };
}

function build(opts?: {
  store?: MemoryGrantStore;
  now?: () => Date;
  withIssuer?: boolean;
}): { svc: DeviceFlowServiceImpl; store: MemoryGrantStore } {
  const store = opts?.store ?? new MemoryGrantStore();
  const now = opts?.now ?? (() => new Date());
  store.clockNow = () => now().getTime();
  const svc = new DeviceFlowServiceImpl({
    store,
    config: baseConfig,
    logger: noopLogger,
    verificationUriBase: 'https://recoder.xyz/activate',
    now,
    ...(opts?.withIssuer === false ? {} : { keyIssuer: keyIssuer() }),
  });
  return { svc, store };
}

describe('DeviceFlowService — RFC-8628 CLI device flow', () => {
  it('issues a grant with a device_code, a WDJB-MJHT-shaped user_code, and a verification URI', async () => {
    const { svc, store } = build();
    const grant = await svc.requestGrant({ clientId: 'recoder-code', scopes: ['read', 'write'] });

    expect(grant.deviceCode).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(grant.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(grant.verificationUri).toBe('https://recoder.xyz/activate');
    expect(grant.verificationUriComplete).toContain(encodeURIComponent(grant.userCode));
    expect(grant.expiresInSeconds).toBe(900);
    expect(grant.intervalSeconds).toBe(5);

    // Raw device code is NEVER stored — only its sha256.
    const stored = [...store.rows.values()][0]!;
    expect(stored.deviceCodeHash).toBe(sha256(grant.deviceCode));
    expect(JSON.stringify(store.rows)).not.toContain(grant.deviceCode);
    expect(stored.status).toBe('pending');
  });

  it('rejects a grant request with no client_id', async () => {
    const { svc } = build();
    await expect(svc.requestGrant({ clientId: '   ' })).rejects.toMatchObject({ code: 'MISSING_REQUIRED_FIELD' });
  });

  it('polls authorization_pending, then approved, then exchanges once', async () => {
    const { svc } = build();
    const grant = await svc.requestGrant({ clientId: 'cli', scopes: ['read'] });

    // Pending before approval.
    expect(await svc.pollStatus(grant.deviceCode)).toEqual({ status: 'authorization_pending' });

    // Approve binds the user.
    expect(await svc.approve(grant.userCode, 'user-42')).toBe(true);

    const approved = await svc.pollStatus(grant.deviceCode);
    expect(approved.status).toBe('approved');

    // Exchange mints an sk_ key bound to the approving user.
    const result = await svc.exchange(grant.deviceCode);
    expect(result).toEqual({ rawKey: 'sk_test_user-42', userId: 'user-42', scopes: ['read'] });

    // Single-use: a second exchange yields nothing (grant consumed).
    expect(await svc.exchange(grant.deviceCode)).toBeNull();
    // And polling a consumed grant reads as expired.
    expect((await svc.pollStatus(grant.deviceCode)).status).toBe('expired_token');
  });

  it('deny is a REAL transition: poll returns access_denied and a later approve fails (recoder-4d8i #9)', async () => {
    const { svc } = build();
    const grant = await svc.requestGrant({ clientId: 'cli', scopes: ['read'] });

    // Deny a pending grant → true (it actually transitioned).
    expect(await svc.deny(grant.userCode, 'user-9')).toBe(true);

    // The CLI now polls access_denied (terminal) instead of pending-forever.
    expect((await svc.pollStatus(grant.deviceCode)).status).toBe('access_denied');

    // A denied grant can no longer be approved, and exchange yields nothing.
    expect(await svc.approve(grant.userCode, 'user-42')).toBe(false);
    expect(await svc.exchange(grant.deviceCode)).toBeNull();

    // Denying again (no longer pending) is a truthful false, not a fake success.
    expect(await svc.deny(grant.userCode, 'user-9')).toBe(false);
  });

  it('enforces the polling interval (slow_down) on a too-fast second poll', async () => {
    let t = 1_000_000;
    const now = (): Date => new Date(t);
    const { svc } = build({ now });
    const grant = await svc.requestGrant({ clientId: 'cli' });

    expect((await svc.pollStatus(grant.deviceCode)).status).toBe('authorization_pending');
    // Poll again 2s later — inside the 5s interval → slow_down.
    t += 2_000;
    expect(await svc.pollStatus(grant.deviceCode)).toEqual({ status: 'slow_down', intervalSeconds: 5 });
    // Past the interval → pending again.
    t += 4_000;
    expect((await svc.pollStatus(grant.deviceCode)).status).toBe('authorization_pending');
  });

  it('reports expired_token once the grant lifetime elapses', async () => {
    let t = 5_000_000;
    const now = (): Date => new Date(t);
    const { svc, store } = build({ now });
    const grant = await svc.requestGrant({ clientId: 'cli' });

    t += 901 * 1000; // just past the 900s TTL
    expect((await svc.pollStatus(grant.deviceCode)).status).toBe('expired_token');
    // The row was flipped to expired (truthful state).
    expect([...store.rows.values()][0]!.status).toBe('expired');

    // Approval and exchange both refuse an expired grant.
    expect(await svc.approve(grant.userCode, 'u')).toBe(false);
    expect(await svc.exchange(grant.deviceCode)).toBeNull();
  });

  it('degrades exchange to SERVICE_UNAVAILABLE when no key issuer is wired', async () => {
    const { svc } = build({ withIssuer: false });
    const grant = await svc.requestGrant({ clientId: 'cli' });
    await svc.approve(grant.userCode, 'u');
    await expect(svc.exchange(grant.deviceCode)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('serves as a DeviceTokenValidator: approved grant → device principal, else null', async () => {
    const { svc } = build();
    const grant = await svc.requestGrant({ clientId: 'cli', scopes: ['read'] });

    // Not yet approved → null.
    expect(await svc.validate(grant.deviceCode)).toBeNull();

    await svc.approve(grant.userCode, 'user-7');
    expect(await svc.validate(grant.deviceCode)).toEqual({ userId: 'user-7', scopes: ['read'] });

    // Unknown token → null.
    expect(await svc.validate('not-a-real-device-code')).toBeNull();
  });

  it('normalizeUserCode uppercases, strips separators, and re-groups (or rejects bad length)', () => {
    expect(normalizeUserCode('wdjb-mjht')).toBe('WDJB-MJHT');
    expect(normalizeUserCode('wdjbmjht')).toBe('WDJB-MJHT');
    expect(normalizeUserCode('  wd jb mj ht ')).toBe('WDJB-MJHT');
    expect(normalizeUserCode('short')).toBe('');
  });

  it('approve only binds a pending grant and is a single atomic transition', async () => {
    const { svc } = build();
    const grant = await svc.requestGrant({ clientId: 'cli' });
    expect(await svc.approve(grant.userCode, 'first')).toBe(true);
    // A second approval (already approved) is a no-op.
    expect(await svc.approve(grant.userCode, 'second')).toBe(false);
    const approved = await svc.pollStatus(grant.deviceCode);
    expect(approved.status === 'approved' && approved.grant.userId).toBe('first');
  });
});

describe('DeviceFlowService — privileged-scope escalation guard (recoder-kuja)', () => {
  it('STRIPS privileged scopes (admin/internal) from a requested device grant — never persisted', async () => {
    const { svc, store } = build();
    const grant = await svc.requestGrant({ clientId: 'attacker', scopes: ['read', 'admin', 'internal', 'write'] });
    const stored = await store.findByDeviceCodeHash(sha256(grant.deviceCode));
    expect(stored?.scopes).toEqual(['read', 'write']); // admin/internal dropped at the source
  });

  it('validate() NEVER confers admin/internal to a device principal (defense in depth)', async () => {
    const { svc, store } = build();
    const grant = await svc.requestGrant({ clientId: 'attacker', scopes: ['read', 'admin'] });
    const stored = await store.findByDeviceCodeHash(sha256(grant.deviceCode));
    await svc.approve(stored!.userCode, 'attacker-user');
    const validation = await svc.validate(grant.deviceCode);
    expect(validation?.userId).toBe('attacker-user');
    expect(validation?.scopes).toEqual(['read']);
  });

  it('a tampered/legacy grant row holding admin STILL cannot confer it through validate()', async () => {
    const { svc, store } = build();
    const grant = await svc.requestGrant({ clientId: 'x', scopes: ['read'] });
    const stored = await store.findByDeviceCodeHash(sha256(grant.deviceCode));
    // Simulate a row that somehow already holds privileged scopes.
    store.rows.set(stored!.id, { ...stored!, status: 'approved', userId: 'u', scopes: ['read', 'admin', 'internal'] });
    const validation = await svc.validate(grant.deviceCode);
    expect(validation?.scopes).toEqual(['read']); // filtered at the validate() boundary
  });
});
