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
      const approval = approvalGate.createRequest({
        workspaceId: ws.workspaceId,
        requestingAgentId: message.senderAgentId,
        targetAgentId: intent.targetAgentId,
        action: intent.type,
        details: { prompt: intent.prompt, channelId },
        timeoutMs: 300_000, // 5 minutes
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
      });

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
            metadata: { delegationId: delegation.delegationId },
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
