/**
 * `CoworkerService` end-to-end unit test: propose → one-click approve → execute
 * → audit, and the human-veto path (deny stops the task cold). Uses the REAL
 * `ApprovalService` + `AuditChainService` over in-memory governance fakes (no
 * Postgres) so the test exercises the actual approval/audit contract, not a
 * mock of it — only the LLM proposer and the browser tool are faked.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApprovalService } from '../../governance/services/approval.service.js';
import { AuditChainService } from '../../governance/services/audit-chain.service.js';
import { InMemoryApprovalRepository, InMemoryAuditRepository, silentLogger } from '../../governance/__tests__/_fakes.js';
import { CoworkerService } from '../services/coworker.service.js';
import type { InferenceGatewayPort } from '../../inference/ports/inference-gateway.port.js';
import type { InferenceRequest, InferenceResult } from '../../inference/types.js';
import type { BrowserEngine } from '@recoder/agent-browser';

function fakeGateway(responses: string[]): InferenceGatewayPort {
  let i = 0;
  return {
    async complete(_req: InferenceRequest): Promise<InferenceResult> {
      const content = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return { routed: true, tier: 'router', model: 'test/fake', content };
    },
    async completeStream() {
      throw new Error('not used in this test');
    },
    async embed() {
      throw new Error('not used in this test');
    },
    async feedback() {
      return { routed: false, reason: 'not used in this test' };
    },
    async health() {
      return { tier: 'router', status: 'up', degraded: false };
    },
  } as unknown as InferenceGatewayPort;
}

function unavailableBrowser(): BrowserEngine {
  return {
    async navigate() {
      return { status: 'not_configured', reason: 'no browser driver in this test' };
    },
    async extractText() {
      return { status: 'not_configured', reason: 'no browser driver in this test' };
    },
    async screenshot() {
      return { status: 'not_configured', reason: 'no browser driver in this test' };
    },
  };
}

describe('CoworkerService — propose → approve → execute → audit', () => {
  let sandboxRoot: string;

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'coworker-test-'));
  });

  afterEach(async () => {
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  function build(responses: string[]) {
    const auditRepo = new InMemoryAuditRepository();
    const audit = new AuditChainService(auditRepo);
    const approvals = new ApprovalService({
      repo: new InMemoryApprovalRepository(),
      logger: silentLogger,
      audit: { recordAudit: (e) => audit.append(e) },
    });
    const coworker = new CoworkerService({
      approvals,
      audit,
      gateway: fakeGateway(responses),
      browser: unavailableBrowser(),
      logger: silentLogger,
      sandboxRoot,
    });
    return { coworker, auditRepo };
  }

  it('writes a real file to the sandbox only after a human approves, then finishes', async () => {
    const { coworker, auditRepo } = build([
      JSON.stringify({ kind: 'write_file', path: 'hello.txt', content: 'hi', reason: 'create the file' }),
      JSON.stringify({ kind: 'finish', summary: 'done', reason: 'goal met' }),
    ]);

    const created = await coworker.createTask({ goal: 'write hello.txt', actorId: 'owner-1' });
    expect(created.status).toBe('awaiting_approval');
    expect(created.actions).toHaveLength(1);
    const pending = created.actions[0]!;
    expect(pending.kind).toBe('write_file');
    expect(pending.status).toBe('awaiting_approval');

    // Not yet written — approval has not been granted.
    await expect(readFile(path.join(sandboxRoot, created.id, 'hello.txt'), 'utf8')).rejects.toThrow();

    const afterApprove = await coworker.decideAction({
      taskId: created.id,
      actionId: pending.id,
      decision: 'approved',
      decidedBy: 'owner-1',
    });

    const fileContent = await readFile(path.join(sandboxRoot, created.id, 'hello.txt'), 'utf8');
    expect(fileContent).toBe('hi');
    expect(afterApprove.status).toBe('completed');
    expect(afterApprove.actions[0]!.status).toBe('executed');
    expect(afterApprove.actions[1]!.kind).toBe('finish');

    // Both the decision (allow) and the real execution outcome sealed into the
    // durable audit chain — "recorded after", not just "decided before".
    const sealedActions = auditRepo.rows.filter((r) => r.resource.includes(created.id));
    expect(sealedActions.some((r) => r.payload['phase'] === 'decision')).toBe(true);
    expect(sealedActions.some((r) => r.payload['phase'] === 'execution')).toBe(true);
  });

  it('a human denial stops the task cold and never touches the filesystem', async () => {
    const { coworker } = build([
      JSON.stringify({ kind: 'shell', command: 'echo should-not-run > touched.txt', reason: 'test' }),
    ]);

    const created = await coworker.createTask({ goal: 'do something risky', actorId: 'owner-1' });
    const pending = created.actions[0]!;

    const afterDeny = await coworker.decideAction({
      taskId: created.id,
      actionId: pending.id,
      decision: 'denied',
      decidedBy: 'owner-1',
    });

    expect(afterDeny.status).toBe('denied');
    expect(afterDeny.actions[0]!.status).toBe('denied');
    await expect(readFile(path.join(sandboxRoot, created.id, 'touched.txt'), 'utf8')).rejects.toThrow();
  });

  it('refuses a write_file path that escapes the sandbox', async () => {
    const { coworker } = build([
      JSON.stringify({ kind: 'write_file', path: '../../etc/escape.txt', content: 'x', reason: 'test' }),
    ]);

    const created = await coworker.createTask({ goal: 'escape the sandbox', actorId: 'owner-1' });
    const pending = created.actions[0]!;

    const afterApprove = await coworker.decideAction({
      taskId: created.id,
      actionId: pending.id,
      decision: 'approved',
      decidedBy: 'owner-1',
    });

    expect(afterApprove.status).toBe('failed');
    expect(afterApprove.actions[0]!.status).toBe('failed');
    expect(afterApprove.actions[0]!.error).toMatch(/escapes the task sandbox/);
  });

  it('degrades to a truthful "blocked" status when no inference provider is configured', async () => {
    // An unrouted gateway (routed:false) — never a fabricated action.
    const auditRepo = new InMemoryAuditRepository();
    const audit = new AuditChainService(auditRepo);
    const approvals = new ApprovalService({
      repo: new InMemoryApprovalRepository(),
      logger: silentLogger,
      audit: { recordAudit: (e) => audit.append(e) },
    });
    const unroutedGateway: InferenceGatewayPort = {
      async complete() {
        return { routed: false, tier: 'none', model: '', content: null, reason: 'no provider configured' };
      },
      async completeStream() {
        throw new Error('not used');
      },
      async embed() {
        throw new Error('not used');
      },
      async feedback() {
        return { routed: false, reason: 'not used' };
      },
      async health() {
        return { tier: 'none', status: 'down', degraded: true };
      },
    } as unknown as InferenceGatewayPort;
    const blockedCoworker = new CoworkerService({
      approvals,
      audit,
      gateway: unroutedGateway,
      browser: unavailableBrowser(),
      logger: silentLogger,
      sandboxRoot,
    });

    const created = await blockedCoworker.createTask({ goal: 'anything', actorId: 'owner-1' });
    expect(created.status).toBe('blocked');
    expect(created.statusReason).toBe('no provider configured');
    expect(created.actions).toHaveLength(0);
  });
});
