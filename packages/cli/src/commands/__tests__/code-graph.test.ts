/**
 * Unit tests for the `code-graph` command handlers.
 *
 * A fake api client is injected so we can assert each subcommand hits the right
 * path + method, renders output, and handles {enabled:false} and auth errors —
 * without any real HTTP or device-flow auth. The handlers are tested directly
 * (commander parsing is exercised elsewhere via the spawned-CLI integration
 * tests; constructing commander in-process is unreliable under this jest setup).
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// recoder-shared's Logger pulls in winston, which is only partially mocked in
// test-setup; stub it so the import is side-effect free.
jest.mock('recoder-shared', () => ({
  Logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Avoid instantiating the real axios-backed apiClient singleton at import time
// (axios is auto-mocked in test-setup). We inject a fake client into every test.
jest.mock('../../services/api', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

// ora's default export is unreliable under this jest's module interop; stub it
// with a chainable no-op spinner so handler output goes through console only.
jest.mock('ora', () => {
  const spinner: any = {};
  ['start', 'succeed', 'fail', 'info', 'warn', 'stop'].forEach((m) => {
    spinner[m] = () => spinner;
  });
  return () => spinner;
});

// chalk color helpers -> identity, so asserted substrings aren't wrapped in
// ANSI codes (and so chalk's default export quirk under jest is sidestepped).
jest.mock('chalk', () => {
  const identity = (s: unknown) => String(s);
  return new Proxy(identity, {
    get: (_target, prop) => (prop === '__esModule' ? false : identity),
  });
});

import {
  runConnect,
  runRepos,
  runStatus,
  runDomainMap,
  CodeGraphApiClient,
  CodeGraphApiResponse,
} from '../code-graph';

const BASE = '/api/agent-os/code-graph';

// Models the REAL wire shape: the CLI apiClient sets ApiResponse.data to the raw
// HTTP body, which is itself the backend envelope { success, data: PAYLOAD } — so
// a successful response is DOUBLE-wrapped. (A single-wrap fake previously hid a
// field-nesting bug where every handler read one level too shallow; this contract
// shape is what catches it.)
function ok<T>(payload: T): CodeGraphApiResponse<{ success: boolean; data: T }> {
  return { success: true, data: { success: true, data: payload } };
}

function fail(code: string, message = 'error'): CodeGraphApiResponse {
  return { success: false, error: { code, message } };
}

interface FakeClient extends CodeGraphApiClient {
  get: jest.Mock;
  post: jest.Mock;
}

function makeFakeClient(): FakeClient {
  return { get: jest.fn(), post: jest.fn() } as unknown as FakeClient;
}

describe('code-graph handlers', () => {
  let logSpy: jest.SpiedFunction<typeof console.log>;
  let errorSpy: jest.SpiedFunction<typeof console.error>;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  function output(): string {
    const fromLog = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const fromErr = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    return `${fromLog}\n${fromErr}`;
  }

  // -------------------------------------------------------------------------
  // connect -> POST /connect
  // -------------------------------------------------------------------------
  describe('connect', () => {
    test('POSTs to /connect with repo + ref and renders repoId/nodes/edges', async () => {
      const client = makeFakeClient();
      client.post.mockResolvedValue(ok({ repoId: 'repo_123', status: 'indexed', nodes: 42, edges: 99 }));

      await runConnect(client, 'acme/widgets', { ref: 'main' });

      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.post).toHaveBeenCalledWith(`${BASE}/connect`, { repo: 'acme/widgets', ref: 'main' });
      const out = output();
      expect(out).toContain('repo_123');
      expect(out).toContain('42');
      expect(out).toContain('99');
    });

    test('omits ref from body when not provided', async () => {
      const client = makeFakeClient();
      client.post.mockResolvedValue(ok({ repoId: 'r1', status: 'indexed', nodes: 1, edges: 0 }));

      await runConnect(client, 'acme/widgets', {});

      expect(client.post).toHaveBeenCalledWith(`${BASE}/connect`, { repo: 'acme/widgets' });
    });

    test('handles {enabled:false} gracefully without a failure exit code', async () => {
      const client = makeFakeClient();
      client.post.mockResolvedValue(ok({ enabled: false }));

      await runConnect(client, 'acme/widgets', {});

      expect(output()).toContain('RECODER_CODE_GRAPH_ENABLED');
      expect(process.exitCode).not.toBe(1);
    });

    test('handles 401 with a login prompt and non-zero exit code', async () => {
      const client = makeFakeClient();
      client.post.mockResolvedValue(fail('UNAUTHORIZED', 'Authentication required'));

      await runConnect(client, 'acme/widgets', {});

      expect(output()).toContain('recoder auth login');
      expect(process.exitCode).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // repos -> GET /repos
  // -------------------------------------------------------------------------
  describe('repos', () => {
    test('GETs /repos and renders a row per repo', async () => {
      const client = makeFakeClient();
      client.get.mockResolvedValue(
        ok({
          repos: [
            { repoId: 'repo_a', branch: 'main', status: 'indexed', nodes: 10, edges: 5 },
            { repoId: 'repo_b', branch: 'dev', status: 'stale', nodes: 3, edges: 1 },
          ],
        })
      );

      await runRepos(client, {});

      expect(client.get).toHaveBeenCalledWith(`${BASE}/repos`);
      const out = output();
      expect(out).toContain('repo_a');
      expect(out).toContain('repo_b');
    });

    test('handles an empty repo list', async () => {
      const client = makeFakeClient();
      client.get.mockResolvedValue(ok({ repos: [] }));

      await runRepos(client, {});

      expect(output().toLowerCase()).toContain('no repositories');
    });

    test('handles {enabled:false}', async () => {
      const client = makeFakeClient();
      client.get.mockResolvedValue(ok({ enabled: false }));

      await runRepos(client, {});

      expect(output()).toContain('RECODER_CODE_GRAPH_ENABLED');
    });

    test('handles auth error', async () => {
      const client = makeFakeClient();
      client.get.mockResolvedValue(fail('AUTH_REQUIRED'));

      await runRepos(client, {});

      expect(output()).toContain('recoder auth login');
      expect(process.exitCode).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // status -> GET /:repoId/status
  // -------------------------------------------------------------------------
  describe('status', () => {
    test('GETs /:repoId/status and reports the index state truthfully', async () => {
      const client = makeFakeClient();
      // Real status payload: { status, state } — counts/repoId live under `state`.
      client.get.mockResolvedValue(
        ok({ status: 'indexed', state: { repoId: 'repo_x', nodes: 7, edges: 12, indexedAt: '2026-06-26' } })
      );

      await runStatus(client, 'repo_x', {});

      expect(client.get).toHaveBeenCalledWith(`${BASE}/repo_x/status`);
      const out = output();
      expect(out).toContain('indexed');
      expect(out).toContain('repo_x');
      expect(out).toContain('7'); // nodes resolved from state, not 0
      expect(out).toContain('12'); // edges resolved from state, not 0
    });

    test('handles {enabled:false}', async () => {
      const client = makeFakeClient();
      client.get.mockResolvedValue(ok({ enabled: false }));

      await runStatus(client, 'repo_x', {});

      expect(output()).toContain('RECODER_CODE_GRAPH_ENABLED');
    });

    test('handles auth error', async () => {
      const client = makeFakeClient();
      client.get.mockResolvedValue(fail('UNAUTHORIZED'));

      await runStatus(client, 'repo_x', {});

      expect(output()).toContain('recoder auth login');
      expect(process.exitCode).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // domain-map -> GET /:repoId/domain-map
  // -------------------------------------------------------------------------
  describe('domain-map', () => {
    test('GETs /:repoId/domain-map and renders domains', async () => {
      const client = makeFakeClient();
      // Real domain-map payload: { enabled, map: { domains, ... } }.
      client.get.mockResolvedValue(
        ok({
          map: {
            repoId: 'repo_y',
            domains: [
              { name: 'billing', files: 12, description: 'payments' },
              { name: 'auth', files: 8, description: 'sessions' },
            ],
          },
        })
      );

      await runDomainMap(client, 'repo_y', {});

      expect(client.get).toHaveBeenCalledWith(`${BASE}/repo_y/domain-map`);
      const out = output();
      expect(out).toContain('billing');
      expect(out).toContain('auth');
    });

    test('handles {enabled:false}', async () => {
      const client = makeFakeClient();
      client.get.mockResolvedValue(ok({ enabled: false }));

      await runDomainMap(client, 'repo_y', {});

      expect(output()).toContain('RECODER_CODE_GRAPH_ENABLED');
    });

    test('handles auth error', async () => {
      const client = makeFakeClient();
      client.get.mockResolvedValue(fail('AUTH_REQUIRED'));

      await runDomainMap(client, 'repo_y', {});

      expect(output()).toContain('recoder auth login');
      expect(process.exitCode).toBe(1);
    });
  });
});
