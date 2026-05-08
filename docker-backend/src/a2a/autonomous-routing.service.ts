/**
 * @module autonomous-routing.service
 *
 * Autonomous inter-agent communication via @mention routing.
 *
 * Parses handoff/delegate/review intent from @mentions in channel messages,
 * validates target agent capabilities, and orchestrates delegation + context
 * transfer using existing services.
 *
 * Wires into `CollaborationService.onMention()` callback.
 */

import { v4 as uuid } from 'uuid';
import { getDelegationChainService } from './delegation-chain.service';
import { getContextBridgeService } from './context-bridge.service';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getCollaborationSvc, type MentionEvent } from './collaboration.service';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { getApprovalGateService } from './approval-gate.service';
import { getWorkspaceService } from './workspace.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-autonomous-routing');

// ---------------------------------------------------------------------------
// Intent parsing
// ---------------------------------------------------------------------------

interface ParsedIntent {
  type: 'handoff' | 'delegate' | 'review' | 'message';
  targetAgentId: string;
  prompt: string;
}

const INTENT_PREFIXES: Record<string, 'handoff' | 'delegate' | 'review'> = {
  'handoff:': 'handoff',
  'delegate:': 'delegate',
  'review:': 'review',
};

function parseIntent(text: string, mentionedAgentIds: string[]): ParsedIntent | null {
  if (mentionedAgentIds.length === 0) return null;

  const targetAgentId = mentionedAgentIds[0];

  // Find intent prefix after the @mention
  const mentionPattern = new RegExp(`@${targetAgentId}\\s*`, 'i');
  const afterMention = text.replace(mentionPattern, '').trim();

  for (const [prefix, type] of Object.entries(INTENT_PREFIXES)) {
    if (afterMention.toLowerCase().startsWith(prefix)) {
      return {
        type,
        targetAgentId,
        prompt: afterMention.slice(prefix.length).trim(),
      };
    }
  }

  // Default: treat as a regular message (no delegation)
  return {
    type: 'message',
    targetAgentId,
    prompt: afterMention,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AutonomousRoutingService {
  private findLatestSourceTask(
    senderAgentId: string,
    threadId?: string,
  ): { id: string; state: string } | null {
    const taskLifecycle = getTaskLifecycleService();
    if (threadId) {
      const inThread = taskLifecycle.list({
        thread_id: threadId,
        assignee_agent_id: senderAgentId,
        limit: 1,
      });
      if (inThread.length > 0) {
        return { id: inThread[0].id, state: inThread[0].state };
      }
    }

    const latest = taskLifecycle.list({ assignee_agent_id: senderAgentId, limit: 1 });
    if (latest.length > 0) {
      return { id: latest[0].id, state: latest[0].state };
    }

    return null;
  }

  /**
   * Process a @mention from the collaboration service.
   * Called via `CollaborationService.onMention()` callback.
   */
  async processHandoff(event: MentionEvent): Promise<void> {
    const { message, channelId, mentionedAgentIds } = event;
    const intent = parseIntent(message.text, mentionedAgentIds);

    if (!intent || intent.type === 'message') {
      logger.debug({ channelId, mentionedAgentIds }, 'mention without delegation intent, skipping');
      return;
    }

    logger.info(
      { intent: intent.type, from: message.senderAgentId, to: intent.targetAgentId },
      'processing autonomous handoff',
    );

    const now = new Date().toISOString();
    const bus = getA2AEventBus();

    // Check if workspace requires approval
    const ws = this.findWorkspaceForChannel(channelId);
    if (ws?.settings.approvalRequired) {
      const approvalGate = getApprovalGateService();
      const sourceTask = this.findLatestSourceTask(message.senderAgentId, message.threadId);
      const approval = approvalGate.createRequest({
        workspaceId: ws.workspaceId,
        requestingAgentId: message.senderAgentId,
        targetAgentId: intent.targetAgentId,
        action: intent.type,
        details: {
          prompt: intent.prompt,
          channelId,
          threadId: message.threadId,
          sourceTaskId: sourceTask?.id || '',
          handoffType: intent.type,
        },
        timeoutMs: 300_000, // 5 minutes
      });

      if (sourceTask) {
        const lifecycle = getTaskLifecycleService();
        if (sourceTask.state !== 'input-required') {
          lifecycle.requestInput(
            sourceTask.id,
            `Awaiting approval for ${intent.type} to @${intent.targetAgentId}`,
            'approval-gate',
          );
        }
        lifecycle.updateTaskMetadata(sourceTask.id, {
          metadataPatch: {
            approval: {
              approvalId: approval.approvalId,
              status: approval.status,
              action: intent.type,
              targetAgentId: intent.targetAgentId,
            },
            handoff: {
              status: 'awaiting-approval',
              targetAgentId: intent.targetAgentId,
              channelId,
              threadId: message.threadId,
            },
          },
          triggeredBy: 'approval-gate',
          reason: 'Delegation approval requested',
        });
      }

      approvalGate.onResolved(approval.approvalId, (resolved) => {
        const resolvedTaskId =
          typeof resolved.details.sourceTaskId === 'string' && resolved.details.sourceTaskId
            ? resolved.details.sourceTaskId
            : sourceTask?.id;

        if (resolvedTaskId) {
          const lifecycle = getTaskLifecycleService();
          lifecycle.updateTaskMetadata(resolvedTaskId, {
            metadataPatch: {
              approval: {
                approvalId: resolved.approvalId,
                status: resolved.status,
                resolvedAt: resolved.resolvedAt,
                resolvedBy: resolved.resolvedBy,
                action: resolved.action,
                targetAgentId: resolved.targetAgentId,
              },
              handoff: {
                status: resolved.status === 'granted' ? 'approved' : resolved.status,
                targetAgentId: resolved.targetAgentId,
                channelId,
                threadId: message.threadId,
              },
            },
            triggeredBy: 'approval-gate',
            reason: `Delegation approval ${resolved.status}`,
          });

          if (resolved.status === 'granted') {
            const currentTask = lifecycle.getTask(resolvedTaskId);
            if (currentTask.ok && currentTask.data.state === 'input-required') {
              lifecycle.startTask(resolvedTaskId, 'approval-gate');
            }
          }
        }

        if (resolved.status === 'granted') {
          void this.executeDelegation(intent, message.senderAgentId, channelId, {
            sourceTaskId: resolvedTaskId,
            approvalId: resolved.approvalId,
          }).catch((err) => {
            logger.error({ err, approvalId: resolved.approvalId }, 'approved delegation failed to execute');
            if (resolvedTaskId) {
              getTaskLifecycleService().updateTaskMetadata(resolvedTaskId, {
                metadataPatch: {
                  handoff: {
                    status: 'failed',
                    targetAgentId: intent.targetAgentId,
                    channelId,
                    threadId: message.threadId,
                    approvalId: resolved.approvalId,
                    error: err instanceof Error ? err.message : String(err),
                  },
                },
                triggeredBy: 'approval-gate',
                reason: 'Approved delegation failed to execute',
              });
            }
          });
        }
      });

      // Post approval request in channel
      try {
        getCollaborationSvc().sendMessage({
          threadId: message.threadId,
          senderAgentId: 'system',
          text: `Approval required: ${message.senderAgentId} wants to ${intent.type} to @${intent.targetAgentId}. Approve or reject.`,
        });
      } catch { /* ignore */ }

      bus.publish({
        id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
        type: A2AEventType.ApprovalRequested,
        timestamp: now,
        data: { approval },
        channelId,
        workspaceId: ws.workspaceId,
      });

      logger.info({ approvalId: approval.approvalId }, 'awaiting approval for handoff');
      return;
    }

    // Execute delegation directly
    await this.executeDelegation(intent, message.senderAgentId, channelId);
  }

  /**
   * Execute a delegation after approval (or directly if no approval needed).
   */
  async executeDelegation(
    intent: ParsedIntent,
    fromAgentId: string,
    channelId: string,
    context?: { sourceTaskId?: string; approvalId?: string },
  ): Promise<void> {
    const now = new Date().toISOString();
    const bus = getA2AEventBus();

    // Publish handoff initiated event
    bus.publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: A2AEventType.HandoffInitiated,
      timestamp: now,
      data: {
        from: fromAgentId,
        to: intent.targetAgentId,
        intent: intent.type,
        prompt: intent.prompt,
      },
      channelId,
    });

    try {
      // Create delegation via delegation chain service
      const delegationChain = getDelegationChainService();
      const delegation = delegationChain.delegate({
        fromAgentId,
        toAgentId: intent.targetAgentId,
        prompt: intent.prompt,
        priority: 'normal',
        metadata: {
          channelId,
          ...(context?.sourceTaskId ? { sourceTaskId: context.sourceTaskId } : {}),
          ...(context?.approvalId ? { approvalId: context.approvalId } : {}),
        },
      });

      if (context?.sourceTaskId) {
        getTaskLifecycleService().updateTaskMetadata(context.sourceTaskId, {
          metadataPatch: {
            handoff: {
              status: 'delegated',
              delegationId: delegation.delegationId,
              targetAgentId: intent.targetAgentId,
              channelId,
              ...(context.approvalId ? { approvalId: context.approvalId } : {}),
            },
          },
          triggeredBy: fromAgentId,
          reason: 'Delegation created',
        });
      }

      // Transfer context
      try {
        const contextBridge = getContextBridgeService();
        // Find a task from the source agent to transfer context from
        const taskLifecycle = getTaskLifecycleService();
        const sourceTasks = taskLifecycle.list({ assignee_agent_id: fromAgentId, limit: 1 });
        if (sourceTasks.length > 0) {
          const delegationTask = taskLifecycle.createTask({
            prompt: intent.prompt,
            assignee_agent_id: intent.targetAgentId,
            metadata: {
              delegationId: delegation.delegationId,
              handoffFromAgentId: fromAgentId,
              handoffToAgentId: intent.targetAgentId,
              handoffChannelId: channelId,
              ...(context?.sourceTaskId ? { handoffSourceTaskId: context.sourceTaskId } : {}),
              ...(context?.approvalId ? { approvalId: context.approvalId } : {}),
            },
          });

          await contextBridge.transferContext(sourceTasks[0].id, delegationTask.id);
        }
      } catch (err) {
        logger.warn({ err }, 'context transfer failed, delegation continues without context');
      }

      // Post confirmation in channel
      try {
        const collab = getCollaborationSvc();
        const channel = collab.getChannel(channelId);
        if (channel) {
          const threads = collab.listThreads(channelId);
          const threadId = threads.length > 0 ? threads[threads.length - 1].id : undefined;
          if (threadId) {
            collab.sendMessage({
              threadId,
              senderAgentId: 'system',
              text: `${intent.type} from ${fromAgentId} → @${intent.targetAgentId}: "${intent.prompt.slice(0, 100)}"`,
            });
          }
        }
      } catch { /* ignore */ }

      // Publish handoff completed
      bus.publish({
        id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
        type: A2AEventType.HandoffCompleted,
        timestamp: new Date().toISOString(),
        data: {
          delegationId: delegation.delegationId,
          from: fromAgentId,
          to: intent.targetAgentId,
        },
        channelId,
      });

      logger.info(
        { delegationId: delegation.delegationId, from: fromAgentId, to: intent.targetAgentId },
        'handoff completed',
      );
    } catch (err) {
      logger.error({ err }, 'delegation failed');
    }
  }

  private findWorkspaceForChannel(channelId: string): ReturnType<typeof getWorkspaceService>['get'] extends (...args: any[]) => infer R ? R : never {
    const wsSvc = getWorkspaceService();
    const allWs = wsSvc.list();
    return allWs.find((ws) => ws.defaultChannelId === channelId) as any;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: AutonomousRoutingService | null = null;

export function getAutonomousRoutingService(): AutonomousRoutingService {
  if (!_instance) {
    _instance = new AutonomousRoutingService();
  }
  return _instance;
}

export function resetAutonomousRoutingService(): void {
  _instance = null;
}

// ---------------------------------------------------------------------------
// Wire into collaboration service
// ---------------------------------------------------------------------------

/**
 * Connect autonomous routing to the collaboration service's mention callback.
 * Call this during server startup.
 */
export function wireAutonomousRouting(): void {
  const collab = getCollaborationSvc();
  const router = getAutonomousRoutingService();
  collab.onMention((event) => {
    router.processHandoff(event).catch((err) => {
      logger.error({ err }, 'autonomous routing error');
    });
  });
  logger.info('autonomous routing wired to collaboration service');
}
