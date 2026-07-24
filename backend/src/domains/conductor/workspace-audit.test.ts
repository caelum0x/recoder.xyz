/**
 * Workspace audit read seam (increment-2 close) — the READ half of the
 * merge→audit seam. `recordAudit` seals every conductor mutation with the
 * `workspaceId` in payload; `GET …/audit` (module `workspaceAudit`) returns that
 * durable, queryable trail. Proves:
 *  - `createConductorAuditReader` forwards `{ workspaceId, limit }` to the
 *    governance audit `range` seam and returns the sealed records unchanged;
 *  - a missing `limit` is omitted (never a fabricated bound);
 *  - `module.workspaceAudit` returns the reader's records when wired, and a
 *    truthful EMPTY trail (never a fabricated record) when no reader is injected.
 */
import { describe, expect, it } from 'vitest';
import { createConductorAuditReader, type AuditRangeSource } from './adapters/audit-reader.adapter.js';
import type { AuditRecord } from './ports/index.js';
import { createConductorModule } from './index.js';
import {
  FakeSubstrate,
  makeConfig,
  makeExecutor,
  makeGate,
  makeLogger,
  makeMiddleware,
} from './__fixtures__/harness.js';

function auditRow(id: string, seq: number, workspaceId: string): AuditRecord {
  return {
    id,
    seq,
    prevHash: '0'.repeat(64),
    entryHash: 'h'.repeat(64),
    actorId: 'user_test',
    action: 'workspace.merge',
    resource: 'conductor',
    effect: 'allow',
    riskTier: 'low',
    degraded: false,
    payload: { workspaceId, merged: true },
    createdAt: new Date().toISOString(),
  };
}

function makeModule(auditReader?: ReturnType<typeof createConductorAuditReader>) {
  return createConductorModule({
    config: makeConfig(),
    logger: makeLogger(),
    executor: makeExecutor(false),
    middleware: makeMiddleware(),
    gate: makeGate('allow'),
    substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
    ...(auditReader ? { auditReader } : {}),
  });
}

describe('conductor workspace audit read seam', () => {
  it('createConductorAuditReader forwards workspaceId + limit to range', async () => {
    const sealed = [auditRow('audit_1', 1, 'ws_1')];
    const calls: Array<{ workspaceId?: string; limit?: number }> = [];
    const source: AuditRangeSource = {
      async range(query) {
        calls.push(query);
        return sealed;
      },
    };
    const reader = createConductorAuditReader(source);

    const rows = await reader.byWorkspace('ws_1', 25);

    expect(calls).toEqual([{ workspaceId: 'ws_1', limit: 25 }]);
    expect(rows).toEqual(sealed);
  });

  it('omits limit when not given (no fabricated bound)', async () => {
    const calls: Array<{ workspaceId?: string; limit?: number }> = [];
    const source: AuditRangeSource = {
      async range(query) {
        calls.push(query);
        return [];
      },
    };

    await createConductorAuditReader(source).byWorkspace('ws_2');

    expect(calls).toEqual([{ workspaceId: 'ws_2' }]);
  });

  it('workspaceAudit returns the sealed trail when a reader is wired', async () => {
    const rows = [auditRow('audit_1', 1, 'ws_3'), auditRow('audit_2', 2, 'ws_3')];
    const source: AuditRangeSource = {
      async range(query) {
        return query.workspaceId === 'ws_3' ? rows : [];
      },
    };
    const module = makeModule(createConductorAuditReader(source));

    expect(await module.workspaceAudit('ws_3')).toEqual(rows);
    expect(await module.workspaceAudit('other')).toEqual([]);
  });

  it('workspaceAudit degrades to an empty trail with no reader wired', async () => {
    const module = makeModule();

    expect(await module.workspaceAudit('ws_4')).toEqual([]);
  });
});
