import { describe, expect, it } from 'vitest';
import {
  A2AControlPlane,
  ClaudeConnectorAdapter,
  CodexConnectorAdapter,
  InMemoryAuditLogService,
  InMemoryAgentRegistry,
  InMemoryCollaborationService,
  InMemoryTaskStore,
  UnifiedPolicyPlane,
  type RegisteredAgent,
} from './control-plane';
import { createRecoderAgentCard } from './bridge';

function mkAgent(input: {
  id: string;
  name: string;
  platform: 'codex' | 'claude_code';
  protocol: 'jsonrpc' | 'mcp';
}): RegisteredAgent {
  return {
    identity: {
      id: input.id,
      name: input.name,
      platform: input.platform,
    },
    protocol: input.protocol,
    tier: 'tier1',
    status: 'experimental',
    tags: ['coding', 'tier1'],
    card: createRecoderAgentCard({
      name: input.name,
      description: `${input.name} adapter`,
      version: 'test',
      url: `https://${input.id}.internal/a2a`,
      skills: [
        {
          id: 'code',
          name: 'Code',
          description: 'Code tasks',
          tags: ['coding'],
        },
      ],
    }),
  };
}

describe('InMemoryAgentRegistry', () => {
  it('registers, discovers, and unregisters agents', () => {
    const registry = new InMemoryAgentRegistry();
    const codex = mkAgent({ id: 'codex-agent', name: 'Codex', platform: 'codex', protocol: 'jsonrpc' });
    const claude = mkAgent({ id: 'claude-agent', name: 'Claude', platform: 'claude_code', protocol: 'mcp' });

    registry.register(codex);
    registry.register(claude);

    expect(registry.list()).toHaveLength(2);
    expect(registry.discover({ protocol: 'jsonrpc' }).map((item) => item.identity.id)).toEqual([
      'codex-agent',
    ]);
    expect(registry.discover({ skillTag: 'coding' })).toHaveLength(2);

    expect(registry.unregister('codex-agent')).toBe(true);
    expect(registry.get('codex-agent')).toBeUndefined();
  });
});

describe('UnifiedPolicyPlane', () => {
  it('supports auto/prompt/deny decisions', async () => {
    const policy = new UnifiedPolicyPlane();

    policy.setRule('codex-agent', 'file:write', 'auto');
    policy.setRule('claude-agent', 'network:call', 'deny');
    policy.setRule('claude-agent', 'bash:exec', 'prompt');
    policy.setPromptHandler('claude-agent', async () => true);

    const a = await policy.check('codex-agent', 'file:write');
    const b = await policy.check('claude-agent', 'network:call');
    const c = await policy.check('claude-agent', 'bash:exec');

    expect(a.approved).toBe(true);
    expect(a.rule).toBe('auto');

    expect(b.approved).toBe(false);
    expect(b.rule).toBe('deny');

    expect(c.approved).toBe(true);
    expect(c.rule).toBe('prompt');
  });
});

