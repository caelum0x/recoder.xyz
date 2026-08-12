/**
 * `SkillActionService` — proves the GOVERNED invoke pipeline's security
 * invariants with injected fakes (verifier/policy/approval/executor):
 *
 *  - policy is evaluated BEFORE any execution, ALWAYS;
 *  - a `deny` verdict refuses and NEVER executes;
 *  - a `needs_approval` verdict opens an approval request and NEVER executes;
 *  - an `allow` verdict executes with ONLY the typed params + granted capabilities
 *    (no ambient env / inherited secrets), and evaluatePolicy runs BEFORE the executor;
 *  - invalid params refuse BEFORE policy is even consulted;
 *  - an unknown/unverified skill action refuses (never executes);
 *  - an unwired executor on the allow path surfaces SERVICE_UNAVAILABLE (never faked).
 */
import { describe, it, expect } from 'vitest';
import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '@recoder/agent-policy';
import { ErrorCode } from '../../../shared/errors.js';
import { createSkillRegistry, type PinnedSkillVersions } from './skill-registry.js';
import {
  createSkillActionService,
  type SkillApprovalPort,
  type SkillPolicyEvaluator,
} from './skill-action.service.js';
import { qualifiedSkillToolName } from './skill-actor.js';
import type {
  SkillActionContext,
  SkillActionExecutor,
  SkillActionOutcome,
  SkillManifest,
  SkillSignatureVerifier,
} from './skill.types.js';

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as unknown as Parameters<typeof createSkillRegistry>[0]['logger'];

/** A verifier that accepts everything — trust is proven separately in the registry test. */
const acceptAll: SkillSignatureVerifier = { verify: () => ({ ok: true }) };

const PINNED: PinnedSkillVersions = { fmt: '1.0.0' };

function manifest(): SkillManifest {
  return {
    id: 'fmt',
    version: '1.0.0',
    publisherKeyId: 'pub-1',
    signature: 'sig-good',
    actions: [
      {
        id: 'format',
        title: 'Format file',
        paramsSchema: {
          path: { type: 'string', required: true },
          check: { type: 'boolean' },
        },
        requiredCapabilities: ['fs.write'],
      },
    ],
  };
}

async function loadedRegistry() {
  const reg = createSkillRegistry({ verifier: acceptAll, pinned: PINNED, logger: silentLogger });
  await reg.load([manifest()]);
  return reg;
}

