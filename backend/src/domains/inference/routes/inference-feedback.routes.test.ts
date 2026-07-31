/**
 * `POST /inference/feedback` — route-level tests over the composed inference
 * control router (`buildInferenceRouter`). Proves the spec'd feedback facet:
 *
 *   - 200 success envelope with the REAL gateway feedback_id when routed
 *   - 503 SERVICE_UNAVAILABLE (truthful, never a faked accept) when the
 *     delivery ladder declines (no feedback-capable tier bound)
 *   - 400 VALIDATION_ERROR on a malformed body (zod at the system boundary)
 *   - the authenticated principal is attributed as the feedback `userId`
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express, { type RequestHandler } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildInferenceRouter, type InferenceRoutesDeps } from './inference.routes.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { FeedbackRequest, FeedbackResult } from '../types.js';

/** Dependency-free HTTP client (the vitest setup mocks `global.fetch`). */
function request(
  base: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const payload = init.body === undefined ? undefined : JSON.stringify(init.body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: init.method ?? 'GET',
        headers: payload === undefined ? {} : { 'content-type': 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, json: () => (text ? JSON.parse(text) : null) });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const testPrincipal = { userId: 'tester', isAnonymous: false } as unknown as Principal;

/** A middleware that always attaches a fixed principal (the routes only use these two). */
const passAuth: RequestHandler = (req, _res, next) => {
  req.principal = testPrincipal;
  next();
};
const fakeMiddleware = { authenticate: passAuth, authenticateMutating: passAuth } as unknown as AuthMiddleware;

/** Build a server whose routing.feedback is the injected fake (other deps unused by this route). */
function buildDeps(feedback: (req: FeedbackRequest) => Promise<FeedbackResult>): {
  deps: InferenceRoutesDeps;
  feedbackSpy: ReturnType<typeof vi.fn>;
} {
  const feedbackSpy = vi.fn(feedback);
  const deps = {
    gateway: {},
    routing: { complete: vi.fn(), feedback: feedbackSpy },
    catalog: {},
    ledger: {},
    providerKeys: {},
    keyCache: {},
    mw: fakeMiddleware,
  } as unknown as InferenceRoutesDeps;
  return { deps, feedbackSpy };
}

function startServer(deps: InferenceRoutesDeps): Promise<{ base: string; server: http.Server }> {
  const app = express();
  app.use(express.json());
  app.use(buildInferenceRouter(deps));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ base: `http://127.0.0.1:${port}`, server });
    });
  });
}

const VALID_BODY = { inferenceId: 'inf-1', metricName: 'task_success', value: true };

