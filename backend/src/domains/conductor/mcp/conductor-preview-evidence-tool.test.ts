/**
 * Conductor preview-verify + evidence-attach MCP tool (BE-6.2).
 *
 * Proves: the tool registers exactly `conductor_preview_verify`; it BINDS the acting
 * identity to the HOST-AUTHORIZED caller (never a free-form `args.userId`) and passes
 * an `apikey` principal (never `kind:'internal'`); an absent caller / mismatched
 * non-privileged `userId` is refused BEFORE any module call; `workspaceId` is
 * required; caller-supplied verify options (assertions / screenshot / timeoutMs) are
 * parsed and forwarded; a non-`allow` verdict flows back as `{ ok:false, gated:true }`
 * with NO evidence; and an allowed run returns the SIGNED evidence pack as `value`.
 */
import { describe, it, expect } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import type { GateVerdict } from '../ports/index.js';
import type { ConductorWriteResult } from '../conductor-module.js';
import type { PreviewVerifyOptions } from '../services/preview-verify.service.js';
import type { PreviewEvidencePack } from '../evidence/preview-evidence.js';
import {
  buildConductorPreviewEvidenceTools,
  type ConductorPreviewEvidenceSurface,
} from './conductor-write-tools.js';

function caller(userId: string, scopes: readonly string[] = ['read', 'write']): McpToolCaller {
  return { userId, scopes };
}

function verdict(effect: GateVerdict['effect']): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect,
    tier: 'low',
    reason: effect === 'allow' ? 'allowed' : `${effect} by policy`,
    degraded: false,
    engine: 'ts',
    createdAt: new Date().toISOString(),
  };
}

const SIGNED_PACK: PreviewEvidencePack = {
  schema: 'recoder.preview-evidence/v1',
  subject: { workspaceId: 'ws-1', url: 'http://127.0.0.1:5173/' },
  status: 'passed',
  degraded: false,
  summary: 'preview verified',
  checks: [{ tool: 'assert', status: 'passed' }],
  artifactIds: ['art-1'],
  generatedAt: '2026-08-01T00:00:00.000Z',
  contentHash: 'a'.repeat(64),
  signature: {
    algorithm: 'ed25519',
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nx\n-----END PUBLIC KEY-----\n',
    signedContentHash: 'a'.repeat(64),
    signature: 'sig',
    signedAt: '2026-08-01T00:00:00.000Z',
  },
};

interface Recorded {
  calls: { id: string; principal: Principal; options?: PreviewVerifyOptions }[];
}

function makeSurface(effect: GateVerdict['effect'] = 'allow'): {
  surface: ConductorPreviewEvidenceSurface;
  rec: Recorded;
} {
  const rec: Recorded = { calls: [] };
  const allowed = effect === 'allow';
  const surface: ConductorPreviewEvidenceSurface = {
    async attachPreviewEvidence(id, principal, options) {
      rec.calls.push({ id, principal, ...(options ? { options } : {}) });
      const result: ConductorWriteResult<PreviewEvidencePack> = {
        ok: allowed,
        verdict: verdict(effect),
        ...(allowed ? { value: SIGNED_PACK } : { reason: `${effect} by policy` }),
      };
      return result;
    },
  };
  return { surface, rec };
}

function tool(surface: ConductorPreviewEvidenceSurface) {
  const t = buildConductorPreviewEvidenceTools(surface).find((x) => x.name === 'conductor_preview_verify');
  if (!t) throw new Error('conductor_preview_verify not found');
  return t;
}

describe('conductor_preview_verify MCP tool', () => {
  it('registers exactly the preview-verify tool', () => {
    const { surface } = makeSurface();
    expect(buildConductorPreviewEvidenceTools(surface).map((t) => t.name)).toEqual([
      'conductor_preview_verify',
    ]);
  });

  it('binds to the authenticated caller and returns the SIGNED evidence pack', async () => {
    const { surface, rec } = makeSurface('allow');
    const res = (await tool(surface).handler(
      { workspaceId: 'ws-1' },
      caller('user-a'),
    )) as Record<string, unknown>;

    expect(res.ok).toBe(true);
    expect(res.gated).toBe(false);
    expect(res.value).toEqual(SIGNED_PACK);
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.id).toBe('ws-1');
    // The gate principal is the edge-bound caller — apikey, never a forged kind:internal.
    expect(rec.calls[0]?.principal).toMatchObject({ userId: 'user-a', kind: 'apikey', isAnonymous: false });
  });

  it('parses + forwards caller-supplied verify options', async () => {
    const { surface, rec } = makeSurface('allow');
    await tool(surface).handler(
      {
        workspaceId: 'ws-1',
        assertions: [{ expected: 'Hello', target: 'h1' }, { expected: '  ' }, 'junk'],
        screenshot: false,
        timeoutMs: 5000,
      },
      caller('user-a'),
    );
    expect(rec.calls[0]?.options).toEqual({
      assertions: [{ expected: 'Hello', target: 'h1' }],
      screenshot: false,
      timeoutMs: 5000,
    });
  });

  it('drops invalid options (negative timeout, empty assertions) rather than forwarding them', async () => {
    const { surface, rec } = makeSurface('allow');
    await tool(surface).handler(
      { workspaceId: 'ws-1', assertions: [], timeoutMs: -1, screenshot: 'yes' },
      caller('user-a'),
    );
    expect(rec.calls[0]?.options).toEqual({});
  });

  it('refuses an absent caller BEFORE any module call', async () => {
    const { surface, rec } = makeSurface('allow');
    const res = (await tool(surface).handler({ workspaceId: 'ws-1' }, undefined)) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/authenticated caller/);
    expect(rec.calls).toHaveLength(0);
  });

  it('refuses a non-privileged caller naming a MISMATCHED userId', async () => {
    const { surface, rec } = makeSurface('allow');
    const res = (await tool(surface).handler(
      { workspaceId: 'ws-1', userId: 'victim' },
      caller('user-a'),
    )) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/own userId/);
    expect(rec.calls).toHaveLength(0);
  });

  it('requires workspaceId', async () => {
    const { surface, rec } = makeSurface('allow');
    const res = (await tool(surface).handler({}, caller('user-a'))) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/workspaceId is required/);
    expect(rec.calls).toHaveLength(0);
  });

  it('a non-allow verdict flows back as gated with NO evidence', async () => {
    const { surface } = makeSurface('deny');
    const res = (await tool(surface).handler(
      { workspaceId: 'ws-1' },
      caller('user-a'),
    )) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.gated).toBe(true);
    expect(res.value).toBeUndefined();
  });
});
