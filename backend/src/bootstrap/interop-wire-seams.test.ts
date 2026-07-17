/**
 * Composition-root seam tests for the bootstrap → interop-wire wiring
 * (`interop-wire-seams.ts`): the conductor `localRun` dispatch adapter and the
 * outbound `remoteSender`. Both must be DEGRADE-TRUTHFUL — a refused launch, a
 * peer with no url, a non-2xx response, and a network/timeout fault each surface
 * as `ok:false` with a real reason, never a fabricated run id or a faked send.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createLocalRunDispatch,
  createRemoteEnvelopeSender,
  type ConductorCreateWorkspacePort,
  type EnvelopeFetch,
} from './interop-wire-seams.js';
import type { AgentRow, EgressEnvelope } from '../domains/interop-wire/types.js';

const REPO_ROOT = '/tmp/repo';

function agent(id: string, url?: string): AgentRow {
  return {
    id,
    userId: 'user-1',
    kind: 'remote_a2a',
    card: { id, name: id, capabilities: [], ...(url ? { url } : {}) },
    status: 'unknown',
  };
}

function sealed(): EgressEnvelope {
  return {
    envelope: {
      id: 'e1',
      from: 'user-1',
      kind: 'message',
      payload: { text: 'hi' },
      createdAt: new Date().toISOString(),
    },
    signature: 'sig-abc',
    keyId: 'key-1',
  };
}

describe('createLocalRunDispatch (conductor createWorkspace seam)', () => {
  it('launches a real governed run and returns the truthful run id', async () => {
    const createWorkspace = vi.fn(async () => ({
      ok: true,
      value: { workspaceId: 'ws-1', runId: 'run-1' },
    }));
    const conductor: ConductorCreateWorkspacePort = { createWorkspace };
    const localRun = createLocalRunDispatch({ conductor, repoRoot: REPO_ROOT, now: () => 42 });

    const res = await localRun.launch({
      runtimeId: 'claude_code',
      userId: 'user-1',
      prompt: 'do the thing',
      correlationId: 'corr-9',
    });

    expect(res).toEqual({ ok: true, runId: 'run-1' });
    // The correlation id becomes the task id; the subject is an internal principal.
    expect(createWorkspace).toHaveBeenCalledTimes(1);
    const [input, principal] = createWorkspace.mock.calls[0]!;
    expect(input).toMatchObject({
      spaceId: 'space-default',
      projectId: 'a2a-claude_code',
      taskId: 'corr-9',
      repoPath: REPO_ROOT,
      runtimeId: 'claude_code',
      prompt: 'do the thing',
    });
    expect(principal).toMatchObject({ userId: 'user-1', kind: 'internal' });
  });

  it('synthesizes a unique task id when no correlation id is provided', async () => {
    const createWorkspace = vi.fn(async () => ({ ok: true, value: { workspaceId: 'ws-1' } }));
    const localRun = createLocalRunDispatch({
      conductor: { createWorkspace },
      repoRoot: REPO_ROOT,
      now: () => 255,
    });

    const res = await localRun.launch({ runtimeId: 'codex', userId: 'user-1', prompt: 'x' });

    // No runId in the workspace ⇒ ok:true with no fabricated runId.
    expect(res).toEqual({ ok: true });
    expect(createWorkspace.mock.calls[0]![0].taskId).toBe(`a2a-codex-${(255).toString(36)}`);
  });

  it('reports the conductor refusal reason truthfully (no fabricated run)', async () => {
    const localRun = createLocalRunDispatch({
      conductor: {
        createWorkspace: async () => ({ ok: false, reason: 'quota_exceeded' }),
      },
      repoRoot: REPO_ROOT,
    });

    const res = await localRun.launch({ runtimeId: 'claude_code', userId: 'user-1', prompt: 'x' });
    expect(res).toEqual({ ok: false, error: 'quota_exceeded' });
  });

  it('treats an ok:true with a null value as a truthful failure', async () => {
    const localRun = createLocalRunDispatch({
      conductor: { createWorkspace: async () => ({ ok: true, value: null }) },
      repoRoot: REPO_ROOT,
    });

    const res = await localRun.launch({ runtimeId: 'claude_code', userId: 'user-1', prompt: 'x' });
    expect(res.ok).toBe(false);
    expect(res.runId).toBeUndefined();
  });
});

describe('createRemoteEnvelopeSender (outbound A2A peer delivery)', () => {
  it('POSTs the sealed envelope to the peer card.url with signature headers', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    const sender = createRemoteEnvelopeSender({ fetch: fetch as unknown as EnvelopeFetch });

    const res = await sender.send(agent('peer-1', 'https://peer.example/a2a'), sealed());

    expect(res).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://peer.example/a2a');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers['x-a2a-signature']).toBe('sig-abc');
    expect(init.headers['x-a2a-key-id']).toBe('key-1');
    expect(JSON.parse(init.body)).toMatchObject({ id: 'e1', kind: 'message' });
  });

  it('refuses truthfully when the peer advertises no http(s) url', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    const sender = createRemoteEnvelopeSender({ fetch: fetch as unknown as EnvelopeFetch });

    const noUrl = await sender.send(agent('peer-2'), sealed());
    expect(noUrl.ok).toBe(false);
    expect(noUrl.error).toContain('no http(s) card.url');

    const badScheme = await sender.send(agent('peer-3', 'ftp://peer/x'), sealed());
    expect(badScheme.ok).toBe(false);

    // Never attempted the fetch on a non-deliverable target.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports a non-2xx peer response truthfully', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 503 }));
    const sender = createRemoteEnvelopeSender({ fetch: fetch as unknown as EnvelopeFetch });

    const res = await sender.send(agent('peer-4', 'https://peer/x'), sealed());
    expect(res.ok).toBe(false);
    expect(res.error).toContain('503');
  });

  it('reports a network/timeout fault truthfully (never a faked send)', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const sender = createRemoteEnvelopeSender({ fetch: fetch as unknown as EnvelopeFetch });

    const res = await sender.send(agent('peer-5', 'https://peer/x'), sealed());
    expect(res).toEqual({ ok: false, error: 'ECONNREFUSED' });
  });

  it('omits signature headers when the envelope is unsigned', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 202 }));
    const sender = createRemoteEnvelopeSender({ fetch: fetch as unknown as EnvelopeFetch });

    const unsigned: EgressEnvelope = { envelope: sealed().envelope };
    await sender.send(agent('peer-6', 'https://peer/x'), unsigned);

    const [, init] = fetch.mock.calls[0]!;
    expect(init.headers['x-a2a-signature']).toBeUndefined();
    expect(init.headers['x-a2a-key-id']).toBeUndefined();
  });
});
