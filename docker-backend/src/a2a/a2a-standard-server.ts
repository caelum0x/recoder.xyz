/**
 * @module a2a-standard-server
 *
 * Standards-compliant A2A server using the owned @recoder/a2a-js (merged from a2a-js).
 * Mounts at /a2a on the Express app, providing:
 *   - GET  /a2a/.well-known/agent-card.json  (Agent Card discovery)
 *   - POST /a2a/                             (JSON-RPC task handler)
 */

import express from 'express';
import { createLogger } from '../logger.js';

const logger = createLogger('a2a-standard');

export async function mountA2AStandardServer(app: express.Express): Promise<void> {
  try {
    const { agentCardHandler, jsonRpcHandler, UserBuilder } = await import('@recoder/a2a-js/server/express');
    const { InMemoryTaskStore, DefaultRequestHandler, DefaultExecutionEventBusManager } = await import('@recoder/a2a-js/server');

    const agentCard = {
      name: 'Recoder Platform',
      description: 'AI agent platform — coding, PM, agency, and A2A capabilities',
      url: process.env.A2A_PUBLIC_URL || 'https://docker.recoder.xyz/a2a',
      version: '0.3.0',
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      skills: [
        {
          id: 'coding',
          name: 'Code Generation',
          description: 'Create and edit code in sandboxed Daytona environments',
          tags: ['coding', 'sandbox', 'react', 'html'],
        },
        {
          id: 'tasks',
          name: 'Task Management',
          description: 'Create, assign, and track tasks across agents',
          tags: ['tasks', 'a2a', 'collaboration'],
        },
      ],
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
    } as any;

    const taskStore = new InMemoryTaskStore();
    const eventBusManager = new DefaultExecutionEventBusManager();

    const agentExecutor = {
      async cancelTask(_params: any): Promise<void> { /* no-op */ },
      async execute(context: any): Promise<void> {
        const userMessage = context.userMessage?.parts
          ?.find((p: any) => p.type === 'text')?.text || 'No prompt';

        logger.info({ taskId: context.task?.id, prompt: userMessage.substring(0, 100) }, 'A2A standard task');

        try {
          // Conductor entry: if the message carries a conductor data part, launch a
          // real parallel-agent workspace instead of the default task queue.
          const { tryConductorFromA2A } = await import('../conductor/a2a-entry.js');
          if (await tryConductorFromA2A(context)) return;

          const { getTaskLifecycleService } = await import('./task-lifecycle.service.js');
          const service = getTaskLifecycleService();
          service.createTask({
            prompt: userMessage,
            workspace_id: 'default',
            thread_id: `a2a-std-${Date.now()}`,
            assignee_agent_id: 'recoder_backend',
            requester_agent_id: 'a2a-external',
          });
          context.complete([{ type: 'text', text: 'Task received and queued for execution.' }]);
        } catch (err: any) {
          logger.error({ err }, 'A2A task execution failed');
          context.fail(err.message);
        }
      },
    };

    const requestHandler = new DefaultRequestHandler(
      agentCard,
      taskStore,
      agentExecutor,
      eventBusManager,
    );

    // Mount handlers
    app.use('/a2a/.well-known/agent-card.json', agentCardHandler({
      agentCardProvider: async () => agentCard,
    }));
    app.use('/a2a', jsonRpcHandler({
      requestHandler,
      userBuilder: UserBuilder.noAuthentication,
    }));

    logger.info('A2A standard server mounted at /a2a');
  } catch (err: any) {
    logger.warn({ error: err.message }, 'A2A standard server not available (non-fatal)');
  }
}