describe('A2AControlPlane with Tier-1 adapters', () => {
  it('submits through Codex adapter and completes task', async () => {
    const registry = new InMemoryAgentRegistry();
    const tasks = new InMemoryTaskStore();
    const policy = new UnifiedPolicyPlane();
    const auditLog = new InMemoryAuditLogService();
    const collaboration = new InMemoryCollaborationService();
    const controlPlane = new A2AControlPlane(registry, tasks, policy, auditLog, collaboration);

    const codex = mkAgent({ id: 'codex-agent', name: 'Codex', platform: 'codex', protocol: 'jsonrpc' });
    const claude = mkAgent({ id: 'claude-agent', name: 'Claude', platform: 'claude_code', protocol: 'mcp' });
    registry.register(codex);
    registry.register(claude);

    const codexAdapter = new CodexConnectorAdapter({
      sendTask: async () => ({ status: 'completed', output: 'done-by-codex' }),
    });
    controlPlane.attachConnector('codex-agent', codexAdapter);
    policy.setRule('codex-agent', 'file:write', 'auto');

    const task = await controlPlane.submitTask({
      taskId: 'task-1',
      threadId: 'thread-1',
      requesterId: 'claude-agent',
      assigneeId: 'codex-agent',
      prompt: 'Refactor auth module',
      requiredAction: 'file:write',
    });

    expect(task.state).toBe('completed');
    expect(task.resultText).toBe('done-by-codex');
    expect(tasks.getEvents('task-1').map((evt) => evt.kind)).toContain('task.completed');
    expect(controlPlane.getAuditEntries('task-1').map((evt) => evt.kind)).toContain('task.completed');
  });

  it('submits through Claude adapter and fails when policy denies', async () => {
    const registry = new InMemoryAgentRegistry();
    const tasks = new InMemoryTaskStore();
    const policy = new UnifiedPolicyPlane();
    const controlPlane = new A2AControlPlane(registry, tasks, policy);

    const codex = mkAgent({ id: 'codex-agent', name: 'Codex', platform: 'codex', protocol: 'jsonrpc' });
    const claude = mkAgent({ id: 'claude-agent', name: 'Claude', platform: 'claude_code', protocol: 'mcp' });
    registry.register(codex);
    registry.register(claude);

    const claudeAdapter = new ClaudeConnectorAdapter({
      callTool: async () => ({ content: 'done-by-claude' }),
    });
    controlPlane.attachConnector('claude-agent', claudeAdapter);

    policy.setRule('claude-agent', 'network:call', 'deny');

    const deniedTask = await controlPlane.submitTask({
      taskId: 'task-2',
      threadId: 'thread-2',
      requesterId: 'codex-agent',
      assigneeId: 'claude-agent',
      prompt: 'Call external scanner',
      requiredAction: 'network:call',
    });

    expect(deniedTask.state).toBe('failed');
    expect(deniedTask.error).toContain('Policy denied action');
  });

  it('exposes connector capabilities/context and supports cancel/stream for working task', async () => {
    const registry = new InMemoryAgentRegistry();
    const tasks = new InMemoryTaskStore();
    const policy = new UnifiedPolicyPlane();
    const controlPlane = new A2AControlPlane(registry, tasks, policy);

    const codex = mkAgent({ id: 'codex-agent', name: 'Codex', platform: 'codex', protocol: 'jsonrpc' });
    const claude = mkAgent({ id: 'claude-agent', name: 'Claude', platform: 'claude_code', protocol: 'mcp' });
    registry.register(codex);
    registry.register(claude);

    const codexAdapter = new CodexConnectorAdapter({
      sendTask: async () => ({ status: 'working', output: 'still-running' }),
    });
    controlPlane.attachConnector('codex-agent', codexAdapter);
    policy.setRule('codex-agent', 'file:write', 'auto');

    const caps = await controlPlane.discoverCapabilities('codex-agent');
    expect(caps.length).toBeGreaterThan(0);

    const ctx = await controlPlane.extractConnectorContext('codex-agent', 'thread');
    expect(ctx.scope).toBe('thread');

    const task = await controlPlane.submitTask({
      taskId: 'task-3',
      threadId: 'thread-3',
      requesterId: 'claude-agent',
      assigneeId: 'codex-agent',
      prompt: 'Long-running change',
      platformAction: 'fs.write',
    });
    expect(task.state).toBe('working');

    const updates: string[] = [];
    for await (const update of controlPlane.streamTaskUpdates('task-3')) {
      updates.push(update.state);
    }
    expect(updates).toContain('working');

    const cancelled = await controlPlane.cancelTask('task-3');
    expect(cancelled.state).toBe('cancelled');
    expect(tasks.getEvents('task-3').map((evt) => evt.kind)).toContain('task.cancelled');
  });

  it('supports collaboration channels, threads, and messages', () => {
    const registry = new InMemoryAgentRegistry();
    const tasks = new InMemoryTaskStore();
    const policy = new UnifiedPolicyPlane();
    const controlPlane = new A2AControlPlane(registry, tasks, policy);

    const channel = controlPlane.createChannel({
      id: 'chan-1',
      scope: 'channel',
      name: 'core-runtime',
      memberAgentIds: ['codex-agent', 'claude-agent'],
    });
    expect(channel.scope).toBe('channel');

    const thread = controlPlane.createThread({
      id: 'thr-1',
      channelId: 'chan-1',
      title: 'plan rollout',
    });
    expect(thread.channelId).toBe('chan-1');

    const message = controlPlane.postMessage({
      id: 'msg-1',
      threadId: 'thr-1',
      senderAgentId: 'codex-agent',
      text: 'Starting implementation',
    });
    expect(message.threadId).toBe('thr-1');
    expect(controlPlane.listChannelThreads('chan-1')).toHaveLength(1);
    expect(controlPlane.listThreadMessages('thr-1')).toHaveLength(1);
  });
});
