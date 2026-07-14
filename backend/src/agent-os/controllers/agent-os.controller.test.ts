import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import type { AgentProfile, TaskRun } from '@recoder/agent-os';
import { InMemoryAgentOsRepository } from '../repositories/in-memory-agent-os.repository';
import { AgentOsController } from './agent-os.controller';

function healthyAgent(agentId: string): AgentProfile {
  return {
    agentId,
    displayName: agentId,
    vendorSurface: 'codex',
    connectorId: `${agentId}:local`,
    runtimeKind: 'local',
    capabilities: [],
    tools: [],
    supportedTaskIntents: ['feature_delivery'],
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [],
      toolRules: [],
      allowNetwork: true,
      allowShell: true,
      allowGitWrite: true,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
    },
    approvalPolicy: { mode: 'policy', requiredRules: [], allowAutoApprovalForLowRisk: false },
    memoryScope: 'repo',
    cwdPolicy: { mode: 'repo_root', allowedRoots: ['/workspace/repo'] },
    health: { status: 'healthy', checkedAt: '2026-06-13T00:00:00.000Z' },
    lastSeenAt: '2026-06-13T00:00:00.000Z',
  };
}

describe('AgentOsController run event ingestion', () => {
  it('projects embedded runtime evidence from appended run events', async () => {
    const repository = new InMemoryAgentOsRepository();
    const run: TaskRun = {
      runId: 'run-runtime-evidence',
      taskId: 'task-runtime-evidence',
      spaceId: 'space-runtime-evidence',
      state: 'running',
      assigneeAgentId: 'codex',
      updatedAt: '2026-06-13T10:00:00.000Z',
    };
    await repository.upsertRun(run);

    const controller = new AgentOsController(repository);
    const response = createResponse();
    await controller.appendEvent({
      body: {
        eventId: 'event-runtime-evidence',
        type: 'log',
        taskId: run.taskId,
        runId: run.runId,
        agentId: 'codex',
        message: 'Runtime emitted verification evidence',
        createdAt: '2026-06-13T10:01:00.000Z',
        data: {
          runtimeId: 'codex:codex',
          sandboxId: 'sandbox-1',
          sessionId: 'session-1',
          command: 'pnpm test',
          runtimeEvidence: {
            evidenceId: 'evidence-runtime-event',
            kind: 'verification',
            status: 'passed',
            title: 'Runtime verification passed',
            summary: 'pnpm test passed',
          },
        },
      },
    } as Request, response.res);

    expect(response.statusCode).toBe(201);
    expect(response.body?.success).toBe(true);
    expect(response.body?.data.runtimeEvidence).toHaveLength(1);

    const evidence = await repository.listRuntimeEvidence();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      evidenceId: 'evidence-runtime-event',
      taskId: run.taskId,
      runId: run.runId,
      kind: 'verification',
      status: 'passed',
      source: {
        runtimeId: 'codex:codex',
        adapterId: 'codex',
        sandboxId: 'sandbox-1',
        sessionId: 'session-1',
        command: 'pnpm test',
      },
      metadata: {
        sourceRunEventId: 'event-runtime-evidence',
        sourceRunEventType: 'log',
        sourceAgentId: 'codex',
      },
    });

    const outbox = await repository.listOutbox();
    expect(outbox.map((record) => record.event.type)).toEqual([
      'recoder.run.log.appended',
      'recoder.runtime_evidence.created',
    ]);
  });

  it('rejects malformed embedded runtime evidence before storing the run event', async () => {
    const repository = new InMemoryAgentOsRepository();
    const controller = new AgentOsController(repository);
    const response = createResponse();

    await controller.appendEvent({
      body: {
        eventId: 'event-bad-runtime-evidence',
        type: 'log',
        taskId: 'task-runtime-evidence',
        createdAt: '2026-06-13T10:01:00.000Z',
        data: {
          runtimeEvidence: {
            status: 'passed',
          },
        },
      },
    } as Request, response.res);

    expect(response.statusCode).toBe(400);
    expect(response.body?.success).toBe(false);
    expect(response.body?.error).toContain('runtimeEvidence[0].kind');
    expect(await repository.listEvents()).toHaveLength(0);
    expect(await repository.listRuntimeEvidence()).toHaveLength(0);
  });
});