describe('POST /inference/feedback', () => {
  describe('routed (a feedback-capable tier is bound)', () => {
    let base: string;
    let server: http.Server;
    let feedbackSpy: ReturnType<typeof vi.fn>;

    beforeAll(async () => {
      const built = buildDeps(async (req) => ({
        routed: true,
        tier: 'napi',
        inferenceId: req.inferenceId,
        metricName: req.metricName,
        feedbackId: 'fb-route-1',
      }));
      feedbackSpy = built.feedbackSpy;
      ({ base, server } = await startServer(built.deps));
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it('returns a 200 success envelope with the real feedback_id and attributes the principal', async () => {
      const res = await request(base, '/inference/feedback', { method: 'POST', body: VALID_BODY });
      expect(res.status).toBe(200);
      expect(res.json()).toMatchObject({
        success: true,
        data: {
          result: { routed: true, tier: 'napi', inferenceId: 'inf-1', metricName: 'task_success', feedbackId: 'fb-route-1' },
        },
      });
      expect(feedbackSpy).toHaveBeenCalledWith({
        inferenceId: 'inf-1',
        metricName: 'task_success',
        value: true,
        userId: 'tester',
      });
    });

    it('rejects a malformed body with a 400 VALIDATION_ERROR before touching the ladder', async () => {
      const before = feedbackSpy.mock.calls.length;
      const res = await request(base, '/inference/feedback', {
        method: 'POST',
        body: { metricName: 'task_success', value: true }, // missing inferenceId
      });
      expect(res.status).toBe(400);
      expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
      expect(feedbackSpy.mock.calls.length).toBe(before);
    });
  });

  describe('cross-tenant ownership (feedback poisoning)', () => {
    /** Build a server whose principal + soloMode are configurable per test. */
    function buildOwnershipServer(opts: {
      principal: Partial<Principal>;
      soloMode?: boolean;
      feedback: (req: FeedbackRequest) => Promise<FeedbackResult>;
    }): Promise<{ base: string; server: http.Server; feedbackSpy: ReturnType<typeof vi.fn> }> {
      const feedbackSpy = vi.fn(opts.feedback);
      const auth: RequestHandler = (req, _res, next) => {
        req.principal = opts.principal as unknown as Principal;
        next();
      };
      const mw = { authenticate: auth, authenticateMutating: auth } as unknown as AuthMiddleware;
      const deps = {
        gateway: {},
        routing: { complete: vi.fn(), feedback: feedbackSpy },
        catalog: {},
        ledger: {},
        providerKeys: {},
        keyCache: {},
        mw,
        soloMode: opts.soloMode ?? false,
      } as unknown as InferenceRoutesDeps;
      return startServer(deps).then(({ base, server }) => ({ base, server, feedbackSpy }));
    }

    const notFoundFeedback = async (req: FeedbackRequest): Promise<FeedbackResult> => ({
      routed: false,
      tier: 'none',
      inferenceId: req.inferenceId,
      metricName: req.metricName,
      reason: 'inference not found',
      denied: 'not_found',
    });

    it("maps an ownership refusal (denied:'not_found') to a no-oracle 404 NOT_FOUND", async () => {
      const { base, server } = await buildOwnershipServer({
        principal: { userId: 'tenant-B', isAnonymous: false, scopes: [], kind: 'session' },
        feedback: notFoundFeedback,
      });
      try {
        const res = await request(base, '/inference/feedback', { method: 'POST', body: VALID_BODY });
        expect(res.status).toBe(404);
        expect(res.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });

    it('does NOT set bypass for an ordinary session principal (ownership is enforced downstream)', async () => {
      const { base, server, feedbackSpy } = await buildOwnershipServer({
        principal: { userId: 'tenant-B', isAnonymous: false, scopes: [], kind: 'session' },
        feedback: notFoundFeedback,
      });
      try {
        await request(base, '/inference/feedback', { method: 'POST', body: VALID_BODY });
        expect(feedbackSpy.mock.calls[0]?.[0]).not.toMatchObject({ bypassOwnershipCheck: true });
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });

    it('sets bypass=true for an admin-scoped principal (operator path)', async () => {
      const routed = async (req: FeedbackRequest): Promise<FeedbackResult> => ({
        routed: true,
        tier: 'napi',
        inferenceId: req.inferenceId,
        metricName: req.metricName,
        feedbackId: 'fb-admin',
      });
      const { base, server, feedbackSpy } = await buildOwnershipServer({
        principal: { userId: 'op', isAnonymous: false, scopes: ['admin'], kind: 'session' },
        feedback: routed,
      });
      try {
        const res = await request(base, '/inference/feedback', { method: 'POST', body: VALID_BODY });
        expect(res.status).toBe(200);
        expect(feedbackSpy).toHaveBeenCalledWith(expect.objectContaining({ bypassOwnershipCheck: true, userId: 'op' }));
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });

    it('sets bypass=true for an internal-kind principal (service-to-service)', async () => {
      const routed = async (req: FeedbackRequest): Promise<FeedbackResult> => ({
        routed: true,
        tier: 'napi',
        inferenceId: req.inferenceId,
        metricName: req.metricName,
        feedbackId: 'fb-int',
      });
      const { base, server, feedbackSpy } = await buildOwnershipServer({
        principal: { userId: 'svc', isAnonymous: false, scopes: [], kind: 'internal' },
        feedback: routed,
      });
      try {
        await request(base, '/inference/feedback', { method: 'POST', body: VALID_BODY });
        expect(feedbackSpy).toHaveBeenCalledWith(expect.objectContaining({ bypassOwnershipCheck: true }));
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });

    it('sets bypass=true in RECODER_SOLO_MODE (single local desktop owner fails open)', async () => {
      const routed = async (req: FeedbackRequest): Promise<FeedbackResult> => ({
        routed: true,
        tier: 'napi',
        inferenceId: req.inferenceId,
        metricName: req.metricName,
        feedbackId: 'fb-solo',
      });
      const { base, server, feedbackSpy } = await buildOwnershipServer({
        principal: { userId: 'local', isAnonymous: false, scopes: [], kind: 'session' },
        soloMode: true,
        feedback: routed,
      });
      try {
        await request(base, '/inference/feedback', { method: 'POST', body: VALID_BODY });
        expect(feedbackSpy).toHaveBeenCalledWith(expect.objectContaining({ bypassOwnershipCheck: true }));
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });
  });

  describe('declined (no feedback-capable tier)', () => {
    let base: string;
    let server: http.Server;

    beforeAll(async () => {
      const built = buildDeps(async (req) => ({
        routed: false,
        tier: 'none',
        inferenceId: req.inferenceId,
        metricName: req.metricName,
        reason: 'no feedback-capable tier available',
      }));
      ({ base, server } = await startServer(built.deps));
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it('returns a truthful 503 SERVICE_UNAVAILABLE (never a faked accept)', async () => {
      const res = await request(base, '/inference/feedback', { method: 'POST', body: VALID_BODY });
      expect(res.status).toBe(503);
      expect(res.json()).toMatchObject({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'no feedback-capable tier available' },
      });
    });
  });
});
