export type ComponentHealth = {
  componentId: string;
  status: 'healthy' | 'degraded' | 'offline' | 'error' | 'unknown';
  checkedAt: string;
  message?: string;
  details?: Record<string, unknown>;
};

export function summarizeHealth(components: ComponentHealth[]): ComponentHealth {
  const priority = ['error', 'offline', 'degraded', 'unknown', 'healthy'];
  const worst = components
    .map((component) => component.status)
    .sort((left, right) => priority.indexOf(left) - priority.indexOf(right))[0] ?? 'unknown';

  return {
    componentId: 'recoder-agent-os',
    status: worst,
    checkedAt: new Date().toISOString(),
    message: `${components.length} component health records summarized.`,
    details: { componentCount: components.length },
  };
}
