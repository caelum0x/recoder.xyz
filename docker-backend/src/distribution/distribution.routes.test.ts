/**
 * Route-level tests for the wired distribution module.
 *
 * Proves the three load-bearing behaviors end-to-end over a real Express app
 * (ephemeral http server + fetch), with deterministic injected ports (no network):
 *
 *  1. CLI device-flow: /device → /authorize → /token issues an access token,
 *     and /verify validates it (against the injected recoder.xyz AuthPort).
 *  2. Entitlement gate: a gated request is ALLOWED under-plan (pro) and DENIED
 *     over-plan (free) with upgrade_required.
 *  3. A signature-verified Polar webhook updates entitlement (emits a RunEvent).
 */
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'node:crypto';
import fetch from 'node-fetch';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthPort,
  AuthSessionRef,
  BillingPort,
  RecoderUserProfile,
  Entitlement,
  Plan,
} from '@recoder/distribution';
import { buildDistributionModule, type DistributionModule } from './module.js';
import { createCliAuthRouter } from './cli-auth.routes.js';
import { createBillingRouter, createBillingWebhookRouter } from './billing.routes.js';
import { requireFeature } from './entitlement-gate.middleware.js';

const SIGNING_KEY = 'test-cli-signing-key-0123456789';
const WEBHOOK_SECRET_KEY = Buffer.from('test-webhook-key-abcdef0123456789').toString('base64');
const WEBHOOK_SECRET = `whsec_${WEBHOOK_SECRET_KEY}`;

// ---- Deterministic recoder.xyz AuthPort (the source of truth, faked for tests) ----

const KNOWN_SESSIONS: Record<string, { userId: string; email: string; name: string }> = {
  'session-alice': { userId: 'user-alice', email: 'alice@example.com', name: 'Alice' },
};

