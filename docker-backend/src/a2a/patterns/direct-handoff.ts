/**
 * @module patterns/direct-handoff
 */

import type {
  CollaborationPattern,
  PatternConfig,
  PatternInput,
  PatternResult,
  AgentRef,
} from './types';
import { getTaskLifecycleService } from '../task-lifecycle.service';
import { getContextBridgeService } from '../context-bridge.service';
import { getCollaborationSvc } from '../collaboration.service';

export class DirectHandoffPattern implements CollaborationPattern {
  readonly patternType = 'direct-handoff' as const;

  async execute(config: PatternConfig, input: PatternInput): Promise<PatternResult> {
    if (input.kind !== 'direct-handoff') {
      return { success: false, patternType: this.patternType, taskIds: [], error: 'Invalid input kind' };
    }

    const lifecycle = getTaskLifecycleService();
    const contextBridge = getContextBridgeService();
    const taskIds: string[] = [];

    const channelId = this.ensureChannel(config, [config.requester, input.agentA, input.agentB]);
    const threadId = this.ensureThread(channelId);

    try {
      const taskA = lifecycle.createTask({
        workspace_id: config.workspaceId,
        thread_id: config.threadId,
        requester: config.requester,
        assignee: input.agentA,
        connector: { connector_id: 'pattern-direct-handoff', platform: input.agentA.platform, protocol: 'a2a' },
        payload: { kind: 'text', text: input.prompt },
        tags: ['pattern:direct-handoff', 'phase:a'],
      });
      if (taskA.ok === false) return { success: false, patternType: this.patternType, taskIds, error: taskA.error.message };

      taskIds.push(taskA.data.id);
      this.transitionOrThrow(taskA.data.id, 'working', input.agentA.agent_id, 'Phase A started');

      await contextBridge.createContext(taskA.data.id, 'metadata', {
        pattern: this.patternType,
        phase: 'A',
        prompt: input.prompt,
      });

      this.transitionOrThrow(taskA.data.id, 'completed', input.agentA.agent_id, 'Phase A completed', `Phase A done by ${input.agentA.agent_id}`);
      this.postMessage(threadId, input.agentA.agent_id, `Phase A complete. Handing off to @${input.agentB.agent_id}.`);

      const taskB = lifecycle.createTask({
        workspace_id: config.workspaceId,
        thread_id: config.threadId,
        requester: config.requester,
        assignee: input.agentB,
        connector: { connector_id: 'pattern-direct-handoff', platform: input.agentB.platform, protocol: 'a2a' },
        payload: {
          kind: 'text',
          text: input.handoffInstructions
            ? `${input.handoffInstructions}\n\nOriginal task: ${input.prompt}`
            : `Continue from handoff.\n\nOriginal task: ${input.prompt}`,
        },
        tags: ['pattern:direct-handoff', 'phase:b'],
      });
      if (taskB.ok === false) return { success: false, patternType: this.patternType, taskIds, error: taskB.error.message };

      taskIds.push(taskB.data.id);
      await contextBridge.transferContext(taskA.data.id, taskB.data.id);

      this.transitionOrThrow(taskB.data.id, 'working', input.agentB.agent_id, 'Phase B started');
      this.transitionOrThrow(taskB.data.id, 'completed', input.agentB.agent_id, 'Phase B completed', `Phase B done by ${input.agentB.agent_id}`);
      this.postMessage(threadId, input.agentB.agent_id, 'Direct handoff finished.');

      return {
        success: true,
        patternType: this.patternType,
        taskIds,
        finalResult: `Direct handoff complete: ${input.agentA.agent_id} -> ${input.agentB.agent_id}`,
        metadata: { taskAId: taskA.data.id, taskBId: taskB.data.id },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.postMessage(threadId, config.requester.agent_id, `Direct handoff failed: ${error}`);
      return { success: false, patternType: this.patternType, taskIds, error };
    }
  }

  private transitionOrThrow(
    taskId: string,
    target_state: 'working' | 'completed',
    triggeredBy: string,
    reason: string,
    resultText?: string,
  ): void {
    const lifecycle = getTaskLifecycleService();
    const result = lifecycle.transitionTask(taskId, {
      target_state,
      triggered_by: triggeredBy,
      reason,
      ...(resultText ? { result: { text: resultText } } : {}),
    });
    if (result.ok === false) {
      throw new Error(result.error.message);
    }
  }

  private ensureChannel(config: PatternConfig, participants: AgentRef[]): string {
    const svc = getCollaborationSvc();
    const existing = svc.listChannels().find((channel) => channel.name === `handoff-${config.threadId}`);
    if (existing) return existing.id;
    const uniqueMembers = Array.from(new Set(participants.map((p) => p.agent_id)));
    const channel = svc.createChannel({
      name: `handoff-${config.threadId}`,
      scope: 'channel',
      memberAgentIds: uniqueMembers,
    });
    return channel.id;
  }

  private ensureThread(channelId: string): string {
    const svc = getCollaborationSvc();
    const existing = svc.listThreads(channelId)[0];
    if (existing) return existing.id;
    return svc.createThread(channelId, 'Direct handoff').id;
  }

  private postMessage(threadId: string, senderAgentId: string, text: string): void {
    try {
      getCollaborationSvc().sendMessage({ threadId, senderAgentId, text });
    } catch {
      // Best effort
    }
  }
}
