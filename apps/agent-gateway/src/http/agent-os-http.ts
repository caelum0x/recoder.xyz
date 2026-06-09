import express from 'express';
import { getAgentGatewayHealth } from './health';
import { createA2ARouter } from '../a2a/routes';
import { A2AMessageHandler } from '../a2a/message-handler';
import { createA2AAgentOsProjection } from '../a2a/agent-os-projection';
import {
  createAgentOsGatewayState,
  createAgentOsResourceRouter,
  type AgentOsGatewayState,
} from './agent-os-resources';

export function createAgentOsHttpApp(state: AgentOsGatewayState = createAgentOsGatewayState()) {
  const app = express();
  const a2aHandler = new A2AMessageHandler(undefined, createA2AAgentOsProjection(state));

  app.use(express.json({ limit: '2mb' }));
  app.use(createA2ARouter({ handler: a2aHandler }));
  app.use('/api/agent-os', createAgentOsResourceRouter(state));

  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      data: getAgentGatewayHealth(),
    });
  });

  return app;
}
