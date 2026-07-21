/**
 * `policy.updated` hot-swap hook (§4c / C4).
 *
 * Covers the three C4 obligations:
 *  - the emitter fans a `policy.updated` event out to listeners (fire-and-forget,
 *    error-isolated so a faulted hook never breaks the policy write);
 *  - the bootstrap-shaped hook DRIVES `governance.reloadPolicies(configJson)` and
 *    logs the truthful `{reloaded:true}` on an accepted config;
 *  - a REJECTED config keeps the OLD policy live (`reloaded:false`) and is logged
 *    truthfully — never a faked swap;
 *  - the `PUT /spaces/:id/policy` edge emits the changed forbidden-path globs as
 *    the kernel-config JSON the reload verb consumes.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  PolicyUpdateEmitter,
  spacePolicyToKernelConfigJson,
  type PolicyUpdatedEvent,
} from '../services/policy-update.emitter.js';
import type { ReloadPoliciesResult } from '../../governance/ports/kernel.port.js';
import { buildAgentOsRouter } from '../routes/agent-os.routes.js';
import { InMemoryAgentOsRepository } from '../adapters/in-memory-agent-os.repository.js';
import { PrincipalService } from '../../identity/principal.service.js';
import { createAuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../../identity/adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../../identity/ports/api-key.port.js';
import type { IdentityConfig } from '../../identity/config.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

/** The exact hook bootstrap Phase-5a registers (kept in lockstep with index.ts). */
function registerHook(
  emitter: PolicyUpdateEmitter,
  governance: { reloadPolicies: (json: string) => Promise<ReloadPoliciesResult> },
  log: { info: (o: unknown, m: string) => void; warn: (o: unknown, m: string) => void },
): void {
  emitter.on(async ({ configJson, source }) => {
    try {
      const result = await governance.reloadPolicies(configJson);
      log.info(
        { reloaded: result.reloaded, ...(result.reason ? { reason: result.reason } : {}), source },
        'policy hot-swap',
      );
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err), reloaded: false, source },
        'policy hot-swap failed',
      );
    }
  });
}

describe('PolicyUpdateEmitter', () => {
  it('fans an event out to every registered listener (fire-and-forget)', async () => {
    const emitter = new PolicyUpdateEmitter(silentLogger);
    const a = vi.fn();
    const b = vi.fn();
    emitter.on(a);
    emitter.on(b);
    const event: PolicyUpdatedEvent = { source: 'space:s1', configJson: '{}' };
    emitter.emit(event);
    await vi.waitFor(() => expect(a).toHaveBeenCalledWith(event));
    expect(b).toHaveBeenCalledWith(event);
  });

  it('isolates a throwing listener so the emit never propagates and peers still run', async () => {
    const emitter = new PolicyUpdateEmitter(silentLogger);
    emitter.on(() => {
      throw new Error('boom');
    });
    const ok = vi.fn();
    emitter.on(ok);
    expect(() => emitter.emit({ source: 'space:s1', configJson: '{}' })).not.toThrow();
    await vi.waitFor(() => expect(ok).toHaveBeenCalledOnce());
  });
});

describe('spacePolicyToKernelConfigJson', () => {
  it('projects forbidden/secret-path globs into the kernel-config shape', () => {
    const json = spacePolicyToKernelConfigJson({ forbiddenPaths: ['auth/**', 'billing/**'] });
    expect(JSON.parse(json)).toEqual({ forbiddenPathGlobs: ['auth/**', 'billing/**'] });
  });
});

describe('policy.updated → governance.reloadPolicies hook', () => {
  it('drives reloadPolicies and logs reloaded:true on an accepted config', async () => {
    const emitter = new PolicyUpdateEmitter(silentLogger);
    const reloadPolicies = vi.fn(async (): Promise<ReloadPoliciesResult> => ({ reloaded: true }));
    const info = vi.fn();
    const warn = vi.fn();
    registerHook(emitter, { reloadPolicies }, { info, warn });

    const configJson = spacePolicyToKernelConfigJson({ forbiddenPaths: ['secrets/**'] });
    emitter.emit({ source: 'space:s1', configJson });
    await vi.waitFor(() => expect(reloadPolicies).toHaveBeenCalledWith(configJson));

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ reloaded: true, source: 'space:s1' }),
      'policy hot-swap',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the OLD policy live and logs reloaded:false when the config is rejected', async () => {
    const emitter = new PolicyUpdateEmitter(silentLogger);
    // A rejected config: the kernel refuses the swap; the OLD policy stays live.
    const reloadPolicies = vi.fn(
      async (): Promise<ReloadPoliciesResult> => ({ reloaded: false, reason: 'invalid config' }),
    );
    const info = vi.fn();
    const warn = vi.fn();
    registerHook(emitter, { reloadPolicies }, { info, warn });

    emitter.emit({ source: 'space:s1', configJson: '{"bad":true}' });
    await vi.waitFor(() => expect(reloadPolicies).toHaveBeenCalledOnce());

    expect(info).toHaveBeenCalledWith(
      { reloaded: false, reason: 'invalid config', source: 'space:s1' },
      'policy hot-swap',
    );
  });

  it('deny-biases: a reloadPolicies throw is logged reloaded:false, never rethrown', async () => {
    const emitter = new PolicyUpdateEmitter(silentLogger);
    const reloadPolicies = vi.fn(async (): Promise<ReloadPoliciesResult> => {
      throw new Error('kernel fault');
    });
    const info = vi.fn();
    const warn = vi.fn();
    registerHook(emitter, { reloadPolicies }, { info, warn });

    emitter.emit({ source: 'space:s1', configJson: '{}' });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reloaded: false, source: 'space:s1' }),
      'policy hot-swap failed',
    );
    expect(info).not.toHaveBeenCalled();
  });
});

