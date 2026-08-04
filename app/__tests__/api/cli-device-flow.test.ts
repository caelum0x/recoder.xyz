import { NextRequest } from 'next/server';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Device-flow consolidation (Set A):
 *   init  -> POST /api/auth/cli/device  (and the device_flow action on /api/auth/cli)
 *   auth  -> POST /api/auth/cli/authorize
 *   token -> POST /api/auth/cli/token   (device_code + refresh_token grants)
 * Set B (/api/cli/device, /api/cli/device/poll) is deleted — route files must not exist.
 *
 * Uses a small stateful in-memory prisma fake so the flow runs end-to-end.
 */

const testUser = {
  id: 'u1',
  email: 'user@example.com',
  name: 'Test User',
  subscription: 'free',
  subscriptionPlan: 'free',
  subscriptionStatus: 'active',
  emailVerified: true,
  image: null as string | null,
};

type DeviceCodeRecord = {
  id: string;
  deviceCode: string;
  userCode: string;
  clientId: string;
  scope: string | null;
  status: string;
  expiresAt: Date;
  userId: string | null;
  createdAt: Date;
};

type CliSessionRecord = Record<string, unknown> & {
  id: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  isActive: boolean;
};

const db = {
  deviceCodes: [] as DeviceCodeRecord[],
  cliSessions: [] as CliSessionRecord[],
  seq: 0,
};

function matchDeviceCode(where: Record<string, unknown>): DeviceCodeRecord | null {
  return (
    db.deviceCodes.find((record) => {
      if (where.id && record.id !== where.id) return false;
      if (where.deviceCode && record.deviceCode !== where.deviceCode) return false;
      if (where.userCode && record.userCode !== where.userCode) return false;
      if (where.status && record.status !== where.status) return false;
      const expiresAt = where.expiresAt as { gte?: Date } | undefined;
      if (expiresAt?.gte && record.expiresAt < expiresAt.gte) return false;
      return true;
    }) ?? null
  );
}

function withUser(record: DeviceCodeRecord | null, include?: Record<string, unknown>) {
  if (!record) return null;
  if (!include || !('user' in include)) return { ...record };
  return { ...record, user: record.userId === testUser.id ? { ...testUser } : null };
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    deviceCode: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const record: DeviceCodeRecord = {
          id: `dc_${++db.seq}`,
          scope: null,
          userId: null,
          createdAt: new Date(),
          ...(data as Omit<DeviceCodeRecord, 'id' | 'createdAt'>),
        };
        db.deviceCodes.push(record);
        return record;
      },
      findUnique: async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) =>
        withUser(matchDeviceCode(where), include),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const record = matchDeviceCode(where);
        return record ? { ...record } : null;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const record = matchDeviceCode(where);
        if (!record) throw new Error('Record not found');
        Object.assign(record, data);
        return { ...record };
      },
    },
    users: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === testUser.id || where.email === testUser.email) return { ...testUser };
        return null;
      },
    },
    cli_sessions: {
      create: async ({ data }: { data: CliSessionRecord }) => {
        db.cliSessions.push({ ...data });
        return { ...data };
      },
      findUnique: async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
        const session = db.cliSessions.find(
          (record) =>
            (where.accessToken && record.accessToken === where.accessToken) ||
            (where.refreshToken && record.refreshToken === where.refreshToken) ||
            (where.id && record.id === where.id)
        );
        if (!session) return null;
        if (include && 'users' in include) return { ...session, users: { ...testUser } };
        return { ...session };
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const session = db.cliSessions.find((record) => record.id === where.id);
        if (!session) throw new Error('Session not found');
        Object.assign(session, data);
        return { ...session };
      },
    },
  },
}));

