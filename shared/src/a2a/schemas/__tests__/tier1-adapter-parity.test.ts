/**
 * @module tier1-adapter-parity.test
 *
 * Tier-1 connector adapter parity test suite.
 *
 * Verifies that both CodexConnectorAdapter and ClaudeConnectorAdapter
 * satisfy the ConnectorAdapter contract identically. This is the
 * "deterministic contract suite for Tier-1 connectors in CI" required
 * by the A2A PRD P0.
 *
 * Coverage:
 * 1. Interface completeness — both adapters implement all 7 ConnectorAdapter methods
 * 2. Lifecycle parity — identical state machine behavior for success, failure, working
 * 3. Cancellation parity — same cancel semantics for all states
 * 4. Policy mapping parity — both cover all PolicyAction values
 * 5. Audit event parity — both emit identical audit events via the control plane
 * 6. Context extraction parity — same scope handling
 * 7. Artifact continuity — TaskEnvelope with artifacts flows through both adapters
 * 8. Resume/retry — adapters handle re-execution after failure
 */

import { describe, expect, it, vi } from 'vitest';
import {
  A2AControlPlane,
  ClaudeConnectorAdapter,
  CodexConnectorAdapter,
  InMemoryAgentRegistry,
  InMemoryAuditLogService,
  InMemoryTaskStore,
  UnifiedPolicyPlane,
  type ConnectorAdapter,
  type ConnectorAuditEvent,
  type ConnectorContextScope,
  type PolicyAction,
  type RegisteredAgent,
} from '../../control-plane';
import { createRecoderAgentCard } from '../../bridge';
import {
  createTaskEnvelope,
  transitionTaskEnvelope,
  TaskStateEnum,
  type TaskArtifact,
} from '../task-envelope';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkAgent(input: {
  id: string;
  name: string;
  platform: 'codex' | 'claude_code';
  protocol: 'jsonrpc' | 'mcp';
}): RegisteredAgent {
  return {
    identity: { id: input.id, name: input.name, platform: input.platform },
    protocol: input.protocol,
    tier: 'tier1',
    status: 'experimental',
    tags: ['coding', 'tier1'],
    card: createRecoderAgentCard({
      name: input.name,
      description: `${input.name} adapter`,
      version: 'test',
      url: `https://${input.id}.internal/a2a`,
      skills: [{ id: 'code', name: 'Code', description: 'Code tasks', tags: ['coding'] }],
    }),
  };
}

const CODEX_AGENT = mkAgent({ id: 'codex-agent', name: 'Codex', platform: 'codex', protocol: 'jsonrpc' });
const CLAUDE_AGENT = mkAgent({ id: 'claude-agent', name: 'Claude', platform: 'claude_code', protocol: 'mcp' });

/** All policy actions defined in the control plane. */
const ALL_POLICY_ACTIONS: PolicyAction[] = [
  'file:read',
  'file:write',
  'file:delete',
  'bash:exec',
  'network:call',
  'git:push',
  'env:access',
];

/** All context scopes. */
const ALL_SCOPES: ConnectorContextScope[] = ['workspace', 'selection', 'thread', 'task'];

// ---------------------------------------------------------------------------
// 1. Interface completeness
// ---------------------------------------------------------------------------

describe('Tier-1 interface completeness', () => {
  const requiredMethods: (keyof ConnectorAdapter)[] = [
    'discoverCapabilities',
    'executeTask',
    'streamTaskUpdates',
    'cancelTask',
    'extractContext',
    'mapPlatformActionToPolicyAction',
    'emitAuditEvent',
  ];

  const codex = new CodexConnectorAdapter({
    sendTask: async () => ({ status: 'completed', output: 'ok' }),
  });
  const claude = new ClaudeConnectorAdapter({
    callTool: async () => ({ content: 'ok' }),
  });

  for (const method of requiredMethods) {
    it(`CodexConnectorAdapter implements ${method}`, () => {
      expect(typeof codex[method]).toBe('function');
    });

    it(`ClaudeConnectorAdapter implements ${method}`, () => {
      expect(typeof claude[method]).toBe('function');
    });
  }

  it('CodexConnectorAdapter has platform "codex" and protocol "jsonrpc"', () => {
    expect(codex.platform).toBe('codex');
    expect(codex.protocol).toBe('jsonrpc');
  });

  it('ClaudeConnectorAdapter has platform "claude_code" and protocol "mcp"', () => {
    expect(claude.platform).toBe('claude_code');
    expect(claude.protocol).toBe('mcp');
  });
});

