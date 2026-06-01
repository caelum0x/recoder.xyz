/**
 * @module multi-dispatch.service
 *
 * Multi-agent task dispatch for workspace collaboration.
 *
 * Dispatches a prompt to multiple agents simultaneously using the selected
 * orchestration pattern (direct, fan-out, pipeline, competitive). Leverages
 * existing services for capability matching, task lifecycle, and result aggregation.
 */

import { v4 as uuid } from 'uuid';
import Docker from 'dockerode';
import { getAssignmentRouterService } from './assignment-router.service';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getTaskResultAggregator } from './task-result-aggregator';
import { getCollaborationSvc } from './collaboration.service';
import { getWorkspaceService } from './workspace.service';
import { getWorktreeManagerService } from './worktree-manager.service';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { getAgentBridgeService } from './agent-bridge.service';
import { loadA2ADispatches, saveA2ADispatches } from './a2a-persistence';
import { getRecentContext } from './memory-store';
import { createLogger } from '../logger';
import type {
  OrchestrationPattern,
  AggregationStrategy,
  DispatchRecord,
  DispatchStatus,
  MultiDispatchRequest,
  WorktreeInfo,
} from '@recoder/shared/a2a';

const logger = createLogger('a2a-multi-dispatch');
const docker = new Docker();

/**
 * Resolve a Docker container ID from a project ID by matching the `projectId`
 * label applied when the container was created.  Returns `undefined` when no
 * running container is found for the given project.
 */
