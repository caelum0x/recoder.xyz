/**
 * logs-engine — the concrete executor behind the `recoder.logs` MCP server,
 * over the canonical RunEvent store. Lets an AGENT inspect and annotate the run
 * log: read the recent stream for a run, search across events, append a note,
 * or attach a log line to an artifact. Runs behind the interop gate.
 *
 * Reads/writes the SAME event log the cockpit streams and the audit trail reads,
 * so an agent's note shows up in the conversation. Never fabricates a result.
 */
import { randomUUID } from 'node:crypto';
import { logsMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolCallInput } from '@recoder/agent-mcp';
import type { RunEvent } from '@recoder/agent-os';
import type { AgentOsRepository } from '../repositories/agent-os.repository.js';

const MAX = 200;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function runId(input: McpToolCallInput): string | undefined {
  return str(input.args.runId) ?? (input.task?.taskId ? `run_${input.task.taskId}` : undefined);
}

export function registerLogsMcpTools(router: McpToolRouter, repository: AgentOsRepository): void {
  router.register(logsMcpServer, 'logs.stream', async (input) => {
    const rid = runId(input);
    if (!rid) throw new Error('runId is required');
    const all = await repository.listEvents();
    const limit = num(input.args.limit) ?? 50;
    const forRun = all.filter((e) => e.runId === rid);
    return { content: forRun.slice(-limit) };
  });

  router.register(logsMcpServer, 'logs.search', async (input) => {
    const query = str(input.args.query);
    if (!query) throw new Error('query is required');
    const all = await repository.listEvents();
    const needle = query.toLowerCase();
    const rid = str(input.args.runId);
    const matched = all.filter(
      (e) =>
        (!rid || e.runId === rid) && (e.message ?? '').toLowerCase().includes(needle),
    );
    return { content: matched.slice(0, MAX) };
  });

  router.register(logsMcpServer, 'logs.append', async (input) => {
    const rid = runId(input);
    const message = str(input.args.message);
    if (!rid) throw new Error('runId is required');
    if (!message) throw new Error('message is required');
    const event: RunEvent = {
      eventId: `event_${randomUUID()}`,
      type: 'log',
      taskId: str(input.args.taskId) ?? input.task?.taskId ?? rid.replace(/^run_/, ''),
      runId: rid,
      agentId: input.actor?.agentId,
      message,
      createdAt: new Date().toISOString(),
      data: { source: 'agent' },
    };
    return { content: await repository.appendEvent(event) };
  });

  router.register(logsMcpServer, 'logs.attach', async (input) => {
    const rid = runId(input);
    const artifactId = str(input.args.artifactId);
    if (!rid) throw new Error('runId is required');
    if (!artifactId) throw new Error('artifactId is required');
    const event: RunEvent = {
      eventId: `event_${randomUUID()}`,
      type: 'artifact',
      taskId: str(input.args.taskId) ?? input.task?.taskId ?? rid.replace(/^run_/, ''),
      runId: rid,
      agentId: input.actor?.agentId,
      message: str(input.args.message) ?? `Attached artifact ${artifactId}`,
      artifactId,
      createdAt: new Date().toISOString(),
    };
    return { content: await repository.appendEvent(event) };
  });
}
