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
import { getCapabilityMatcher, type TaskRequirements } from './capability-matcher.service';
import { classifyIntent, type IntentClassification } from './intent-gate';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getTaskResultAggregator } from './task-result-aggregator';
import { getCollaborationSvc } from './collaboration.service';
import { getWorkspaceService } from './workspace.service';
import { getWorktreeManagerService } from './worktree-manager.service';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { getAgentBridgeService } from './agent-bridge.service';
import { getAgentRegistryService } from './agent-registry.service';
import { getApprovalGateService } from './approval-gate.service';
import { loadA2ADispatches, saveA2ADispatches } from './a2a-persistence';
import { getRecentContext } from './memory-store';
import {
  buildInstructionBundleArtifact,
  buildInstructionBundleMetadata,
  compileInstructionBundleForTask,
  INSTRUCTION_BUNDLE_TRIGGER,
} from './compiled-instructions';
import { createLogger } from '../logger';
import type {
  OrchestrationPattern,
  AggregationStrategy,
  DispatchRecord,
  DispatchStatus,
  MultiDispatchRequest,
  TaskRoutingHints,
  WorktreeInfo,
  RecoderAgentPlatform,
} from '@recoder/shared/a2a';
import type { CreateTaskInput } from './task-lifecycle.service';
import type { InstructionBundle } from '@recoder/a2a-sdk';

const logger = createLogger('a2a-multi-dispatch');
const docker = new Docker();

function deriveConnectorProtocol(platform: string): 'jsonrpc' | 'mcp' | 'rest' {
  if (platform === 'claude_code') return 'mcp';
  if (platform === 'codex' || platform === 'cursor' || platform === 'windsurf') return 'jsonrpc';
  return 'rest';
}

function readPlatformForAgent(agentId: string, fallback?: RecoderAgentPlatform): RecoderAgentPlatform {
  const registryAgent = getAgentRegistryService().get(agentId);
  return registryAgent?.identity.platform ?? fallback ?? 'custom';
}

async function dispatchTaskToBridgeAgent(input: {
  workspaceId: string;
  dispatchId: string;
  agentId: string;
  taskId: string;
  prompt: string;
  instructionBundle?: InstructionBundle | null;
  priority: string;
  ownerId: string;
  worktreeInfo?: WorktreeInfo;
  routingReason?: string;
}): Promise<void> {
  const bridge = getAgentBridgeService();
  if (!bridge.isAgentOnline(input.agentId)) return;

  let memoryContext: Array<{ content: string; type: string; score?: number }> = [];
  const memoryQuery = input.instructionBundle?.shared_goal || input.prompt;
  try {
    if (input.ownerId) {
      const memories = await getRecentContext({
        query: memoryQuery,
        userId: input.ownerId,
        limit: 10,
      });
      memoryContext = memories.map((m) => ({
        content: m.content,
        type: m.type,
        score: m.score,
      }));
    }
  } catch (memErr) {
    logger.debug({ err: memErr }, 'memory context injection skipped');
  }

  bridge.sendToAgent(input.agentId, {
    type: 'task.assigned',
    taskId: input.taskId,
    prompt: input.instructionBundle?.agent_specific_prompt || input.prompt,
    context: {
      workspaceId: input.workspaceId,
      dispatchId: input.dispatchId,
      priority: input.priority,
      ...(input.worktreeInfo ? {
        worktreeBranch: input.worktreeInfo.branchName,
        worktreePath: input.worktreeInfo.worktreePath,
      } : {}),
      ...(input.routingReason ? { routingReason: input.routingReason } : {}),
      ...(input.instructionBundle ? { instructionBundle: input.instructionBundle } : {}),
      ...(memoryContext.length > 0 ? { memories: memoryContext } : {}),
    },
  });

  const connected = bridge.getAgent(input.agentId);
  if (connected) connected.status = 'working';
}

export interface DerivedRoutingPlan {
  requirements: TaskRequirements;
  runtimeCategory: NonNullable<TaskRoutingHints['runtimeCategory']>;
  intent: IntentClassification;
}