describe('AgentOsController approval loop', () => {
  it('materializes and decides approvals from needs_approval policy decisions', async () => {
    const repository = new InMemoryAgentOsRepository();
    const controller = new AgentOsController(repository);
    const decisionResponse = createResponse();

    await controller.upsertPolicyDecision({
      body: {
        decisionId: 'decision-mcp-tool-call',
        effect: 'needs_approval',
        action: 'mcp.tool.call',
        actorAgentId: 'codex',
        taskId: 'task-mcp-approval',
        reason: 'MCP tool call requires human approval.',
        createdAt: '2026-06-13T10:00:00.000Z',
        approval: {
          required: true,
          gateId: 'approval-mcp-tool-call',
          reason: 'Approve MCP tool call',
        },
        metadata: {
          toolName: 'recoder.github.create_pull_request',
        },
      },
    } as Request, decisionResponse.res);

    expect(decisionResponse.statusCode).toBe(201);
    expect(decisionResponse.body?.data.approval).toMatchObject({
      approvalId: 'approval-mcp-tool-call',
      taskId: 'task-mcp-approval',
      status: 'pending',
      requestedBy: 'codex',
      reason: 'Approve MCP tool call',
      metadata: {
        source: 'policy_decision_ingress',
        policyDecisionId: 'decision-mcp-tool-call',
        policyAction: 'mcp.tool.call',
      },
    });

    const approveResponse = createResponse();
    await controller.approve({
      params: { approvalId: 'approval-mcp-tool-call' },
      body: {
        decidedBy: 'pm-user',
        reason: 'Reviewed in PM queue.',
      },
    } as unknown as Request, approveResponse.res);

    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.body?.data.approval).toMatchObject({
      approvalId: 'approval-mcp-tool-call',
      status: 'approved',
      decidedBy: 'pm-user',
      decisionReason: 'Reviewed in PM queue.',
    });

    const [approval] = await repository.listApprovals();
    expect(approval.status).toBe('approved');
    const outboxTypes = (await repository.listOutbox()).map((record) => record.event.type);
    expect(outboxTypes).toEqual([
      'recoder.approval.requested',
      'recoder.approval.approved',
    ]);
  });
});

describe('AgentOsController run handoff', () => {
  it('reassigns a run to a new agent, preserves state, and records a handoff event', async () => {
    const repository = new InMemoryAgentOsRepository();
    await repository.upsertAgent(healthyAgent('codex'));
    await repository.upsertAgent(healthyAgent('claude'));
    const run: TaskRun = {
      runId: 'run-handoff',
      taskId: 'task-handoff',
      spaceId: 'space-handoff',
      state: 'running',
      assigneeAgentId: 'codex',
      updatedAt: '2026-06-13T10:00:00.000Z',
    };
    await repository.upsertRun(run);

    const controller = new AgentOsController(repository);
    const response = createResponse();
    await controller.handoffRun({
      params: { runId: 'run-handoff' },
      body: {
        toAgentId: 'claude',
        reason: 'Codex hit a blocker; routing to Claude.',
        handoffPrompt: 'Continue run-handoff from the current branch state.',
        requestedBy: 'pm-user',
      },
    } as unknown as Request, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.body?.data).toMatchObject({
      runId: 'run-handoff',
      assigneeAgentId: 'claude',
      state: 'running',
    });
    expect(response.body?.data.metadata.lastHandoff).toMatchObject({
      fromAgentId: 'codex',
      toAgentId: 'claude',
      requestedBy: 'pm-user',
    });

    const events = await repository.listEvents();
    const handoff = events.find((event) => event.type === 'handoff');
    expect(handoff).toMatchObject({
      type: 'handoff',
      runId: 'run-handoff',
      agentId: 'claude',
      data: { fromAgentId: 'codex', toAgentId: 'claude', requestedBy: 'pm-user' },
    });

    const outboxTypes = (await repository.listOutbox()).map((record) => record.event.type);
    expect(outboxTypes).toContain('recoder.run.handoff');
  });

  it('rejects handoff to an unknown agent', async () => {
    const repository = new InMemoryAgentOsRepository();
    const run: TaskRun = {
      runId: 'run-handoff-2',
      taskId: 'task-handoff-2',
      spaceId: 'space-handoff-2',
      state: 'running',
      assigneeAgentId: 'codex',
      updatedAt: '2026-06-13T10:00:00.000Z',
    };
    await repository.upsertRun(run);

    const controller = new AgentOsController(repository);
    const response = createResponse();
    await controller.handoffRun({
      params: { runId: 'run-handoff-2' },
      body: { toAgentId: 'ghost' },
    } as unknown as Request, response.res);

    expect(response.statusCode).toBe(404);
    expect(response.body?.success).toBe(false);
    expect(response.body?.error).toContain('agent not found');
  });
});

function createResponse(): { res: Response; statusCode: number; body: any } {
  const state = {
    statusCode: 200,
    body: undefined as any,
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: any) {
      state.body = body;
      return res;
    },
  } as Response;

  return {
    res,
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
  };
}