function fakeAuthPort(plans: Record<string, Plan>): AuthPort {
  function profileFor(userId: string): RecoderUserProfile {
    const known = Object.values(KNOWN_SESSIONS).find((s) => s.userId === userId);
    return {
      userId,
      email: known?.email ?? `${userId}@example.com`,
      name: known?.name ?? userId,
      plan: plans[userId] ?? 'free',
      hasOwnApiKey: false,
    };
  }
  return {
    async verifySession(rawSessionToken: string): Promise<AuthSessionRef | null> {
      const s = KNOWN_SESSIONS[rawSessionToken];
      if (!s) return null;
      return {
        sessionId: rawSessionToken,
        userId: s.userId,
        user: { id: s.userId, email: s.email, name: s.name, emailVerified: true },
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
    },
    async getUserProfile(userId: string): Promise<RecoderUserProfile | null> {
      return profileFor(userId);
    },
    async verifyCliAccessToken(): Promise<RecoderUserProfile | null> {
      // Tests drive verification through the real HMAC decode in verifyCliToken;
      // this returns the authoritative profile for whichever subject the token
      // names (resolved by the verifier after a successful local decode).
      return null;
    },
  };
}

/**
 * The verify path defers to recoder.xyz: the verifier first HMAC-decodes the
 * token, then calls verifyCliAccessToken(token). For the happy-path verify test
 * we wire an AuthPort whose verifyCliAccessToken returns the decoded subject's
 * profile, mirroring a live recoder.xyz "yes, still valid".
 */
function fakeAuthPortWithCliVerify(
  plans: Record<string, Plan>,
  decode: (token: string) => string | null,
): AuthPort {
  const base = fakeAuthPort(plans);
  return {
    ...base,
    async verifyCliAccessToken(accessToken: string): Promise<RecoderUserProfile | null> {
      const sub = decode(accessToken);
      if (!sub) return null;
      return base.getUserProfile(sub);
    },
  };
}

// ---- Deterministic Polar BillingPort ----

function fakeBillingPort(grantsBySubject: Record<string, Entitlement[]>): BillingPort {
  return {
    async startCheckout() {
      return { checkoutId: 'chk_1', url: 'https://polar.test/checkout/chk_1' };
    },
    async resolveEntitlements(subject) {
      return grantsBySubject[subject.subjectId] ?? [];
    },
    async getQuota(subject, kind) {
      return { subjectId: subject.subjectId, kind, limit: 0, remaining: 0, resetAt: new Date().toISOString() };
    },
    async emitUsage() {
      /* no-op for tests */
    },
    async validateLicenseKey() {
      return { valid: false, reason: 'test' };
    },
    async health() {
      return { status: 'ok', checkedAt: new Date().toISOString() };
    },
  };
}

const baseEnv: Record<string, string> = {
  RECODER_BASE_URL: 'https://recoder.xyz',
  APP_API_URL: 'https://recoder.xyz',
  POLAR_ACCESS_TOKEN: 'polar_test_token',
  POLAR_WEBHOOK_SECRET: WEBHOOK_SECRET,
  CLI_TOKEN_SIGNING_KEY: SIGNING_KEY,
  INTERNAL_SERVICE_KEY: 'internal-test-key',
};

// Test app with an injectable "authed user" via the x-test-user header so the
// billing/gate routes see a deterministic req.userId.
function buildTestApp(mod: DistributionModule): express.Express {
  const app = express();
  app.use('/api/auth/cli', express.json(), createCliAuthRouter(mod));
  app.use(
    '/internal/billing/webhook',
    express.raw({ type: '*/*', limit: '2mb' }),
    createBillingWebhookRouter(mod),
  );
  // Fake auth: set req.userId from a header so we can simulate different plans.
  app.use('/api/billing', express.json(), (req, _res, next) => {
    const u = req.headers['x-test-user'];
    (req as express.Request & { userId?: string }).userId = typeof u === 'string' ? u : 'anonymous';
    next();
  });
  app.use('/api/billing', createBillingRouter(mod));
  // Standalone feature-gate mount (avoids the conductor-backed workspace gate).
  app.get(
    '/api/gated/cloud-sync',
    express.json(),
    (req, _res, next) => {
      const u = req.headers['x-test-user'];
      (req as express.Request & { userId?: string }).userId = typeof u === 'string' ? u : 'anonymous';
      next();
    },
    requireFeature(mod, 'usage_metering'),
    (_req, res) => res.json({ success: true, capability: 'cloud-sync' }),
  );
  return app;
}

function startServer(app: express.Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe('distribution routes (wired into docker-backend)', () => {
  let server: Server;
  let base: string;
  let mod: DistributionModule;

  // Capture the issued device-flow token across the device-flow test steps.
  let issuedAccessToken = '';

  beforeAll(async () => {
    // Decode helper that mirrors the real HMAC token so the AuthPort can return
    // the authoritative profile for the token's subject during /verify.
    const decodeSubject = (token: string): string | null => {
      const [body] = token.split('.');
      if (!body) return null;
      try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { sub?: string };
        return payload.sub ?? null;
      } catch {
        return null;
      }
    };

    const plans: Record<string, Plan> = {
      'user-alice': 'pro', // pro has usage_metering (cloud sync)
      'user-free': 'free', // free does NOT
    };

    mod = buildDistributionModule({
      env: baseEnv,
      auth: fakeAuthPortWithCliVerify(plans, decodeSubject),
      billingPort: fakeBillingPort({}),
      resolvePlanForUser: (userId) => plans[userId] ?? 'free',
    });

    const app = buildTestApp(mod);
    const started = await startServer(app);
    server = started.server;
    base = started.base;
  });

  afterAll(() => {
    server?.close();
  });

  it('issues and verifies a CLI token via the device flow', async () => {
    // 1. Device authorize.
    const deviceRes = await fetch(`${base}/api/auth/cli/device`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: 'recoder-code' }),
    });
    expect(deviceRes.status).toBe(200);
    const device = (await deviceRes.json()) as { device_code: string; user_code: string };
    expect(device.device_code).toBeTruthy();
    expect(device.user_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // 2. Browser approves with the recoder.xyz session (the source of truth).
    const authorizeRes = await fetch(`${base}/api/auth/cli/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer session-alice' },
      body: JSON.stringify({ user_code: device.user_code, action: 'approve' }),
    });
    expect(authorizeRes.status).toBe(200);
    const approved = (await authorizeRes.json()) as { success: boolean; userId: string };
    expect(approved.success).toBe(true);
    expect(approved.userId).toBe('user-alice');

    // 3. Exchange the device code for a token.
    const tokenRes = await fetch(`${base}/api/auth/cli/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device.device_code,
        client_id: 'recoder-code',
      }),
    });
    expect(tokenRes.status).toBe(200);
    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      user: { id: string; subscription_plan: Plan };
    };
    expect(token.access_token).toBeTruthy();
    expect(token.refresh_token).toBeTruthy();
    expect(token.user.id).toBe('user-alice');
    expect(token.user.subscription_plan).toBe('pro');
    issuedAccessToken = token.access_token;

    // 4. Verify the issued token (defers to recoder.xyz).
    const verifyRes = await fetch(`${base}/api/auth/cli/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: issuedAccessToken }),
    });
    expect(verifyRes.status).toBe(200);
    const verified = (await verifyRes.json()) as { valid: boolean; user?: { id: string } };
    expect(verified.valid).toBe(true);
    expect(verified.user?.id).toBe('user-alice');
  });

  it('rejects a single-use device grant on a second token exchange (fail safe)', async () => {
    // The grant consumed above cannot mint a second token. Re-run a fresh flow
    // and consume twice to prove single-use.
    const deviceRes = await fetch(`${base}/api/auth/cli/device`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const device = (await deviceRes.json()) as { device_code: string; user_code: string };
    await fetch(`${base}/api/auth/cli/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer session-alice' },
      body: JSON.stringify({ user_code: device.user_code }),
    });
    const first = await fetch(`${base}/api/auth/cli/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device.device_code,
      }),
    });
    expect(first.status).toBe(200);
    const second = await fetch(`${base}/api/auth/cli/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device.device_code,
      }),
    });
    // Consumed grant → expired_token (no second issuance).
    expect(second.status).toBe(400);
  });

  it('allows an entitlement-gated request under-plan (pro) and denies over-plan (free)', async () => {
    // Pro plan includes usage_metering (cloud sync) → allowed.
    const allowed = await fetch(`${base}/api/gated/cloud-sync`, {
      headers: { 'x-test-user': 'user-alice' },
    });
    expect(allowed.status).toBe(200);
    const allowedBody = (await allowed.json()) as { success: boolean };
    expect(allowedBody.success).toBe(true);

    // Free plan does NOT include cloud sync → denied with upgrade_required.
    const denied = await fetch(`${base}/api/gated/cloud-sync`, {
      headers: { 'x-test-user': 'user-free' },
    });
    expect(denied.status).toBe(402);
    const deniedBody = (await denied.json()) as { code: string; plan: string };
    expect(deniedBody.code).toBe('upgrade_required');
    expect(deniedBody.plan).toBe('free');
  });

  it('denies a Polar webhook with a missing/invalid signature (never a faked 200)', async () => {
    const body = JSON.stringify({ type: 'subscription.active', data: { external_customer_id: 'user-alice' } });
    const res = await fetch(`${base}/internal/billing/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('webhook_untrusted');
  });

  it('accepts a correctly-signed Polar webhook and emits an entitlement-change RunEvent', async () => {
    const before = mod.events.recent(100).length;

    const webhookId = 'wh_test_1';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      type: 'subscription.active',
      data: { external_customer_id: 'user-alice', product_id: 'prod_pro' },
    });
    const signedContent = `${webhookId}.${timestamp}.${body}`;
    const sig = createHmac('sha256', Buffer.from(WEBHOOK_SECRET_KEY, 'base64'))
      .update(signedContent)
      .digest('base64');

    const res = await fetch(`${base}/internal/billing/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${sig}`,
      },
      body,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { change: string; subjectId: string; emitted: boolean };
    };
    expect(json.success).toBe(true);
    expect(json.data.change).toBe('granted');
    expect(json.data.subjectId).toBe('user-alice');
    expect(json.data.emitted).toBe(true);

    // A RunEvent announcing the entitlement change was emitted to the bus.
    const after = mod.events.recent(100);
    expect(after.length).toBe(before + 1);
    const evt = after[after.length - 1]!;
    expect(evt.data?.entitlementChange).toBe('granted');
    expect(evt.data?.subjectId).toBe('user-alice');
  });

  it('dedupes a redelivered webhook (no second emit)', async () => {
    const webhookId = 'wh_test_dedupe';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      type: 'subscription.active',
      data: { external_customer_id: 'user-alice' },
    });
    const sign = () =>
      createHmac('sha256', Buffer.from(WEBHOOK_SECRET_KEY, 'base64'))
        .update(`${webhookId}.${timestamp}.${body}`)
        .digest('base64');
    const headers = {
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${sign()}`,
    };
    const first = await fetch(`${base}/internal/billing/webhook`, { method: 'POST', headers, body });
    expect(first.status).toBe(200);
    const countAfterFirst = mod.events.recent(200).length;

    const second = await fetch(`${base}/internal/billing/webhook`, { method: 'POST', headers, body });
    expect(second.status).toBe(200);
    const secondJson = (await second.json()) as { data: { deduped: boolean; emitted: boolean } };
    expect(secondJson.data.deduped).toBe(true);
    expect(secondJson.data.emitted).toBe(false);
    // No additional RunEvent on the redelivery.
    expect(mod.events.recent(200).length).toBe(countAfterFirst);
  });
});