// — Route integration: the PUT policy edge emits the changed globs through the
//   same `onPolicyUpdated` seam bootstrap registers the reload hook on. —

const SESSION_TOKEN = 'session-token-abcdefghijklmnop';

const identityConfig: IdentityConfig = {
  betterAuthSecretPresent: true,
  authDatabaseUrl: 'postgres://x',
  cookieDomain: '.recoder.xyz',
  strictAuth: false,
  internalServiceKey: 'internal-service-key-abcdefghijklmnop',
  internalServiceKeyPresent: true,
  isProduction: false,
  deviceCodeTtlSeconds: 900,
  devicePollIntervalSeconds: 5,
  apiKeyDefaultTtlDays: null,
  apiKeyPrefixLength: 12,
};

const stubAdapter: AuthSessionVerifier = {
  extractToken: ({ bearerToken }) => bearerToken ?? null,
  verifyToken: vi.fn(async (raw: string) =>
    raw === SESSION_TOKEN
      ? {
          sessionId: 'sess-1',
          userId: 'user-1',
          email: 'user@recoder.xyz',
          emailVerified: true,
          expiresAt: new Date(Date.now() + 60_000),
        }
      : null,
  ),
};

const apiKeyValidator: ApiKeyValidator = { validate: vi.fn(async () => null) };

const spaceBody = {
  spaceId: 'space-1',
  displayName: 'Space One',
  ownerId: 'user-1',
  repositories: [],
  policy: {
    policyId: 'pol-1',
    approvalRequiredFor: [],
    forbiddenPaths: ['auth/**'],
    defaultVerificationCommands: [],
    allowNetworkByDefault: false,
    allowShellByDefault: false,
  },
};

function buildRouteHarness(onPolicyChange: (e: PolicyUpdatedEvent) => void): Promise<{
  base: string;
  close: () => Promise<void>;
}> {
  const repo = new InMemoryAgentOsRepository();
  const principal = new PrincipalService({
    config: identityConfig,
    logger: silentLogger,
    authSession: stubAdapter,
    apiKeyValidator,
  });
  const middleware = createAuthMiddleware({
    verifier: principal,
    principal,
    config: identityConfig,
    logger: silentLogger,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/agent-os', buildAgentOsRouter({ repository: repo, middleware, onPolicyChange }));
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

function send(base: string, method: string, path: string, body: unknown): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}/api/agent-os${path}`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: { authorization: `Bearer ${SESSION_TOKEN}`, 'content-type': 'application/json' },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

describe('policy-write edges → policy.updated emission', () => {
  it('emits the changed forbidden globs on a space upsert and a policy PUT', async () => {
    const events: PolicyUpdatedEvent[] = [];
    const h = await buildRouteHarness((e) => events.push(e));

    expect(await send(h.base, 'POST', '/spaces', spaceBody)).toBe(200);
    expect(await send(h.base, 'PUT', '/spaces/space-1/policy', {
      ...spaceBody.policy,
      forbiddenPaths: ['auth/**', 'billing/**'],
    })).toBe(200);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      source: 'space:space-1',
      configJson: JSON.stringify({ forbiddenPathGlobs: ['auth/**'] }),
    });
    expect(events[1]).toEqual({
      source: 'space:space-1',
      configJson: JSON.stringify({ forbiddenPathGlobs: ['auth/**', 'billing/**'] }),
    });
    await h.close();
  });

  it('does not emit when the durable write itself fails (no swap on a faulted write)', async () => {
    const events: PolicyUpdatedEvent[] = [];
    // Unknown space ⇒ policy PUT 404s BEFORE any write ⇒ no emission.
    const h = await buildRouteHarness((e) => events.push(e));
    expect(await send(h.base, 'PUT', '/spaces/nope/policy', spaceBody.policy)).toBe(404);
    expect(events).toHaveLength(0);
    await h.close();
  });
});
