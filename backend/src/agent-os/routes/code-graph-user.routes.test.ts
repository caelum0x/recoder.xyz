import type { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createCodeGraphUserRouter, type CodeGraphUserServiceFactory } from './code-graph-user.routes';
import type { IndexState } from '../recodergit-service';
import type { AuthenticatedClone } from '../code-graph-clone';

const SECRET = 'ghp_ROUTER_SECRET_TOKEN_0987654321';

interface MockReq {
  method: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  userId?: string;
}

function makeReq(opts: { body?: Record<string, unknown>; params?: Record<string, string>; userId?: string } = {}): MockReq {
  return {
    method: 'GET',
    body: opts.body ?? {},
    params: opts.params ?? {},
    query: {},
    headers: {},
    userId: opts.userId,
  };
}

function makeRes(): { res: any; state: { statusCode: number; jsonData: any } } {
  const state = { statusCode: 200, jsonData: null as any };
  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(data: any) {
      state.jsonData = data;
      return res;
    },
  };
  return { res, state };
}

function getRouteStack(router: Router, path: string, method: 'post' | 'get') {
  const middleware = router.stack.filter((layer: any) => !layer.route).map((layer: any) => layer.handle);
  const routeLayer = router.stack.find(
    (layer: any) => layer.route?.path === path && layer.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return [...middleware, ...routeLayer.route.stack.map((layer: any) => layer.handle)];
}

async function runStack(router: Router, path: string, method: 'post' | 'get', req: MockReq, res: any): Promise<void> {
  const handlers = getRouteStack(router, path, method);
  for (const handler of handlers) {
    const result = await new Promise<{ nextCalled: boolean }>((resolve, reject) => {
      let nextCalled = false;
      const next = (err?: unknown) => {
        if (err) return reject(err);
        nextCalled = true;
        resolve({ nextCalled: true });
      };
      try {
        Promise.resolve(handler(req, res, next))
          .then(() => {
            if (!nextCalled) resolve({ nextCalled: false });
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });
    if (!result.nextCalled) break;
  }
}

function makeFakeFactory() {
  const stores = new Map<string, Map<string, IndexState>>();
  const connectCalls: Array<{ ownerId: string; token: string | null; input: { repoId: string; cloneUrl: string; ref?: string } }> = [];
  const ensure = (ownerId: string) => {
    let part = stores.get(ownerId);
    if (!part) {
      part = new Map();
      stores.set(ownerId, part);
    }
    return part;
  };
  const factory: CodeGraphUserServiceFactory = ({ ownerId, token }) => {
    const part = ensure(ownerId);
    return {
      connectRepo: async (input) => {
        connectCalls.push({ ownerId, token, input });
        const state: IndexState = {
          repoId: input.repoId,
          repoRoot: `/work/${ownerId}/${input.repoId}`,
          branch: 'main',
          lastIndexedSha: 'abc123',
          indexedAt: '2026-01-01T00:00:00.000Z',
          nodes: 10,
          edges: 20,
          status: 'indexed',
          cloneUrl: input.cloneUrl ?? null,
        };
        part.set(input.repoId, state);
        return { enabled: true, state, status: 'indexed' as const };
      },
      status: async (repoId) => {
        const s = part.get(repoId);
        if (!s) {
          return { enabled: true as const, repoId, status: 'not_indexed' as const, fresh: false, state: null, currentSha: null };
        }
        return { enabled: true as const, repoId, status: 'indexed' as const, fresh: true, state: s, currentSha: 'abc123' };
      },
      domainMap: async (repoId) => ({ enabled: true as const, map: { repoId, domains: [{ name: 'core' }], crossEdges: [] } }),
      listRepos: () => [...part.values()],
    };
  };
  return { factory, connectCalls, stores };
}

describe('createCodeGraphUserRouter', () => {
  it('flag OFF -> disabled no-op (no service work)', async () => {
    const { factory, connectCalls } = makeFakeFactory();
    const router = createCodeGraphUserRouter({ isEnabled: () => false, serviceFactory: factory });
    const { res, state } = makeRes();
    await runStack(router, '/connect', 'post', makeReq({ userId: 'u1', body: { repo: 'acme/widgets' } }), res);
    expect(state.jsonData).toEqual({ success: true, data: { enabled: false } });
    expect(connectCalls).toHaveLength(0);
  });

  it('authed user + public repo -> resolves owner/name to https URL and indexes (scoped)', async () => {
    const { factory, connectCalls } = makeFakeFactory();
    const router = createCodeGraphUserRouter({ isEnabled: () => true, serviceFactory: factory });
    const { res, state } = makeRes();
    await runStack(router, '/connect', 'post', makeReq({ userId: 'u1', body: { repo: 'Acme/Widgets' } }), res);

    expect(state.statusCode).toBe(201);
    expect(connectCalls).toHaveLength(1);
    expect(connectCalls[0].ownerId).toBe('u1');
    expect(connectCalls[0].token).toBeNull();
    expect(connectCalls[0].input.cloneUrl).toBe('https://github.com/Acme/Widgets.git');
    expect(connectCalls[0].input.repoId).toBe('acme__widgets');
    expect(state.jsonData.data).toMatchObject({ enabled: true, repoId: 'acme__widgets', status: 'indexed', nodes: 10, edges: 20 });
    // domain map is attached best-effort
    expect(state.jsonData.data.domainMap).toEqual({ repoId: 'acme__widgets', domains: [{ name: 'core' }], crossEdges: [] });
  });

  it('private repo WITHOUT a token -> 401 auth error, NO clone/connect attempted, no leak', async () => {
    const { factory, connectCalls } = makeFakeFactory();
    const router = createCodeGraphUserRouter({ isEnabled: () => true, serviceFactory: factory });
    const { res, state } = makeRes();
    await runStack(router, '/connect', 'post', makeReq({ userId: 'u1', body: { repo: 'acme/secret', private: true } }), res);

    expect(state.statusCode).toBe(401);
    expect(state.jsonData.success).toBe(false);
    expect(state.jsonData.error).toMatch(/authentication required/i);
    expect(connectCalls).toHaveLength(0);
  });

  it('private repo WITH a token -> connectRepo gets a CLEAN url + the token (not in the url)', async () => {
    const { factory, connectCalls } = makeFakeFactory();
    const router = createCodeGraphUserRouter({ isEnabled: () => true, serviceFactory: factory });
    const { res, state } = makeRes();
    await runStack(
      router,
      '/connect',
      'post',
      makeReq({ userId: 'u1', body: { repo: 'acme/secret', private: true, token: SECRET } }),
      res,
    );

    expect(state.statusCode).toBe(201);
    expect(connectCalls).toHaveLength(1);
    expect(connectCalls[0].token).toBe(SECRET);
    // The token NEVER rides inside the clone URL.
    expect(connectCalls[0].input.cloneUrl).toBe('https://github.com/acme/secret.git');
    expect(connectCalls[0].input.cloneUrl).not.toContain(SECRET);
    // The token is NEVER echoed in the response.
    expect(JSON.stringify(state.jsonData)).not.toContain(SECRET);
  });

  it('the default secure clone is wired so the token reaches git via ENV only (not argv/url)', async () => {
    const cloneCalls: Array<{ cloneUrl: string; token: string | null; dest: string }> = [];
    const recordingClone: AuthenticatedClone = async ({ cloneUrl, dest, token }) => {
      cloneCalls.push({ cloneUrl, dest, token });
      // simulate a successful clone (no real network); leave dest empty so the
      // default engine degrades fail-safe to 'unavailable' — connect still works.
    };
    const router = createCodeGraphUserRouter({ isEnabled: () => true, authenticatedClone: recordingClone });
    const { res, state } = makeRes();
    await runStack(
      router,
      '/connect',
      'post',
      makeReq({ userId: 'u1', body: { repo: 'acme/secret', private: true, token: SECRET } }),
      res,
    );

    expect(state.statusCode).toBe(201);
    expect(cloneCalls).toHaveLength(1);
    // The router hands the secure clone the clean URL + the token separately.
    expect(cloneCalls[0].cloneUrl).toBe('https://github.com/acme/secret.git');
    expect(cloneCalls[0].cloneUrl).not.toContain(SECRET);
    expect(cloneCalls[0].token).toBe(SECRET);
    // Fail-safe: engine bin absent -> 'unavailable', never a 500.
    expect(state.jsonData.data.enabled).toBe(true);
  });

  it('repos / status are owner-scoped — no cross-user leakage', async () => {
    const { factory } = makeFakeFactory();
    const router = createCodeGraphUserRouter({ isEnabled: () => true, serviceFactory: factory });

    // u1 connects two repos; u2 connects one.
    for (const repo of ['acme/a', 'acme/b']) {
      const { res } = makeRes();
      await runStack(router, '/connect', 'post', makeReq({ userId: 'u1', body: { repo } }), res);
    }
    {
      const { res } = makeRes();
      await runStack(router, '/connect', 'post', makeReq({ userId: 'u2', body: { repo: 'acme/c' } }), res);
    }

    // u1 sees only its two repos.
    const u1List = makeRes();
    await runStack(router, '/repos', 'get', makeReq({ userId: 'u1' }), u1List.res);
    expect(u1List.res === undefined).toBe(false);
    const u1Ids = u1List.state.jsonData.data.repos.map((r: any) => r.repoId).sort();
    expect(u1Ids).toEqual(['acme__a', 'acme__b']);

    // u2 sees only its one repo.
    const u2List = makeRes();
    await runStack(router, '/repos', 'get', makeReq({ userId: 'u2' }), u2List.res);
    const u2Ids = u2List.state.jsonData.data.repos.map((r: any) => r.repoId);
    expect(u2Ids).toEqual(['acme__c']);

    // u2 asking for u1's repo status sees not_indexed (scoped out).
    const crossStatus = makeRes();
    await runStack(router, '/:repoId/status', 'get', makeReq({ userId: 'u2', params: { repoId: 'acme__a' } }), crossStatus.res);
    expect(crossStatus.state.jsonData.data.status).toBe('not_indexed');
    expect(crossStatus.state.jsonData.data.state).toBeNull();
  });

  it('domain-map returns an empty map (no engine) for a repo the user never connected', async () => {
    const { factory } = makeFakeFactory();
    const domainSpy = vi.fn();
    const wrapped: CodeGraphUserServiceFactory = (args) => {
      const svc = factory(args);
      return { ...svc, domainMap: (repoId) => { domainSpy(repoId); return svc.domainMap(repoId); } };
    };
    const router = createCodeGraphUserRouter({ isEnabled: () => true, serviceFactory: wrapped });
    const { res, state } = makeRes();
    await runStack(router, '/:repoId/domain-map', 'get', makeReq({ userId: 'u1', params: { repoId: 'never__connected' } }), res);

    expect(state.jsonData.data.map).toEqual({ repoId: 'never__connected', domains: [], crossEdges: [] });
    expect(domainSpy).not.toHaveBeenCalled();
  });

  it('unauthenticated request (no userId) -> 401', async () => {
    const { factory } = makeFakeFactory();
    const router = createCodeGraphUserRouter({ isEnabled: () => true, serviceFactory: factory });
    const { res, state } = makeRes();
    await runStack(router, '/repos', 'get', makeReq({ body: {} }), res);
    expect(state.statusCode).toBe(401);
  });
});