export function deriveRoutingPlan(
  prompt: string,
  routingHints?: TaskRoutingHints,
): DerivedRoutingPlan {
  const intent = classifyIntent(prompt);

  const defaultsByCategory: Record<
    IntentClassification['category'],
    {
      runtimeCategory: NonNullable<TaskRoutingHints['runtimeCategory']>;
      requiredCapabilities: string[];
      preferredCapabilities: string[];
      preferredPlatform?: string;
    }
  > = {
    'bug-fix': {
      runtimeCategory: 'implementation',
      requiredCapabilities: ['code-generation'],
      preferredCapabilities: ['code-review'],
      preferredPlatform: 'codex',
    },
    feature: {
      runtimeCategory: 'implementation',
      requiredCapabilities: ['code-generation'],
      preferredCapabilities: ['testing'],
      preferredPlatform: 'codex',
    },
    refactor: {
      runtimeCategory: 'implementation',
      requiredCapabilities: ['code-generation'],
      preferredCapabilities: ['refactoring'],
      preferredPlatform: 'codex',
    },
    test: {
      runtimeCategory: 'implementation',
      requiredCapabilities: ['testing'],
      preferredCapabilities: ['code-generation'],
      preferredPlatform: 'codex',
    },
    doc: {
      runtimeCategory: 'documentation',
      requiredCapabilities: ['code-review'],
      preferredCapabilities: ['documentation'],
      preferredPlatform: 'claude_code',
    },
    visual: {
      runtimeCategory: 'visual',
      requiredCapabilities: ['web-interface'],
      preferredCapabilities: ['design', 'ui'],
      preferredPlatform: 'recoder_web',
    },
    debug: {
      runtimeCategory: 'debug',
      requiredCapabilities: ['code-review'],
      preferredCapabilities: ['debugging'],
      preferredPlatform: 'claude_code',
    },
    other: {
      runtimeCategory: 'general',
      requiredCapabilities: [],
      preferredCapabilities: [],
    },
  };

  const categoryDefaults = defaultsByCategory[intent.category];

  return {
    requirements: {
      requiredCapabilities:
        routingHints?.requiredCapabilities ?? categoryDefaults.requiredCapabilities,
      preferredCapabilities:
        routingHints?.preferredCapabilities ?? categoryDefaults.preferredCapabilities,
      preferredPlatform:
        routingHints?.preferredPlatform ?? categoryDefaults.preferredPlatform,
    },
    runtimeCategory: routingHints?.runtimeCategory ?? categoryDefaults.runtimeCategory,
    intent,
  };
}

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
    const selectedPlatforms: Record<string, RecoderAgentPlatform> = {};
    const routingPlan = deriveRoutingPlan(request.prompt, request.routingHints);

    if (request.autoRoute || (!request.agentIds?.length)) {
      // Auto-route using capability matcher
      const matcher = getCapabilityMatcher();
      const matchResult = matcher.matchAgents({
        ...routingPlan.requirements,
        tags: [],
      });

      // Filter to workspace members
      const selectedMatches = matchResult.matches
        .filter((m) => ws.memberAgentIds.includes(m.agentId))
        .sort((a, b) => b.score - a.score)
        .slice(0, ws.settings.maxConcurrentTasks);

      agentIds = selectedMatches.map((m) => m.agentId);

      // Capture routing reasons for each selected agent
      for (const m of selectedMatches) {
        routingReasons[m.agentId] = m.reason;
        selectedPlatforms[m.agentId] = readPlatformForAgent(m.agentId, m.platform as RecoderAgentPlatform);
      }

      if (agentIds.length === 0) {
        agentIds = ws.memberAgentIds.slice(0, ws.settings.maxConcurrentTasks);
      }
    } else {
      agentIds = request.agentIds;
    }

    for (const agentId of agentIds) {
      if (!selectedPlatforms[agentId]) {
        selectedPlatforms[agentId] = readPlatformForAgent(agentId);
      }
    }

    // Create a thread in the workspace's default channel before task creation so the
    // canonical task envelopes can share the same thread identity.
    let channelThreadId: string | undefined;
    try {
      const collab = getCollaborationSvc();
      const thread = collab.createThread(
        ws.defaultChannelId,
        `Dispatch: ${request.prompt.slice(0, 80)}`,
      );
      channelThreadId = thread.id;

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
    const worktreeManager = getWorktreeManagerService();
    const taskIds: string[] = [];
    const worktrees: Record<string, WorktreeInfo> = {};
    const compiledBundles = new Map<string, InstructionBundle | null>();

    for (const agentId of agentIds) {
      const platform = selectedPlatforms[agentId];
      const createInput: CreateTaskInput = {
        workspace_id: workspaceId,
        thread_id: channelThreadId ?? `dispatch-${dispatchId}`,
        requester: {
          agent_id: 'multi-dispatch',
          platform: 'recoder_backend',
          name: 'multi-dispatch',
        },
        assignee: {
          agent_id: agentId,
          platform,
        },
        connector: {
          connector_id: `dispatch-${agentId}`,
          platform,
          protocol: deriveConnectorProtocol(platform),
        },
        payload: {
          kind: 'text',
          text: request.prompt,
        },
        metadata: {
          dispatchId,
          orchestrationPattern: pattern,
          runtimeCategory: routingPlan.runtimeCategory,
          routingHints: request.routingHints,
          routingRequirements: routingPlan.requirements,
          intentCategory: routingPlan.intent.category,
          intentConfidence: routingPlan.intent.confidence,
          priority: request.priority ?? 'normal',
          ...(routingReasons[agentId] ? { routingReason: routingReasons[agentId] } : {}),
        },
      };
      const created = taskLifecycle.createTask(createInput);
      if (!created.ok) {
        throw new Error(created.error.message);
      }
      let task = created.data;
      taskIds.push(task.id);

      const compiledBundle = compileInstructionBundleForTask(task);
      compiledBundles.set(task.id, compiledBundle);
      if (compiledBundle) {
        const updatedMetadata = taskLifecycle.updateTaskMetadata(task.id, {
          metadataPatch: {
            instructionBundle: buildInstructionBundleMetadata(compiledBundle),
          },
          triggeredBy: INSTRUCTION_BUNDLE_TRIGGER,
          reason: 'Compiled instruction bundle attached to multi-dispatch task metadata',
        });
        if (updatedMetadata.ok) {
          task = updatedMetadata.data;
        }
        const appendedArtifacts = taskLifecycle.appendTaskArtifacts(task.id, {
          artifacts: [buildInstructionBundleArtifact(task.id, compiledBundle)],
          triggeredBy: INSTRUCTION_BUNDLE_TRIGGER,
          reason: 'Compiled instruction bundle artifact attached to multi-dispatch task',
        });
        if (appendedArtifacts.ok) {
          task = appendedArtifacts.data;
        }
      }

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

      if (ws.settings.approvalRequired) {
        const approval = getApprovalGateService().createRequest({
          workspaceId,
          requestingAgentId: 'multi-dispatch',
          targetAgentId: agentId,
          action: 'dispatch',
          details: {
            prompt: request.prompt,
            dispatchId,
            taskId: task.id,
            priority: request.priority ?? 'normal',
            ...(routingReasons[agentId] ? { routingReason: routingReasons[agentId] } : {}),
          },
          timeoutMs: 300_000,
        });

        taskLifecycle.updateTaskMetadata(task.id, {
          metadataPatch: {
            approval: {
              approvalId: approval.approvalId,
              status: approval.status,
              action: 'dispatch',
              targetAgentId: agentId,
            },
          },
          triggeredBy: 'approval-gate',
          reason: 'Dispatch approval requested',
        });
        taskLifecycle.startTask(task.id, 'approval-gate');
        taskLifecycle.requestInput(
          task.id,
          `Awaiting approval for dispatch to ${agentId}`,
          'approval-gate',
        );

        getA2AEventBus().publish({
          id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
          type: A2AEventType.ApprovalRequested,
          timestamp: new Date().toISOString(),
          data: { approval, taskId: task.id, dispatchId },
          taskId: task.id,
          workspaceId,
        });

        getApprovalGateService().onResolved(approval.approvalId, (resolved) => {
          taskLifecycle.updateTaskMetadata(task.id, {
            metadataPatch: {
              approval: {
                approvalId: resolved.approvalId,
                status: resolved.status,
                action: resolved.action,
                targetAgentId: resolved.targetAgentId,
                resolvedAt: resolved.resolvedAt,
                resolvedBy: resolved.resolvedBy,
              },
            },
            triggeredBy: 'approval-gate',
            reason: `Dispatch approval ${resolved.status}`,
          });

          if (resolved.status === 'granted') {
            taskLifecycle.startTask(task.id, 'approval-gate');
            void dispatchTaskToBridgeAgent({
              workspaceId,
              dispatchId,
              agentId,
              taskId: task.id,
              prompt: request.prompt,
              instructionBundle: compiledBundles.get(task.id) ?? null,
              priority: request.priority ?? 'normal',
              ownerId: ws.ownerId,
              worktreeInfo,
              routingReason: routingReasons[agentId],
            });
          } else {
            taskLifecycle.cancelTask(task.id, `Dispatch approval ${resolved.status}`, 'approval-gate');
          }
        });
      } else {
        void dispatchTaskToBridgeAgent({
          workspaceId,
          dispatchId,
          agentId,
          taskId: task.id,
          prompt: request.prompt,
          instructionBundle: compiledBundles.get(task.id) ?? null,
          priority: request.priority ?? 'normal',
          ownerId: ws.ownerId,
          worktreeInfo,
          routingReason: routingReasons[agentId],
        });
      }
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
      routingHints: request.routingHints,
      intentClassification: {
        category: routingPlan.intent.category,
        confidence: routingPlan.intent.confidence,
        keywords: routingPlan.intent.keywords,
      },
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