/** Records every policy input it evaluated + returns a scripted decision. */
class FakePolicy {
  readonly inputs: PolicyInput[] = [];
  constructor(private readonly effect: PolicyDecision['effect'], private readonly reason = 'scripted') {}
  readonly evaluate: SkillPolicyEvaluator = (input: PolicyInput): PolicyDecision => {
    this.inputs.push(input);
    return {
      decisionId: 'dec-1',
      effect: this.effect,
      action: input.action,
      actorAgentId: input.actor.agentId,
      reason: this.reason,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
  };
}

/** Records approval requests + returns a fixed id. */
class FakeApproval implements SkillApprovalPort {
  readonly requests: Array<Record<string, unknown>> = [];
  async request(params: Parameters<SkillApprovalPort['request']>[0]) {
    this.requests.push(params as Record<string, unknown>);
    return { id: 'appr-1' };
  }
}

/** Records the exact context it was executed with. */
class FakeExecutor implements SkillActionExecutor {
  readonly calls: SkillActionContext[] = [];
  async execute(ctx: SkillActionContext): Promise<SkillActionOutcome> {
    this.calls.push(ctx);
    return { ok: true, output: 'formatted' };
  }
}

const BASE_INPUT = {
  skillId: 'fmt',
  actionId: 'format',
  params: { path: 'src/a.ts' },
  actorId: 'user-1',
  workspace: '/wt/ws1',
};

describe('SkillActionService', () => {
  it('evaluates policy BEFORE executing on the ALLOW path, with capability-scoped context', async () => {
    const order: string[] = [];
    const registry = await loadedRegistry();
    const policy = new FakePolicy('allow');
    // Wrap to record call order deterministically.
    const evaluate: SkillPolicyEvaluator = (input) => {
      order.push('policy');
      return policy.evaluate(input);
    };
    const executor = new FakeExecutor();
    const recordingExecutor: SkillActionExecutor = {
      execute: async (ctx) => {
        order.push('execute');
        return executor.execute(ctx);
      },
    };
    const service = createSkillActionService({
      registry,
      evaluatePolicy: evaluate,
      approval: new FakeApproval(),
      executor: recordingExecutor,
      logger: silentLogger,
    });

    const out = await service.invoke({ ...BASE_INPUT, params: { path: 'src/a.ts', check: true } });

    expect(out).toEqual({ status: 'executed', result: { ok: true, output: 'formatted' } });
    // Policy strictly precedes execution.
    expect(order).toEqual(['policy', 'execute']);

    // The policy input is the canonical capability-typed tool.call.
    expect(policy.inputs[0].action).toBe('tool.call');
    expect(policy.inputs[0].target.toolName).toBe(qualifiedSkillToolName('fmt', 'format'));
    expect(policy.inputs[0].actor.capabilities.map((c) => c.capabilityId)).toEqual(['fs.write']);

    // The executor got ONLY the typed params + granted capabilities + workspace —
    // no ambient env / secrets / extra keys.
    expect(executor.calls).toHaveLength(1);
    const ctx = executor.calls[0];
    expect(ctx.params).toEqual({ path: 'src/a.ts', check: true });
    expect(ctx.capabilities).toEqual(['fs.write']);
    expect(ctx.workspace).toBe('/wt/ws1');
    expect(Object.keys(ctx)).toEqual(['skillId', 'actionId', 'params', 'capabilities', 'workspace']);
    // Defense-in-depth: absolutely no env leaked in.
    expect('env' in ctx).toBe(false);
    expect((ctx as Record<string, unknown>).secrets).toBeUndefined();
  });

  it('REFUSES on a deny verdict and never executes', async () => {
    const registry = await loadedRegistry();
    const policy = new FakePolicy('deny', 'blocked by policy');
    const executor = new FakeExecutor();
    const service = createSkillActionService({
      registry,
      evaluatePolicy: policy.evaluate,
      approval: new FakeApproval(),
      executor,
      logger: silentLogger,
    });

    const out = await service.invoke(BASE_INPUT);
    expect(out).toEqual({ status: 'refused', refused: true, reason: 'blocked by policy' });
    expect(policy.inputs).toHaveLength(1);
    expect(executor.calls).toHaveLength(0);
  });

  it('opens an approval gate on needs_approval and does NOT execute', async () => {
    const registry = await loadedRegistry();
    const policy = new FakePolicy('needs_approval', 'high-risk action');
    const approval = new FakeApproval();
    const executor = new FakeExecutor();
    const service = createSkillActionService({
      registry,
      evaluatePolicy: policy.evaluate,
      approval,
      executor,
      logger: silentLogger,
    });

    const out = await service.invoke({ ...BASE_INPUT, taskId: 't-9' });
    expect(out).toEqual({ status: 'needs_approval', requestId: 'appr-1', reason: 'high-risk action' });
    expect(approval.requests).toHaveLength(1);
    expect(approval.requests[0]).toMatchObject({
      action: qualifiedSkillToolName('fmt', 'format'),
      requestedBy: 'user-1',
      riskTier: 'high',
      taskId: 't-9',
    });
    // NEVER executed on the approval path.
    expect(executor.calls).toHaveLength(0);
  });

  it('REFUSES invalid params BEFORE policy is consulted', async () => {
    const registry = await loadedRegistry();
    const policy = new FakePolicy('allow');
    const executor = new FakeExecutor();
    const service = createSkillActionService({
      registry,
      evaluatePolicy: policy.evaluate,
      approval: new FakeApproval(),
      executor,
      logger: silentLogger,
    });

    // Missing required `path`.
    const missing = await service.invoke({ ...BASE_INPUT, params: {} });
    expect(missing.status).toBe('refused');
    // Unknown param (no free-argv).
    const extra = await service.invoke({ ...BASE_INPUT, params: { path: 'a', cmd: 'rm -rf /' } });
    expect(extra.status).toBe('refused');
    if (extra.status === 'refused') expect(extra.reason).toContain("unknown parameter 'cmd'");

    // Policy was NEVER consulted, executor NEVER ran.
    expect(policy.inputs).toHaveLength(0);
    expect(executor.calls).toHaveLength(0);
  });

  it('REFUSES an unknown / unverified skill action (never resolves, never executes)', async () => {
    // Empty registry ⇒ nothing verified ⇒ nothing resolvable.
    const registry = createSkillRegistry({ verifier: acceptAll, pinned: PINNED, logger: silentLogger });
    const policy = new FakePolicy('allow');
    const executor = new FakeExecutor();
    const service = createSkillActionService({
      registry,
      evaluatePolicy: policy.evaluate,
      approval: new FakeApproval(),
      executor,
      logger: silentLogger,
    });

    const out = await service.invoke(BASE_INPUT);
    expect(out.status).toBe('refused');
    if (out.status === 'refused') expect(out.reason).toContain('unknown or unverified skill action');
    expect(policy.inputs).toHaveLength(0);
    expect(executor.calls).toHaveLength(0);
  });

  it('surfaces SERVICE_UNAVAILABLE when the executor is unwired on the allow path', async () => {
    const registry = await loadedRegistry();
    const policy = new FakePolicy('allow');
    const service = createSkillActionService({
      registry,
      evaluatePolicy: policy.evaluate,
      approval: new FakeApproval(),
      // no executor
      logger: silentLogger,
    });

    await expect(service.invoke(BASE_INPUT)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
    // Policy WAS consulted (allow), but there was nothing to fake-execute.
    expect(policy.inputs).toHaveLength(1);
  });
});
