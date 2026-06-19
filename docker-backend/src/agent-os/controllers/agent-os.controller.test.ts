import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import type { TaskRun } from '@recoder/agent-os';
import { InMemoryAgentOsRepository } from '../repositories/in-memory-agent-os.repository';
import { AgentOsController } from './agent-os.controller';

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
