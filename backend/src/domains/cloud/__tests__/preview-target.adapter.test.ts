/**
 * `createPreviewTarget` — the default preview DeployTarget. Fake-fetch driven
 * (no real network/DNS on the box). Proves the honest-posture branches:
 *  - absent base domain ⇒ `available()` false AND `deploy` ⇒ Err(SERVICE_UNAVAILABLE),
 *  - a configured deploy allocates a per-deployment URL under the base domain and
 *    registers the artifact as `building` (never a faked `live`),
 *  - `ttlSeconds` mints an `expiresAt`; a null/absent ttl leaves it null,
 *  - `probe` maps the REAL observed HTTP status truthfully: 2xx/3xx ⇒ healthy,
 *    4xx/5xx ⇒ unhealthy, a connect failure (`status: null`) ⇒ unhealthy,
 *  - a deployment with no preview URL is `unknown` and is NEVER probed.
 */
import { describe, it, expect, vi } from 'vitest';
import { createPreviewTarget } from '../adapters/preview-target.adapter.js';
import { sliceCloudConfig, type CloudConfigOverrides } from '../config.js';
import type { FetchLike, HttpResponse } from '../adapters/http.js';
import type { DeployInput } from '../ports/deploy-target.port.js';
import type { Deployment } from '../types.js';
import { isErr, isOk } from '../../../shared/result.js';
import { ErrorCode } from '../../../shared/errors.js';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<typeof sliceCloudConfig>[0];
const NOW = () => new Date('2026-08-11T00:00:00.000Z');

function config(overrides: CloudConfigOverrides = {}) {
  return sliceCloudConfig(appConfig, overrides);
}

function response(status: number): HttpResponse {
  return { ok: status >= 200 && status < 300, status, text: async () => '', json: async () => ({}) };
}

const DEPLOY_INPUT: DeployInput = { tenantId: 'tnt_1', target: 'preview' };

describe('createPreviewTarget — availability + deploy gating', () => {
  it('is unavailable and refuses to deploy when no base domain is configured', async () => {
    const target = createPreviewTarget({ config: config(), logger, fetchLike: null, now: NOW });

    expect(await target.available()).toBe(false);
    const res = await target.deploy(DEPLOY_INPUT);
    expect(isErr(res)).toBe(true);
    if (isErr(res)) expect(res.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it('is available once a base domain is configured', async () => {
    const target = createPreviewTarget({
      config: config({ previewBaseDomain: 'preview.recoder.xyz' }),
      logger,
      fetchLike: null,
      now: NOW,
    });
    expect(await target.available()).toBe(true);
  });

  it('allocates a URL under the base domain and registers the artifact as building', async () => {
    const target = createPreviewTarget({
      config: config({ previewBaseDomain: 'preview.recoder.xyz' }),
      logger,
      fetchLike: null,
      now: NOW,
    });

    const res = await target.deploy({ tenantId: 'tnt_1', target: 'preview', runId: 'run_9', commitSha: 'abc123' });
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    const d = res.value;
    expect(d.status).toBe('building');
    expect(d.healthStatus).toBe('unknown');
    expect(d.previewBaseUrl).toMatch(/^https:\/\/[0-9a-f-]+\.preview\.recoder\.xyz$/);
    expect(d.tenantId).toBe('tnt_1');
    expect(d.runId).toBe('run_9');
    expect(d.commitSha).toBe('abc123');
    expect(d.expiresAt).toBeNull(); // no ttl ⇒ no expiry fabricated
  });

  it('mints an expiresAt from ttlSeconds relative to now', async () => {
    const target = createPreviewTarget({
      config: config({ previewBaseDomain: 'preview.recoder.xyz' }),
      logger,
      fetchLike: null,
      now: NOW,
    });

    const res = await target.deploy({ tenantId: 'tnt_1', target: 'preview', ttlSeconds: 3600 });
    if (!isOk(res)) throw new Error('expected ok');
    expect(res.value.expiresAt).toBe('2026-08-11T01:00:00.000Z');
  });

  it('leaves expiresAt null for a non-positive ttl (never fabricated)', async () => {
    const target = createPreviewTarget({
      config: config({ previewBaseDomain: 'preview.recoder.xyz' }),
      logger,
      fetchLike: null,
      now: NOW,
    });

    const res = await target.deploy({ tenantId: 'tnt_1', target: 'preview', ttlSeconds: 0 });
    if (!isOk(res)) throw new Error('expected ok');
    expect(res.value.expiresAt).toBeNull();
  });
});

function deployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: 'dep_1',
    tenantId: 'tnt_1',
    sandboxId: null,
    runId: null,
    target: 'preview',
    status: 'building',
    commitSha: null,
    previewBaseUrl: 'https://dep_1.preview.recoder.xyz',
    healthStatus: 'unknown',
    lastHealthAt: null,
    createdAt: '2026-08-11T00:00:00.000Z',
    expiresAt: null,
    ...over,
  };
}

describe('createPreviewTarget — truthful probe mapping', () => {
  it('reports healthy on a real 200 and carries the observed HTTP status', async () => {
    const fetchLike: FetchLike = vi.fn(async () => response(200));
    const target = createPreviewTarget({
      config: config({ previewBaseDomain: 'preview.recoder.xyz' }),
      logger,
      fetchLike,
      now: NOW,
    });

    const health = await target.probe(deployment());
    expect(health.status).toBe('healthy');
    expect(health.httpStatus).toBe(200);
    expect(fetchLike).toHaveBeenCalledTimes(1);
  });

  it('treats a 3xx redirect as healthy (2xx–3xx window)', async () => {
    const fetchLike: FetchLike = async () => response(302);
    const target = createPreviewTarget({
      config: config({ previewBaseDomain: 'preview.recoder.xyz' }),
      logger,
      fetchLike,
      now: NOW,
    });
    const health = await target.probe(deployment());
    expect(health.status).toBe('healthy');
    expect(health.httpStatus).toBe(302);
  });

  it('reports unhealthy on a 5xx (never inferred healthy from a bare 200)', async () => {
    const fetchLike: FetchLike = async () => response(503);
    const target = createPreviewTarget({
      config: config({ previewBaseDomain: 'preview.recoder.xyz' }),
      logger,
      fetchLike,
      now: NOW,
    });
    const health = await target.probe(deployment());
    expect(health.status).toBe('unhealthy');
    expect(health.httpStatus).toBe(503);
  });

  it('reports unhealthy with a null status when the transport connect-fails', async () => {
    const fetchLike: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };
    const target = createPreviewTarget({
      config: config({ previewBaseDomain: 'preview.recoder.xyz' }),
      logger,
      fetchLike,
      now: NOW,
    });
    const health = await target.probe(deployment());
    expect(health.status).toBe('unhealthy');
    expect(health.httpStatus).toBeNull();
    expect(health.reason).toBe('ECONNREFUSED');
  });

  it('returns unknown WITHOUT probing when the deployment has no preview URL', async () => {
    const fetchLike: FetchLike = vi.fn(async () => response(200));
    const target = createPreviewTarget({
      config: config({ previewBaseDomain: 'preview.recoder.xyz' }),
      logger,
      fetchLike,
      now: NOW,
    });

    const health = await target.probe(deployment({ previewBaseUrl: null as unknown as string }));
    expect(health.status).toBe('unknown');
    expect(health.httpStatus).toBeNull();
    expect(health.reason).toBe('no preview URL');
    expect(fetchLike).not.toHaveBeenCalled();
  });
});