async function resolveContainerId(projectId: string): Promise<string | undefined> {
  try {
    const containers = await docker.listContainers({
      filters: JSON.stringify({
        label: [`projectId=${projectId}`],
        status: ['running'],
      }),
    });
    if (containers.length > 0) {
      return containers[0].Id;
    }
  } catch (err) {
    logger.warn({ err, projectId }, 'failed to resolve container for project');
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MultiDispatchService {
  private readonly dispatches: Map<string, DispatchRecord>;

  constructor() {
    this.dispatches = loadA2ADispatches();
    logger.info({ count: this.dispatches.size }, 'loaded persisted dispatches');
  }

  private persist(): void {
    saveA2ADispatches(this.dispatches);
  }

  /**
   * Dispatch a prompt to one or more agents.
   */
  async dispatch(
    workspaceId: string,
    request: MultiDispatchRequest,
  ): Promise<DispatchRecord> {
    const dispatchId = `dispatch_${uuid().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const ws = getWorkspaceService().get(workspaceId);

    if (!ws) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const pattern: OrchestrationPattern = request.orchestrationPattern ?? ws.settings.defaultOrchestrationPattern;
    const aggregation: AggregationStrategy = request.aggregationStrategy ?? 'merge-all';

    // Resolve target agents
    let agentIds: string[];
    // Per-agent routing reasons (populated when auto-routing)
    const routingReasons: Record<string, string> = {};

    if (request.autoRoute || (!request.agentIds?.length)) {
      // Auto-route by capability, workspace policy, assignee identity, and A2A
      // intent — runtime lane (protocol/tier) is recorded as secondary metadata.
      const router = getAssignmentRouterService();
      const decision = router.routeWithPolicy(
        {
          requiredCapabilities: request.requiredCapabilities ?? [],
          preferredCapabilities: request.preferredCapabilities ?? [],
          ...(request.intent ? { intent: request.intent } : {}),
        },
        {
          memberAgentIds: ws.memberAgentIds,
          requireHealthy: request.requireHealthy ?? false,
        },
      );

      // Rank candidates (best first) and take up to the workspace concurrency cap.
      const selectedCandidates = decision.candidates.slice(0, ws.settings.maxConcurrentTasks);

      agentIds = selectedCandidates.map((c) => c.agentId);

      // Capture routing reasons for each selected agent
      for (const c of selectedCandidates) {
        routingReasons[c.agentId] = c.reason;
      }

      if (agentIds.length === 0) {
        agentIds = ws.memberAgentIds.slice(0, ws.settings.maxConcurrentTasks);
      }
    } else {
      agentIds = request.agentIds;
    }

    // Determine whether worktree isolation is requested
    const useWorktreeIsolation = request.worktreeIsolation ?? ws.settings.worktreeIsolation;

    // If worktree isolation is enabled, resolve the project's container up front
    let containerId: string | undefined;
    if (useWorktreeIsolation) {
      containerId = await resolveContainerId(ws.projectId);
      if (!containerId) {
        logger.warn(
          { workspaceId, projectId: ws.projectId },
          'worktree isolation requested but no running container found for project – dispatching without isolation',
        );
      }
    }

    // Create tasks for each agent
    const taskLifecycle = getTaskLifecycleService();
    const bridge = getAgentBridgeService();
    const worktreeManager = getWorktreeManagerService();
    const taskIds: string[] = [];
    const worktrees: Record<string, WorktreeInfo> = {};

    for (const agentId of agentIds) {
      const task = taskLifecycle.createTask({
        prompt: request.prompt,
        workspace_id: workspaceId,
        assignee_agent_id: agentId,
        priority: request.priority ?? 'normal',
        metadata: {
          dispatchId,
          orchestrationPattern: pattern,
          ...(routingReasons[agentId] ? { routingReason: routingReasons[agentId] } : {}),
        },
      });
      taskIds.push(task.id);

      // Create an isolated worktree for this agent's task when enabled
      let worktreeInfo: WorktreeInfo | undefined;
      if (useWorktreeIsolation && containerId) {
        try {
          worktreeInfo = await worktreeManager.createWorktree(
            containerId,
            ws.projectId,
            task.id,
            agentId,
          );
          worktrees[task.id] = worktreeInfo;
          logger.info(
            { taskId: task.id, agentId, branch: worktreeInfo.branchName },
            'worktree created for dispatched task',
          );
        } catch (wtErr) {
          logger.warn(
            { err: wtErr, taskId: task.id, agentId },
            'failed to create worktree for task – dispatching without isolation',
          );
        }
      }

      // If the agent is connected via the bridge, push the task assignment
      if (bridge.isAgentOnline(agentId)) {
        // ── Sprint E deep wiring: inject relevant memories into task context ──
        // Fetch top 10 semantically relevant memories for the workspace owner
        // so the receiving agent has persistent context without explicitly recalling.
        let memoryContext: Array<{ content: string; type: string; score?: number }> = [];
        try {
          const wsOwner = ws.ownerId;
          if (wsOwner) {
            const memories = await getRecentContext({
              query: request.prompt,
              userId: wsOwner,
              limit: 10,
            });
            memoryContext = memories.map((m) => ({
              content: m.content,
              type: m.type,
              score: m.score,
            }));
          }
        } catch (memErr) {
          // Non-fatal — dispatch continues without memory context
          logger.debug({ err: memErr }, 'memory context injection skipped');
        }

        bridge.sendToAgent(agentId, {
          type: 'task.assigned',
          taskId: task.id,
          prompt: request.prompt,
          context: {
            workspaceId,
            dispatchId,
            priority: request.priority ?? 'normal',
            ...(worktreeInfo ? {
              worktreeBranch: worktreeInfo.branchName,
              worktreePath: worktreeInfo.worktreePath,
            } : {}),
            ...(memoryContext.length > 0 ? { memories: memoryContext } : {}),
          },
        });
        // Mark agent as working
        const connected = bridge.getAgent(agentId);
        if (connected) connected.status = 'working';
      }
    }

    // Create a thread in the workspace's default channel
    let channelThreadId: string | undefined;
    try {
      const collab = getCollaborationSvc();
      const thread = collab.createThread(
        ws.defaultChannelId,
        `Dispatch: ${request.prompt.slice(0, 80)}`,
      );
      channelThreadId = thread.id;

      // Post system message about the dispatch (include routing reasons when auto-routed)
      const hasRoutingReasons = Object.keys(routingReasons).length > 0;
      let dispatchText = `Multi-dispatch started: "${request.prompt.slice(0, 100)}" → ${agentIds.length} agent(s) [${pattern}]`;
      if (hasRoutingReasons) {
        const reasonLines = agentIds
          .filter((id) => routingReasons[id])
          .map((id) => `  ${id}: ${routingReasons[id]}`)
          .join('\n');
        dispatchText += `\n\nAuto-routed:\n${reasonLines}`;
      }
      collab.sendMessage({
        threadId: thread.id,
        senderAgentId: 'system',
        text: dispatchText,
      });
    } catch (err) {
      logger.warn({ err }, 'failed to create dispatch thread');
    }

    const record: DispatchRecord = {
      dispatchId,
      workspaceId,
      prompt: request.prompt,
      orchestrationPattern: pattern,
      aggregationStrategy: aggregation,
      taskIds,
      agentIds,
      channelThreadId,
      status: 'running',
      results: [],
      ...(Object.keys(worktrees).length > 0 ? { worktrees } : {}),
      ...(Object.keys(routingReasons).length > 0 ? { routingReasons } : {}),
      createdAt: now,
    };

    this.dispatches.set(dispatchId, record);
    this.persist();

    // Publish event
    getA2AEventBus().publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: 'dispatch.started',
      timestamp: now,
      data: { dispatchId, agentIds, pattern },
      workspaceId,
    });

    logger.info(
      { dispatchId, workspaceId, agentCount: agentIds.length, pattern },
      'multi-dispatch started',
    );

    // Monitor task completion
    this.monitorTasks(record);

    return record;
  }

  get(dispatchId: string): DispatchRecord | undefined {
    return this.dispatches.get(dispatchId);
  }

  getResults(dispatchId: string): DispatchRecord | undefined {
    return this.dispatches.get(dispatchId);
  }

  async cancel(dispatchId: string): Promise<boolean> {
    const record = this.dispatches.get(dispatchId);
    if (!record) return false;

    const taskLifecycle = getTaskLifecycleService();
    for (const taskId of record.taskIds) {
      try {
        taskLifecycle.transition(taskId, 'cancelled');
      } catch {
        // Task may already be in terminal state
      }
    }

    record.status = 'cancelled';
    record.completedAt = new Date().toISOString();
    this.persist();

    getA2AEventBus().publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: 'dispatch.cancelled',
      timestamp: record.completedAt,
      data: { dispatchId },
      workspaceId: record.workspaceId,
    });

    return true;
  }

  listByWorkspace(workspaceId: string): DispatchRecord[] {
    return [...this.dispatches.values()]
      .filter((d) => d.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private monitorTasks(record: DispatchRecord): void {
    const bus = getA2AEventBus();
    const completed = new Set<string>();
    const failed = new Set<string>();

    for (const taskId of record.taskIds) {
      const unsub = bus.subscribeTask(taskId, (event) => {
        if (event.type === A2AEventType.TaskCompleted) {
          completed.add(taskId);
          record.results.push(event.data);
          this.persist();
          unsub();
          checkDone();
        } else if (event.type === A2AEventType.TaskFailed || event.type === A2AEventType.TaskCancelled) {
          failed.add(taskId);
          unsub();
          checkDone();
        }
      });
    }

    const checkDone = () => {
      const total = record.taskIds.length;
      const done = completed.size + failed.size;
      if (done >= total) {
        record.status = failed.size === total ? 'failed' : 'completed';
        record.completedAt = new Date().toISOString();
        this.persist();

        getA2AEventBus().publish({
          id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
          type: 'dispatch.completed',
          timestamp: record.completedAt,
          data: {
            dispatchId: record.dispatchId,
            completedTasks: completed.size,
            failedTasks: failed.size,
          },
          workspaceId: record.workspaceId,
        });

        logger.info(
          { dispatchId: record.dispatchId, completed: completed.size, failed: failed.size },
          'multi-dispatch completed',
        );
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: MultiDispatchService | null = null;

export function getMultiDispatchService(): MultiDispatchService {
  if (!_instance) {
    _instance = new MultiDispatchService();
  }
  return _instance;
}

export function resetMultiDispatchService(): void {
  _instance = null;
}
