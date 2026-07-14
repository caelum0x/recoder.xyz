import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const sendToAgent = vi.fn(() => true);
  const getRecentContext = vi.fn(async () => [{ content: 'remember this', type: 'fact', score: 0.9 }]);
  const fakeBundle = {
    shared_goal: 'Fix signup crash',
    agent_specific_prompt: 'Read AGENTS.md and fix signup crash.',
    system_context_refs: [{ ref_id: 'AGENTS.md', kind: 'agents_md', path: 'AGENTS.md', sha: 'abc123' }],
    acceptance_criteria: ['Fix signup crash'],
    verification_commands: ['pnpm test'],
    forbidden_actions: ['Do not edit .env*'],
    approval_gates: [],
    memory_used: [],
    provenance: {
      source_files: [{ path: 'AGENTS.md', sha: 'abc123' }],
      compiled_at: '2026-06-06T00:00:00.000Z',
      compiler_version: '0.1.0',
    },
  };

  const taskLifecycle = {
    createTask: vi.fn((input: any) => ({
      ok: true,
      data: {
        id: 'task-1',
        workspace_id: input.workspace_id,
        thread_id: input.thread_id,
        trace_id: 'trace-1',
        requester: input.requester,
        assignee: input.assignee,
        connector: input.connector,
        payload: input.payload,
        metadata: input.metadata ?? {},
        tags: input.tags ?? [],
      },
    })),
    updateTaskMetadata: vi.fn((taskId: string, input: any) => ({
      ok: true,
      data: {
        id: taskId,
        workspace_id: 'ws-1',
        thread_id: 'thread-1',
        trace_id: 'trace-1',
        requester: { agent_id: 'multi-dispatch', platform: 'recoder_backend' },
        assignee: { agent_id: 'codex', platform: 'codex' },
        connector: { connector_id: 'dispatch-codex', platform: 'codex', protocol: 'jsonrpc' },
        payload: { kind: 'text', text: 'Fix signup crash' },
        metadata: input.metadataPatch,
      },
    })),
    appendTaskArtifacts: vi.fn((taskId: string) => ({
      ok: true,
      data: {
        id: taskId,
        workspace_id: 'ws-1',
        thread_id: 'thread-1',
        trace_id: 'trace-1',
        requester: { agent_id: 'multi-dispatch', platform: 'recoder_backend' },
        assignee: { agent_id: 'codex', platform: 'codex' },
        connector: { connector_id: 'dispatch-codex', platform: 'codex', protocol: 'jsonrpc' },
        payload: { kind: 'text', text: 'Fix signup crash' },
        metadata: {},
      },
    })),
    startTask: vi.fn(() => ({ ok: true })),
    requestInput: vi.fn(() => ({ ok: true })),
    cancelTask: vi.fn(() => ({ ok: true })),
  };

  return {
    sendToAgent,
    getRecentContext,
    fakeBundle,
    taskLifecycle,
  };
});

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

vi.mock('dockerode', () => ({
  default: class Docker {
    async listContainers() {
      return [];
    }
  },
}));

vi.mock('../workspace.service', () => ({
  getWorkspaceService: () => ({
    get: () => ({
      workspaceId: 'ws-1',
      projectId: 'project-1',
      ownerId: 'owner-1',
      defaultChannelId: 'channel-1',
      memberAgentIds: ['codex'],
      settings: {
        defaultOrchestrationPattern: 'direct',
        maxConcurrentTasks: 2,
        worktreeIsolation: false,
        approvalRequired: false,
      },
    }),
  }),
}));

vi.mock('../task-lifecycle.service', () => ({
  getTaskLifecycleService: () => mocks.taskLifecycle,
}));

vi.mock('../compiled-instructions', () => ({
  compileInstructionBundleForTask: vi.fn(() => mocks.fakeBundle),
  buildInstructionBundleMetadata: vi.fn((bundle: any) => ({ sharedGoal: bundle.shared_goal })),
  buildInstructionBundleArtifact: vi.fn((taskId: string, bundle: any) => ({
    key: `instruction-bundle:${taskId}`,
    artifact_type: 'custom',
    mime_type: 'application/json',
    content: JSON.stringify(bundle),
  })),
  INSTRUCTION_BUNDLE_TRIGGER: 'agent-os-compiler',
}));

vi.mock('../agent-bridge.service', () => ({
  getAgentBridgeService: () => ({
    isAgentOnline: () => true,
    sendToAgent: mocks.sendToAgent,
    getAgent: () => ({ status: 'online' }),
  }),
}));

vi.mock('../memory-store', () => ({
  getRecentContext: mocks.getRecentContext,
}));

vi.mock('../agent-registry.service', () => ({
  getAgentRegistryService: () => ({
    get: () => ({ identity: { platform: 'codex' } }),
  }),
}));

vi.mock('../approval-gate.service', () => ({
  getApprovalGateService: () => ({
    createRequest: vi.fn(),
    onResolved: vi.fn(),
  }),
}));

vi.mock('../a2a-persistence', () => ({
  loadA2ADispatches: () => new Map(),
  saveA2ADispatches: vi.fn(),
}));

vi.mock('../collaboration.service', () => ({
  getCollaborationSvc: () => ({
    createThread: () => ({ id: 'thread-1' }),
    sendMessage: vi.fn(),
  }),
}));

vi.mock('../worktree-manager.service', () => ({
  getWorktreeManagerService: () => ({
    createWorktree: vi.fn(),
  }),
}));

vi.mock('../a2a-event-bus', () => ({
  A2AEventType: {
    TaskCompleted: 'task.completed',
    TaskFailed: 'task.failed',
    TaskCancelled: 'task.cancelled',
  },
  getA2AEventBus: () => ({
    publish: vi.fn(),
    subscribeTask: vi.fn(() => () => undefined),
  }),
}));

vi.mock('../capability-matcher.service', () => ({
  getCapabilityMatcher: () => ({
    matchAgents: () => ({ matches: [] }),
  }),
}));

import { MultiDispatchService } from '../multi-dispatch.service';

describe('MultiDispatchService compiled instructions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches compiled instruction bundles and dispatches the compiled prompt to bridge agents', async () => {
    const service = new MultiDispatchService();

    await service.dispatch('ws-1', {
      prompt: 'Fix signup crash',
      agentIds: ['codex'],
      priority: 'high',
      worktreeIsolation: false,
    } as any);

    expect(mocks.taskLifecycle.updateTaskMetadata).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        metadataPatch: expect.objectContaining({
          instructionBundle: expect.objectContaining({
            sharedGoal: 'Fix signup crash',
          }),
        }),
      }),
    );
    expect(mocks.taskLifecycle.appendTaskArtifacts).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        artifacts: expect.arrayContaining([
          expect.objectContaining({
            key: 'instruction-bundle:task-1',
          }),
        ]),
      }),
    );
    expect(mocks.getRecentContext).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Fix signup crash',
        userId: 'owner-1',
      }),
    );
    expect(mocks.sendToAgent).toHaveBeenCalledWith(
      'codex',
      expect.objectContaining({
        type: 'task.assigned',
        taskId: 'task-1',
        prompt: 'Read AGENTS.md and fix signup crash.',
        context: expect.objectContaining({
          instructionBundle: expect.objectContaining({
            shared_goal: 'Fix signup crash',
          }),
        }),
      }),
    );
  });
});
