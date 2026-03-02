/**
 * @module amb-dispatcher
 *
 * Event dispatcher that hooks into agency workflow lifecycle and publishes
 * events to AMB channels via the AMBClient.
 *
 * All methods are fire-and-forget: errors are caught, logged, and do not
 * propagate to the caller. This ensures AMB integration never blocks
 * the core agency workflow execution.
 */

import { AMBClient, type AMBChannel, type AMBThread } from './amb-client';

export class AMBDispatcher {
  private client: AMBClient;
  /** Cache of workflow ID → { channel, thread } to avoid re-creating on every event. */
  private workflowCache = new Map<string, { channel: AMBChannel; thread: AMBThread }>();

  constructor(client?: AMBClient) {
    this.client = client || new AMBClient();
  }

  /**
   * Called when a workflow starts.
   * Creates a channel and main thread for the workflow.
   */
  async onWorkflowStart(workflowId: string, agentId: string, description: string): Promise<void> {
    try {
      const channel = await this.client.getOrCreateWorkflowChannel(workflowId);
      if (!channel) return;

      const thread = await this.client.createThread(channel.id, 'Main', agentId);
      if (!thread) return;

      this.workflowCache.set(workflowId, { channel, thread });

      await this.client.sendMessage(channel.id, thread.id, {
        senderAgentId: agentId,
        text: `Workflow started: ${description}`,
      });
    } catch (err) {
      console.warn(`[AMBDispatcher] onWorkflowStart error:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Called when a task is assigned to an agent within a workflow.
   */
  async onTaskAssigned(workflowId: string, taskId: string, assigneeAgentId: string, description: string): Promise<void> {
    try {
      const ctx = await this.ensureWorkflowContext(workflowId);
      if (!ctx) return;

      await this.client.sendMessage(ctx.channel.id, ctx.thread.id, {
        senderAgentId: 'agency-gateway',
        text: `Task ${taskId} assigned to @${assigneeAgentId}: ${description}`,
      });
    } catch (err) {
      console.warn(`[AMBDispatcher] onTaskAssigned error:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Called when an agent completes a task.
   */
  async onTaskCompleted(workflowId: string, taskId: string, agentId: string, result: string): Promise<void> {
    try {
      const ctx = await this.ensureWorkflowContext(workflowId);
      if (!ctx) return;

      await this.client.sendMessage(ctx.channel.id, ctx.thread.id, {
        senderAgentId: agentId,
        text: `Task ${taskId} completed: ${result}`,
      });
    } catch (err) {
      console.warn(`[AMBDispatcher] onTaskCompleted error:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Called when an agent fails a task.
   */
  async onTaskFailed(workflowId: string, taskId: string, agentId: string, error: string): Promise<void> {
    try {
      const ctx = await this.ensureWorkflowContext(workflowId);
      if (!ctx) return;

      await this.client.sendMessage(ctx.channel.id, ctx.thread.id, {
        senderAgentId: agentId,
        text: `Task ${taskId} failed: ${error}`,
      });
    } catch (err) {
      console.warn(`[AMBDispatcher] onTaskFailed error:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Called when a workflow completes (all tasks done).
   */
  async onWorkflowCompleted(workflowId: string, summary: string): Promise<void> {
    try {
      const ctx = await this.ensureWorkflowContext(workflowId);
      if (!ctx) return;

      await this.client.sendMessage(ctx.channel.id, ctx.thread.id, {
        senderAgentId: 'agency-gateway',
        text: `Workflow completed: ${summary}`,
      });

      // Clean up cache
      this.workflowCache.delete(workflowId);
    } catch (err) {
      console.warn(`[AMBDispatcher] onWorkflowCompleted error:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Ensure we have a channel + thread for this workflow. If not cached,
   * create them on-demand.
   */
  private async ensureWorkflowContext(workflowId: string): Promise<{ channel: AMBChannel; thread: AMBThread } | null> {
    const cached = this.workflowCache.get(workflowId);
    if (cached) return cached;

    // Try to create on-demand
    const channel = await this.client.getOrCreateWorkflowChannel(workflowId);
    if (!channel) return null;

    const thread = await this.client.createThread(channel.id, 'Main', 'agency-gateway');
    if (!thread) return null;

    const ctx = { channel, thread };
    this.workflowCache.set(workflowId, ctx);
    return ctx;
  }
}
