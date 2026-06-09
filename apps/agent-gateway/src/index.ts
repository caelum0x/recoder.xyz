import { createAgentOsHttpApp } from './http/agent-os-http';
import { AgentSessionRegistry } from './websocket/agent-sessions';
import { createDefaultMcpRegistry } from './mcp/mcp-registry';

export { createAgentOsHttpApp } from './http/agent-os-http';
export {
  createAgentOsGatewayState,
  createAgentOsResourceRouter,
  type AgentOsGatewayState,
} from './http/agent-os-resources';
export { AgentSessionRegistry } from './websocket/agent-sessions';
export { createDefaultMcpRegistry } from './mcp/mcp-registry';
export { createA2ARouter, mountA2ARoutes } from './a2a/routes';
export { createAgentGatewayCard } from './a2a/agent-card';
export { A2AMessageHandler } from './a2a/message-handler';
export { createA2AAgentOsProjection } from './a2a/agent-os-projection';
export { A2ATaskSubscriptionHub } from './a2a/task-subscription';
export { verifyGatewaySignedEnvelope } from './a2a/signed-envelope';

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createAgentOsHttpApp();
  const sessions = new AgentSessionRegistry();
  const mcp = createDefaultMcpRegistry();
  const port = Number(process.env.AGENT_GATEWAY_PORT ?? 4317);

  app.get('/api/agent-os/sessions', (_req, res) => {
    res.json({ success: true, data: sessions.list() });
  });

  app.get('/api/mcp/servers', (_req, res) => {
    res.json({ success: true, data: mcp.list() });
  });

  app.listen(port, () => {
    console.log(`agent-gateway listening on :${port}`);
  });
}
