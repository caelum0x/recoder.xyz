/**
 * store-engines — concrete executors for the `recoder.approvals` and
 * `recoder.artifacts` MCP servers, over the canonical agent-os repository.
 *
 * Closes the governance loop FROM the agent's side:
 *  - Approvals: an agent can REQUEST approval before a sensitive action, check
 *    an approval's status, and list approvals. Deciding is a reviewer action
 *    (the tool exists, but a human/policy resolves it).
 *  - Artifacts: an agent can ATTACH its output (a report, a patch, a log) to the
 *    task's audit trail, list/get artifacts, and link provenance.
 *
 * Everything persists through the SAME store-of-record the control plane reads,
 * so an agent's approval request or artifact shows up in the cockpit and the
 * audit trail. Runs behind the interop gate. Never fabricates a result.
 */
import { randomUUID } from 'node:crypto';
import {
  approvalsMcpServer,
  artifactsMcpServer,
} from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolCallInput } from '@recoder/agent-mcp';
import { decideApproval, type Approval, type Artifact } from '@recoder/agent-os';
import type { AgentOsRepository } from '../repositories/agent-os.repository.js';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function actorId(input: McpToolCallInput): string {
  return input.actor?.agentId || 'agent';
}

function taskId(input: McpToolCallInput): string | undefined {
  return str(input.args.taskId) ?? input.task?.taskId;
}

export function registerApprovalsMcpTools(
  router: McpToolRouter,
  repository: AgentOsRepository,
): void {
  router.register(approvalsMcpServer, 'approvals.list', async (input) => {
    const all = await repository.listApprovals();
    const tid = taskId(input);
    const status = str(input.args.status);
    const filtered = all.filter(
      (a) => (!tid || a.taskId === tid) && (!status || a.status === status),
    );
    return { content: filtered };
  });

  router.register(approvalsMcpServer, 'approvals.status', async (input) => {
    const id = str(input.args.approvalId) ?? str(input.args.id);
    if (!id) throw new Error('approvalId is required');
    const all = await repository.listApprovals();
    const found = all.find((a) => a.approvalId === id);
    if (!found) throw new Error(`approval not found: ${id}`);
    return { content: found };
  });

  router.register(approvalsMcpServer, 'approvals.request', async (input) => {
    const tid = taskId(input);
    if (!tid) throw new Error('taskId is required to request approval');
    const reason = str(input.args.reason);
    if (!reason) throw new Error('reason is required');
    const approval: Approval = {
      approvalId: `appr_${randomUUID()}`,
      taskId: tid,
      runId: str(input.args.runId),
      status: 'pending',
      reason,
      requestedBy: actorId(input),
      requestedAt: new Date().toISOString(),
      requiredAt: (str(input.args.requiredAt) as Approval['requiredAt']) ?? 'before_sensitive_action',
      target: {
        path: str(input.args.path),
        command: str(input.args.command),
        toolName: str(input.args.toolName),
      },
    };
    return { content: await repository.upsertApproval(approval) };
  });

  router.register(approvalsMcpServer, 'approvals.decide', async (input) => {
    const id = str(input.args.approvalId) ?? str(input.args.id);
    if (!id) throw new Error('approvalId is required');
    const decision = str(input.args.decision);
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new Error("decision must be 'approved' or 'rejected'");
    }
    const all = await repository.listApprovals();
    const found = all.find((a) => a.approvalId === id);
    if (!found) throw new Error(`approval not found: ${id}`);
    const decided = decideApproval(found, decision, {
      decidedBy: str(input.args.decidedBy) ?? actorId(input),
      decisionReason: str(input.args.reason),
    });
    return { content: await repository.upsertApproval(decided) };
  });
}

export function registerArtifactsMcpTools(
  router: McpToolRouter,
  repository: AgentOsRepository,
): void {
  router.register(artifactsMcpServer, 'artifacts.list', async (input) => {
    const all = await repository.listArtifacts();
    const tid = taskId(input);
    return { content: tid ? all.filter((a) => a.taskId === tid) : all };
  });

  router.register(artifactsMcpServer, 'artifacts.get', async (input) => {
    const id = str(input.args.artifactId) ?? str(input.args.id);
    if (!id) throw new Error('artifactId is required');
    const all = await repository.listArtifacts();
    const found = all.find((a) => a.artifactId === id);
    if (!found) throw new Error(`artifact not found: ${id}`);
    return { content: found };
  });

  router.register(artifactsMcpServer, 'artifacts.create', async (input) => {
    const tid = taskId(input);
    if (!tid) throw new Error('taskId is required to create an artifact');
    const content = str(input.args.content);
    const path = str(input.args.path);
    if (!content && !path) throw new Error('artifact requires content or a path');
    const artifact: Artifact = {
      artifactId: `art_${randomUUID()}`,
      taskId: tid,
      runId: str(input.args.runId),
      kind: (str(input.args.kind) as Artifact['kind']) ?? 'report',
      mimeType: str(input.args.mimeType) ?? 'text/plain',
      path,
      content,
      public: input.args.public === true,
      createdAt: new Date().toISOString(),
      createdBy: actorId(input),
    };
    return { content: await repository.upsertArtifact(artifact) };
  });

  router.register(artifactsMcpServer, 'artifacts.link', async (input) => {
    const id = str(input.args.artifactId) ?? str(input.args.id);
    if (!id) throw new Error('artifactId is required');
    const all = await repository.listArtifacts();
    const found = all.find((a) => a.artifactId === id);
    if (!found) throw new Error(`artifact not found: ${id}`);
    const linked: Artifact = {
      ...found,
      provenance: {
        ...(found.provenance ?? {}),
        sourceTaskId: str(input.args.sourceTaskId) ?? found.provenance?.sourceTaskId,
        sourceRunId: str(input.args.sourceRunId) ?? found.provenance?.sourceRunId,
        sourceUrl: str(input.args.sourceUrl) ?? found.provenance?.sourceUrl,
      },
    };
    return { content: await repository.upsertArtifact(linked) };
  });
}