let nanoidSeq = 0;
vi.mock('nanoid', () => ({
  nanoid: (size = 21) => `n${++nanoidSeq}`.padEnd(size, 'x'),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/auth-config', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function initDeviceFlow() {
  const { POST } = await import('@/app/api/auth/cli/device/route');
  const response = await POST(
    jsonRequest('http://localhost/api/auth/cli/device', { client_id: 'recoder-desktop' })
  );
  return { response, json: await response.json() };
}

async function pollToken(deviceCode: string) {
  const { POST } = await import('@/app/api/auth/cli/token/route');
  const response = await POST(
    jsonRequest('http://localhost/api/auth/cli/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: 'recoder-desktop',
    })
  );
  return { response, json: await response.json() };
}

async function authorizeDevice(userCode: string, action: 'approve' | 'deny') {
  const { POST } = await import('@/app/api/auth/cli/authorize/route');
  const response = await POST(
    jsonRequest('http://localhost/api/auth/cli/authorize', { user_code: userCode, action })
  );
  return { response, json: await response.json() };
}

describe('CLI device flow (Set A: /api/auth/cli/*)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.deviceCodes = [];
    db.cliSessions = [];
    process.env.NEXT_PUBLIC_APP_URL = 'https://recoder.xyz';
    mockRequireAuth.mockResolvedValue({ error: false, user: { ...testUser } });
  });

  it('init returns RFC-8628 snake_case payload pointing at /cli/auth with 15 min expiry', async () => {
    const { response, json } = await initDeviceFlow();

    expect(response.status).toBe(200);
    expect(json.device_code).toBeDefined();
    expect(json.user_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(json.verification_uri).toBe('https://recoder.xyz/cli/auth');
    expect(json.verification_uri_complete).toBe(
      `https://recoder.xyz/cli/auth?code=${json.user_code}`
    );
    expect(json.expires_in).toBe(900);
    expect(json.interval).toBe(5);
  });

  it('device_flow action on /api/auth/cli shares the same truth (uri + expiry)', async () => {
    const { POST } = await import('@/app/api/auth/cli/route');
    const response = await POST(
      jsonRequest('http://localhost/api/auth/cli', {
        action: 'device_flow',
        client_id: 'recoder-desktop',
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.verification_uri).toBe('https://recoder.xyz/cli/auth');
    expect(json.verification_uri_complete).toContain('/cli/auth?code=');
    expect(json.expires_in).toBe(900);
  });

  it('runs the full init -> authorize -> token -> refresh happy path', async () => {
    const { json: init } = await initDeviceFlow();

    // Poll before the user authorizes: authorization_pending.
    const pending = await pollToken(init.device_code);
    expect(pending.response.status).toBe(400);
    expect(pending.json.error).toBe('authorization_pending');

    // User approves in the browser.
    const authorized = await authorizeDevice(init.user_code, 'approve');
    expect(authorized.response.status).toBe(200);
    expect(authorized.json.user.email).toBe(testUser.email);

    // Poll again: opaque reco_/recr_ tokens.
    const token = await pollToken(init.device_code);
    expect(token.response.status).toBe(200);
    expect(token.json.status).toBe('authorized');
    expect(token.json.access_token).toMatch(/^reco_/);
    expect(token.json.refresh_token).toMatch(/^recr_/);
    expect(token.json.token_type).toBe('Bearer');
    expect(token.json.user.email).toBe(testUser.email);

    // Refresh grant rotates the access token and echoes the refresh token.
    const { POST: tokenPost } = await import('@/app/api/auth/cli/token/route');
    const refreshResponse = await tokenPost(
      jsonRequest('http://localhost/api/auth/cli/token', {
        grant_type: 'refresh_token',
        refresh_token: token.json.refresh_token,
      })
    );
    expect(refreshResponse.status).toBe(200);
    const refreshed = await refreshResponse.json();
    expect(refreshed.access_token).toMatch(/^reco_/);
    expect(refreshed.access_token).not.toBe(token.json.access_token);
    expect(refreshed.refresh_token).toBe(token.json.refresh_token);
    expect(refreshed.user.email).toBe(testUser.email);
  });

  it('carries the client device_label onto the created cli_session so /account can name it', async () => {
    const { POST } = await import('@/app/api/auth/cli/device/route');
    const initResp = await POST(
      jsonRequest('http://localhost/api/auth/cli/device', {
        client_id: 'recoder-desktop',
        device_label: 'arhan-macbook (darwin)',
      })
    );
    const init = await initResp.json();

    // The label is persisted on the device code awaiting authorization.
    const dc = db.deviceCodes.find((entry) => entry.deviceCode === init.device_code) as
      | (DeviceCodeRecord & { deviceName?: string })
      | undefined;
    expect(dc?.deviceName).toBe('arhan-macbook (darwin)');

    await authorizeDevice(init.user_code, 'approve');
    await pollToken(init.device_code);

    // ...and flows through to the cli_session the user sees on /account.
    expect(db.cliSessions[0].deviceName).toBe('arhan-macbook (darwin)');
  });

  it('falls back to the neutral device name when no label is sent (older clients)', async () => {
    const { json: init } = await initDeviceFlow();
    await authorizeDevice(init.user_code, 'approve');
    await pollToken(init.device_code);
    expect(db.cliSessions[0].deviceName).toBe('CLI Device Flow');
  });

  it('returns expired_token when the device code is past its expiry', async () => {
    const { json: init } = await initDeviceFlow();
    const record = db.deviceCodes.find((entry) => entry.deviceCode === init.device_code);
    expect(record).toBeDefined();
    record!.expiresAt = new Date(Date.now() - 1000);

    const expired = await pollToken(init.device_code);
    expect(expired.response.status).toBe(400);
    expect(expired.json.error).toBe('expired_token');
  });

  it('returns access_denied after the user denies the device', async () => {
    const { json: init } = await initDeviceFlow();

    const denied = await authorizeDevice(init.user_code, 'deny');
    expect(denied.response.status).toBe(200);

    const token = await pollToken(init.device_code);
    expect(token.response.status).toBe(400);
    expect(token.json.error).toBe('access_denied');
  });

  it('returns invalid_grant for an unknown device code', async () => {
    const { response, json } = await pollToken('does-not-exist');
    expect(response.status).toBe(400);
    expect(json.error).toBe('invalid_grant');
  });
});

describe('Set B (/api/cli/device) is deleted', () => {
  const appDir = path.resolve(__dirname, '..', '..');

  it('route files are gone so Next serves 404', () => {
    expect(existsSync(path.join(appDir, 'app/api/cli/device/route.ts'))).toBe(false);
    expect(existsSync(path.join(appDir, 'app/api/cli/device/poll/route.ts'))).toBe(false);
    expect(existsSync(path.join(appDir, 'app/api/cli/device'))).toBe(false);
  });
});
