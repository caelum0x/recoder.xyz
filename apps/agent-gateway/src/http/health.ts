export type AgentGatewayHealth = {
  service: 'agent-gateway';
  status: 'healthy';
  timestamp: string;
};

export function getAgentGatewayHealth(): AgentGatewayHealth {
  return {
    service: 'agent-gateway',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };
}
