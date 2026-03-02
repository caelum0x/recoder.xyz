/**
 * @module patterns/competitive-pattern
 */

import type {
  CollaborationPattern,
  PatternConfig,
  PatternInput,
  PatternResult,
  AgentRef,
} from './types';
import { getTaskLifecycleService } from '../task-lifecycle.service';
import { getCollaborationSvc } from '../collaboration.service';

export class CompetitivePattern implements CollaborationPattern {
  readonly patternType = 'competitive' as const;

  async execute(config: PatternConfig, input: PatternInput): Promise<PatternResult> {
    if (input.kind !== 'competitive') {
      return { success: false, patternType: this.patternType, taskIds: [], error: 'Invalid input kind' };
    }
    if (input.agents.length < 2) {
      return { success: false, patternType: this.patternType, taskIds: [], error: 'At least 2 agents are required' };
    }

    const lifecycle = getTaskLifecycleService();
    const taskIds: string[] = [];
    const taskByAgent = new Map<string, string>();

    const channelId = this.ensureChannel(config, [config.requester, ...input.agents]);
    const threadId = this.ensureThread(channelId);

    try {
      for (const agent of input.agents) {
        const created = lifecycle.createTask({
          workspace_id: config.workspaceId,
          thread_id: config.threadId,
          requester: config.requester,
          assignee: agent,
          connector: { connector_id: 'pattern-competitive', platform: agent.platform, protocol: 'a2a' },
          payload: { kind: 'text', text: input.prompt },
          tags: ['pattern:competitive', `agent:${agent.agent_id}`],
        });
        if (created.ok === false) continue;

        taskIds.push(created.data.id);
        taskByAgent.set(agent.agent_id, created.data.id);
        this.transitionOrThrow(created.data.id, 'working', agent.agent_id, 'Competition task started');
      }

      if (taskIds.length === 0) {
        return { success: false, patternType: this.patternType, taskIds, error: 'No task could be created' };
      }

      const winner = input.agents[0];
      const winnerTaskId = taskByAgent.get(winner.agent_id);
      if (!winnerTaskId) {
        return { success: false, patternType: this.patternType, taskIds, error: 'Unable to determine winner task' };
      }

      this.transitionOrThrow(winnerTaskId, 'completed', winner.agent_id, 'Winner completed first', `Winner: ${winner.agent_id}`);
      this.postMessage(threadId, winner.agent_id, `Winner selected: @${winner.agent_id}.`);

      let cancelledCount = 0;
      for (const agent of input.agents) {
        if (agent.agent_id === winner.agent_id) continue;
        const taskId = taskByAgent.get(agent.agent_id);
        if (!taskId) continue;
        const result = lifecycle.transitionTask(taskId, {
          target_state: 'cancelled',
          triggered_by: config.requester.agent_id,
          reason: `Cancelled after winner ${winner.agent_id} completed`,
        });
        if (result.ok) cancelledCount++;
      }

      return {
        success: true,
        patternType: this.patternType,
        taskIds,
        finalResult: `Winner: ${winner.agent_id}`,
        metadata: { winnerId: winner.agent_id, winnerTaskId, cancelledCount },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.postMessage(threadId, config.requester.agent_id, `Competitive pattern failed: ${error}`);
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
    const existing = svc.listChannels().find((channel) => channel.name === `competition-${config.threadId}`);
    if (existing) return existing.id;
    const uniqueMembers = Array.from(new Set(participants.map((p) => p.agent_id)));
    const channel = svc.createChannel({
      name: `competition-${config.threadId}`,
      scope: 'channel',
      memberAgentIds: uniqueMembers,
    });
    return channel.id;
  }

  private ensureThread(channelId: string): string {
    const svc = getCollaborationSvc();
    const existing = svc.listThreads(channelId)[0];
    if (existing) return existing.id;
    return svc.createThread(channelId, 'Competition').id;
  }

  private postMessage(threadId: string, senderAgentId: string, text: string): void {
    try {
      getCollaborationSvc().sendMessage({ threadId, senderAgentId, text });
    } catch {
      // Best effort
    }
  }
}