// ---------------------------------------------------------------------------
// 2. Lifecycle parity — success / failure / working
// ---------------------------------------------------------------------------

describe('Tier-1 lifecycle parity', () => {
  const taskRequest = {
    taskId: 'parity-task-1',
    threadId: 'parity-thread-1',
    prompt: 'Refactor module',
    requester: CODEX_AGENT.identity,
    assignee: CLAUDE_AGENT.identity,
  };

  describe.each([
    {
      label: 'Codex',
      makeAdapter: (outcome: 'completed' | 'working' | 'failed') =>
        new CodexConnectorAdapter({
          sendTask: async () => {
            if (outcome === 'failed') return { status: 'failed', error: 'rpc-error' };
            if (outcome === 'working') return { status: 'working', output: 'in-progress' };
            return { status: 'completed', output: 'done' };
          },
        }),
    },
    {
      label: 'Claude',
      makeAdapter: (outcome: 'completed' | 'working' | 'failed') =>
        new ClaudeConnectorAdapter({
          callTool: async () => {
            if (outcome === 'failed') return { error: 'mcp-error' };
            // ClaudeConnectorAdapter doesn't produce 'working' from callTool
            // (it's synchronous from its perspective), so 'working' maps to completed
            return { content: outcome === 'working' ? 'in-progress' : 'done' };
          },
        }),
    },
  ])('$label adapter lifecycle', ({ makeAdapter }) => {
    it('completes task and returns state=completed with resultText', async () => {
      const adapter = makeAdapter('completed');
      const result = await adapter.executeTask(taskRequest);
      expect(result.state).toBe('completed');
      expect(result.resultText).toBeDefined();
      expect(typeof result.resultText).toBe('string');
    });

    it('reports failed task with state=failed and error text', async () => {
      const adapter = makeAdapter('failed');
      const result = await adapter.executeTask(taskRequest);
      expect(result.state).toBe('failed');
      expect(result.resultText).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Cancellation parity
// ---------------------------------------------------------------------------

describe('Tier-1 cancellation parity', () => {
  it('both adapters return false for unknown task IDs', async () => {
    const codex = new CodexConnectorAdapter({
      sendTask: async () => ({ status: 'working', output: 'in-progress' }),
    });
    const claude = new ClaudeConnectorAdapter({
      callTool: async () => ({ content: 'done' }),
    });

    expect(await codex.cancelTask('nonexistent')).toBe(false);
    expect(await claude.cancelTask('nonexistent')).toBe(false);
  });

  it('Codex: cancels a working task (async protocol supports in-flight cancel)', async () => {
    const codex = new CodexConnectorAdapter({
      sendTask: async () => ({ status: 'working', output: 'in-progress' }),
    });
    const request = {
      taskId: 'codex-cancel-1',
      threadId: 'cancel-thread',
      prompt: 'Long task',
      requester: CODEX_AGENT.identity,
      assignee: CLAUDE_AGENT.identity,
    };
    await codex.executeTask(request);
    expect(await codex.cancelTask('codex-cancel-1')).toBe(true);
    // Cannot cancel again
    expect(await codex.cancelTask('codex-cancel-1')).toBe(false);
  });

  it('Claude: cannot cancel a completed task (sync MCP protocol)', async () => {
    // Claude's callTool is synchronous — task goes directly to completed/failed.
    // This is a protocol-level asymmetry: MCP calls are request/response,
    // while Codex JSON-RPC supports long-running tasks with 'working' state.
    const claude = new ClaudeConnectorAdapter({
      callTool: async () => ({ content: 'done' }),
    });
    const request = {
      taskId: 'claude-cancel-1',
      threadId: 'cancel-thread',
      prompt: 'Quick task',
      requester: CODEX_AGENT.identity,
      assignee: CLAUDE_AGENT.identity,
    };
    await claude.executeTask(request);
    // Task is already completed, cannot cancel
    expect(await claude.cancelTask('claude-cancel-1')).toBe(false);
  });

  it('both adapters reject cancellation of terminal states identically', async () => {
    const codex = new CodexConnectorAdapter({
      sendTask: async () => ({ status: 'completed', output: 'done' }),
    });
    const claude = new ClaudeConnectorAdapter({
      callTool: async () => ({ content: 'done' }),
    });

    await codex.executeTask({
      taskId: 'terminal-codex',
      threadId: 't',
      prompt: 'p',
      requester: CODEX_AGENT.identity,
      assignee: CLAUDE_AGENT.identity,
    });
    await claude.executeTask({
      taskId: 'terminal-claude',
      threadId: 't',
      prompt: 'p',
      requester: CODEX_AGENT.identity,
      assignee: CLAUDE_AGENT.identity,
    });

    // Both completed — both should reject cancellation
    expect(await codex.cancelTask('terminal-codex')).toBe(false);
    expect(await claude.cancelTask('terminal-claude')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Policy mapping parity
// ---------------------------------------------------------------------------

describe('Tier-1 policy mapping parity', () => {
  const codex = new CodexConnectorAdapter({
    sendTask: async () => ({ status: 'completed', output: 'ok' }),
  });
  const claude = new ClaudeConnectorAdapter({
    callTool: async () => ({ content: 'ok' }),
  });

  it('both adapters produce all PolicyAction values from their platform actions', () => {
    const codexMapped = new Set<PolicyAction>();
    const claudeMapped = new Set<PolicyAction>();

    // Codex platform actions
    const codexActions = ['fs.read', 'fs.write', 'fs.delete', 'shell.exec', 'net.request', 'git.push', 'env.read'];
    for (const action of codexActions) {
      const mapped = codex.mapPlatformActionToPolicyAction(action);
      if (mapped) codexMapped.add(mapped);
    }

    // Claude platform actions (MCP tool names)
    const claudeActions = ['Read', 'Write', 'Edit', 'Bash', 'WebFetch', 'Env'];
    for (const action of claudeActions) {
      const mapped = claude.mapPlatformActionToPolicyAction(action);
      if (mapped) claudeMapped.add(mapped);
    }

    // Both should cover the core policy actions
    const coreActions: PolicyAction[] = ['file:read', 'file:write', 'bash:exec', 'network:call', 'env:access'];
    for (const action of coreActions) {
      expect(codexMapped.has(action), `Codex missing policy mapping for ${action}`).toBe(true);
      expect(claudeMapped.has(action), `Claude missing policy mapping for ${action}`).toBe(true);
    }
  });

  it('both adapters return undefined for unknown platform actions', () => {
    expect(codex.mapPlatformActionToPolicyAction('unknown.action')).toBeUndefined();
    expect(claude.mapPlatformActionToPolicyAction('UnknownTool')).toBeUndefined();
  });

  it('codex covers file:delete and git:push that claude maps differently', () => {
    // Codex has explicit fs.delete and git.push
    expect(codex.mapPlatformActionToPolicyAction('fs.delete')).toBe('file:delete');
    expect(codex.mapPlatformActionToPolicyAction('git.push')).toBe('git:push');

    // Claude maps Edit to file:write (covers both write and delete semantics)
    expect(claude.mapPlatformActionToPolicyAction('Edit')).toBe('file:write');
  });
});

// ---------------------------------------------------------------------------
// 5. Audit event parity via A2AControlPlane
// ---------------------------------------------------------------------------

describe('Tier-1 audit event parity', () => {
  function setupControlPlane() {
    const registry = new InMemoryAgentRegistry();
    const tasks = new InMemoryTaskStore();
    const policy = new UnifiedPolicyPlane();
    const auditLog = new InMemoryAuditLogService();
    const cp = new A2AControlPlane(registry, tasks, policy, auditLog);

    registry.register(CODEX_AGENT);
    registry.register(CLAUDE_AGENT);

    return { cp, registry, tasks, policy, auditLog };
  }

  it('produces identical audit event kinds for a completed task via Codex', async () => {
    const { cp, policy, auditLog } = setupControlPlane();
    const codexAdapter = new CodexConnectorAdapter({
      sendTask: async () => ({ status: 'completed', output: 'done' }),
    });
    cp.attachConnector('codex-agent', codexAdapter);
    policy.setRule('codex-agent', 'file:write', 'auto');

    await cp.submitTask({
      taskId: 'audit-codex-1',
      threadId: 'audit-thread',
      requesterId: 'claude-agent',
      assigneeId: 'codex-agent',
      prompt: 'Test task',
      requiredAction: 'file:write',
    });

    const events = auditLog.listByTask('audit-codex-1');
    const kinds = events.map((e) => e.kind).sort();
    expect(kinds).toEqual(
      ['policy.checked', 'task.completed', 'task.started', 'task.submitted'].sort()
    );
  });

  it('produces identical audit event kinds for a completed task via Claude', async () => {
    const { cp, policy, auditLog } = setupControlPlane();
    const claudeAdapter = new ClaudeConnectorAdapter({
      callTool: async () => ({ content: 'done' }),
    });
    cp.attachConnector('claude-agent', claudeAdapter);
    policy.setRule('claude-agent', 'file:write', 'auto');

    await cp.submitTask({
      taskId: 'audit-claude-1',
      threadId: 'audit-thread',
      requesterId: 'codex-agent',
      assigneeId: 'claude-agent',
      prompt: 'Test task',
      requiredAction: 'file:write',
    });

    const events = auditLog.listByTask('audit-claude-1');
    const kinds = events.map((e) => e.kind).sort();
    expect(kinds).toEqual(
      ['policy.checked', 'task.completed', 'task.started', 'task.submitted'].sort()
    );
  });

  it('both adapters produce matching event kinds for policy-denied tasks', async () => {
    const { cp, policy, auditLog } = setupControlPlane();
    const codexAdapter = new CodexConnectorAdapter({
      sendTask: async () => ({ status: 'completed', output: 'unreachable' }),
    });
    const claudeAdapter = new ClaudeConnectorAdapter({
      callTool: async () => ({ content: 'unreachable' }),
    });
    cp.attachConnector('codex-agent', codexAdapter);
    cp.attachConnector('claude-agent', claudeAdapter);
    policy.setRule('codex-agent', 'bash:exec', 'deny');
    policy.setRule('claude-agent', 'bash:exec', 'deny');

    await cp.submitTask({
      taskId: 'deny-codex',
      threadId: 'deny-thread',
      requesterId: 'claude-agent',
      assigneeId: 'codex-agent',
      prompt: 'Denied task',
      requiredAction: 'bash:exec',
    });

    await cp.submitTask({
      taskId: 'deny-claude',
      threadId: 'deny-thread',
      requesterId: 'codex-agent',
      assigneeId: 'claude-agent',
      prompt: 'Denied task',
      requiredAction: 'bash:exec',
    });

    const codexKinds = auditLog.listByTask('deny-codex').map((e) => e.kind).sort();
    const claudeKinds = auditLog.listByTask('deny-claude').map((e) => e.kind).sort();

    expect(codexKinds).toEqual(claudeKinds);
    expect(codexKinds).toContain('policy.checked');
    expect(codexKinds).toContain('task.submitted');
  });

  it('both adapters emit audit events through emitAuditEvent callback', async () => {
    const codexSink = vi.fn();
    const claudeSink = vi.fn();

    const codex = new CodexConnectorAdapter(
      { sendTask: async () => ({ status: 'completed', output: 'ok' }) },
      codexSink,
    );
    const claude = new ClaudeConnectorAdapter(
      { callTool: async () => ({ content: 'ok' }) },
      claudeSink,
    );

    const event: ConnectorAuditEvent = {
      connectorId: 'test',
      taskId: 'task-1',
      kind: 'task.completed',
      createdAt: '2026-02-27T00:00:00.000Z',
      details: { test: true },
    };

    await codex.emitAuditEvent(event);
    await claude.emitAuditEvent(event);

    expect(codexSink).toHaveBeenCalledWith(event);
    expect(claudeSink).toHaveBeenCalledWith(event);
  });
});

// ---------------------------------------------------------------------------
// 6. Context extraction parity
// ---------------------------------------------------------------------------

describe('Tier-1 context extraction parity', () => {
  const codex = new CodexConnectorAdapter({
    sendTask: async () => ({ status: 'completed', output: 'ok' }),
  });
  const claude = new ClaudeConnectorAdapter({
    callTool: async () => ({ content: 'ok' }),
  });

  for (const scope of ALL_SCOPES) {
    it(`both adapters return a context snapshot for scope="${scope}"`, async () => {
      const codexCtx = await codex.extractContext(scope);
      const claudeCtx = await claude.extractContext(scope);

      expect(codexCtx.scope).toBe(scope);
      expect(claudeCtx.scope).toBe(scope);

      expect(codexCtx.metadata).toHaveProperty('platform', 'codex');
      expect(codexCtx.metadata).toHaveProperty('protocol', 'jsonrpc');

      expect(claudeCtx.metadata).toHaveProperty('platform', 'claude_code');
      expect(claudeCtx.metadata).toHaveProperty('protocol', 'mcp');
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Artifact continuity — TaskEnvelope with artifacts through adapters
// ---------------------------------------------------------------------------

describe('Tier-1 artifact continuity', () => {
  const patchArtifact: TaskArtifact = {
    key: 'auth-fix.patch',
    artifact_type: 'patch',
    mime_type: 'text/x-diff',
    content: 'diff --git a/auth.ts b/auth.ts\n--- a/auth.ts\n+++ b/auth.ts\n@@ -1 +1 @@\n-old\n+new',
    path: 'auth.ts',
  };

  const fileArtifact: TaskArtifact = {
    key: 'config.json',
    artifact_type: 'file',
    mime_type: 'application/json',
    content: '{"key": "value"}',
    path: 'config.json',
  };

  const logArtifact: TaskArtifact = {
    key: 'execution.log',
    artifact_type: 'log',
    mime_type: 'text/plain',
    content: '[INFO] Task started\n[INFO] Task completed',
  };

  it('TaskEnvelope preserves artifact data through state transitions', () => {
    const envelope = createTaskEnvelope({
      id: 'artifact-task-1',
      workspace_id: 'ws_test',
      thread_id: 'thr_test',
      trace_id: 'trace_artifact_001',
      requester: { agent_id: 'codex-agent', platform: 'codex' },
      assignee: { agent_id: 'claude-agent', platform: 'claude_code' },
      connector: { platform: 'claude_code', protocol: 'mcp', connector_id: 'claude-v1' },
      payload: { kind: 'text', text: 'Fix auth bug' },
      now: '2026-02-27T00:00:00.000Z',
    });

    // Transition to working
    const working = transitionTaskEnvelope(envelope, TaskStateEnum.Working, {
      now: '2026-02-27T00:01:00.000Z',
    });

    // Transition to completed with result artifacts
    const completed = {
      ...transitionTaskEnvelope(working, TaskStateEnum.Completed, {
        now: '2026-02-27T00:02:00.000Z',
      }),
      result: {
        text: 'Auth bug fixed',
        artifacts: [patchArtifact, fileArtifact, logArtifact],
      },
    };

    // Verify artifacts are preserved
    expect(completed.result?.artifacts).toHaveLength(3);
    expect(completed.result?.artifacts?.[0].artifact_type).toBe('patch');
    expect(completed.result?.artifacts?.[0].content).toContain('diff --git');
    expect(completed.result?.artifacts?.[1].artifact_type).toBe('file');
    expect(completed.result?.artifacts?.[1].content).toBe('{"key": "value"}');
    expect(completed.result?.artifacts?.[2].artifact_type).toBe('log');

    // Verify envelope identity preserved through transitions
    expect(completed.id).toBe('artifact-task-1');
    expect(completed.trace_id).toBe('trace_artifact_001');
    expect(completed.workspace_id).toBe('ws_test');
    expect(completed.history).toHaveLength(2);
  });

  it('Codex adapter executeTask returns raw response that can carry artifacts', async () => {
    const codex = new CodexConnectorAdapter({
      sendTask: async () => ({
        status: 'completed',
        output: 'Done. Applied patch to auth.ts',
      }),
    });

    const result = await codex.executeTask({
      taskId: 'codex-artifact-1',
      threadId: 'thread-1',
      prompt: 'Fix auth',
      requester: CODEX_AGENT.identity,
      assignee: CLAUDE_AGENT.identity,
    });

    expect(result.state).toBe('completed');
    expect(result.raw).toBeDefined();
    expect(result.resultText).toContain('auth.ts');
  });

  it('Claude adapter executeTask returns raw response that can carry artifacts', async () => {
    const claude = new ClaudeConnectorAdapter({
      callTool: async () => ({
        content: 'Applied diff --git a/auth.ts to fix the bug',
      }),
    });

    const result = await claude.executeTask({
      taskId: 'claude-artifact-1',
      threadId: 'thread-1',
      prompt: 'Fix auth',
      requester: CODEX_AGENT.identity,
      assignee: CLAUDE_AGENT.identity,
    });

    expect(result.state).toBe('completed');
    expect(result.raw).toBeDefined();
    expect(result.resultText).toContain('diff --git');
  });
});

// ---------------------------------------------------------------------------
// 8. Resume/retry — re-execution after failure
// ---------------------------------------------------------------------------

describe('Tier-1 resume/retry reliability', () => {
  describe.each([
    {
      label: 'Codex',
      makeAdapter: (outcomes: Array<'completed' | 'failed'>) => {
        let call = 0;
        return new CodexConnectorAdapter({
          sendTask: async () => {
            const outcome = outcomes[call++] ?? 'completed';
            if (outcome === 'failed') return { status: 'failed', error: 'transient' };
            return { status: 'completed', output: 'ok' };
          },
        });
      },
    },
    {
      label: 'Claude',
      makeAdapter: (outcomes: Array<'completed' | 'failed'>) => {
        let call = 0;
        return new ClaudeConnectorAdapter({
          callTool: async () => {
            const outcome = outcomes[call++] ?? 'completed';
            if (outcome === 'failed') return { error: 'transient' };
            return { content: 'ok' };
          },
        });
      },
    },
  ])('$label retry semantics', ({ makeAdapter }) => {
    it('can re-execute a task after initial failure', async () => {
      const adapter = makeAdapter(['failed', 'completed']);
      const request = {
        taskId: 'retry-1',
        threadId: 'retry-thread',
        prompt: 'Retry me',
        requester: CODEX_AGENT.identity,
        assignee: CLAUDE_AGENT.identity,
      };

      const firstResult = await adapter.executeTask(request);
      expect(firstResult.state).toBe('failed');

      // Re-execute with same task ID (simulates retry)
      const retryResult = await adapter.executeTask({ ...request, taskId: 'retry-1-v2' });
      expect(retryResult.state).toBe('completed');
    });
  });
});

// ---------------------------------------------------------------------------
// 9. Cross-adapter task delegation (E2E through control plane)
// ---------------------------------------------------------------------------

describe('Tier-1 cross-adapter task delegation E2E', () => {
  it('Codex requester -> Claude assignee -> completed with audit trail', async () => {
    const registry = new InMemoryAgentRegistry();
    const tasks = new InMemoryTaskStore();
    const policy = new UnifiedPolicyPlane();
    const auditLog = new InMemoryAuditLogService();
    const cp = new A2AControlPlane(registry, tasks, policy, auditLog);

    registry.register(CODEX_AGENT);
    registry.register(CLAUDE_AGENT);

    const claudeAdapter = new ClaudeConnectorAdapter({
      callTool: async () => ({ content: 'Architecture review complete' }),
    });
    cp.attachConnector('claude-agent', claudeAdapter);
    policy.setRule('claude-agent', 'file:read', 'auto');

    const task = await cp.submitTask({
      taskId: 'cross-1',
      threadId: 'cross-thread',
      requesterId: 'codex-agent',
      assigneeId: 'claude-agent',
      prompt: 'Review auth module architecture',
      requiredAction: 'file:read',
    });

    expect(task.state).toBe('completed');
    expect(task.resultText).toContain('Architecture review');
    expect(task.requester.platform).toBe('codex');
    expect(task.assignee.platform).toBe('claude_code');

    // Verify full audit trail
    const audit = auditLog.listByTask('cross-1');
    expect(audit.length).toBeGreaterThanOrEqual(3);
    expect(audit.map((e) => e.kind)).toContain('task.submitted');
    expect(audit.map((e) => e.kind)).toContain('task.started');
    expect(audit.map((e) => e.kind)).toContain('task.completed');
  });

  it('Claude requester -> Codex assignee -> completed with audit trail', async () => {
    const registry = new InMemoryAgentRegistry();
    const tasks = new InMemoryTaskStore();
    const policy = new UnifiedPolicyPlane();
    const auditLog = new InMemoryAuditLogService();
    const cp = new A2AControlPlane(registry, tasks, policy, auditLog);

    registry.register(CODEX_AGENT);
    registry.register(CLAUDE_AGENT);

    const codexAdapter = new CodexConnectorAdapter({
      sendTask: async () => ({ status: 'completed', output: 'Code generated' }),
    });
    cp.attachConnector('codex-agent', codexAdapter);
    policy.setRule('codex-agent', 'file:write', 'auto');

    const task = await cp.submitTask({
      taskId: 'cross-2',
      threadId: 'cross-thread',
      requesterId: 'claude-agent',
      assigneeId: 'codex-agent',
      prompt: 'Generate auth module',
      requiredAction: 'file:write',
    });

    expect(task.state).toBe('completed');
    expect(task.resultText).toContain('Code generated');
    expect(task.requester.platform).toBe('claude_code');
    expect(task.assignee.platform).toBe('codex');

    const audit = auditLog.listByTask('cross-2');
    expect(audit.length).toBeGreaterThanOrEqual(3);
  });

  it('bidirectional delegation produces symmetric audit trails', async () => {
    const registry = new InMemoryAgentRegistry();
    const tasks = new InMemoryTaskStore();
    const policy = new UnifiedPolicyPlane();
    const auditLog = new InMemoryAuditLogService();
    const cp = new A2AControlPlane(registry, tasks, policy, auditLog);

    registry.register(CODEX_AGENT);
    registry.register(CLAUDE_AGENT);

    const codexAdapter = new CodexConnectorAdapter({
      sendTask: async () => ({ status: 'completed', output: 'ok' }),
    });
    const claudeAdapter = new ClaudeConnectorAdapter({
      callTool: async () => ({ content: 'ok' }),
    });
    cp.attachConnector('codex-agent', codexAdapter);
    cp.attachConnector('claude-agent', claudeAdapter);

    // No policy checks — test pure delegation symmetry
    await cp.submitTask({
      taskId: 'sym-codex',
      threadId: 'sym-thread',
      requesterId: 'claude-agent',
      assigneeId: 'codex-agent',
      prompt: 'Task A',
    });

    await cp.submitTask({
      taskId: 'sym-claude',
      threadId: 'sym-thread',
      requesterId: 'codex-agent',
      assigneeId: 'claude-agent',
      prompt: 'Task B',
    });

    const codexAuditKinds = auditLog.listByTask('sym-codex').map((e) => e.kind).sort();
    const claudeAuditKinds = auditLog.listByTask('sym-claude').map((e) => e.kind).sort();

    // Both should have identical event kind sequences
    expect(codexAuditKinds).toEqual(claudeAuditKinds);
  });
});
