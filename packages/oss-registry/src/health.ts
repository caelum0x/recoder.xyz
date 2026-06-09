import type { OSSComponentDescriptor } from './descriptor';

export type OSSHealthStatus = 'healthy' | 'degraded' | 'offline' | 'unknown';

export type OSSHealthResult = {
  componentId: string;
  status: OSSHealthStatus;
  checkedAt: string;
  message: string;
  command?: string;
  endpoint?: string;
};

export function describeHealthCheck(component: OSSComponentDescriptor, checkedAt = new Date().toISOString()): OSSHealthResult {
  if (!component.healthCheck.command && !component.healthCheck.endpoint) {
    return {
      componentId: component.id,
      status: 'unknown',
      checkedAt,
      message: 'No health check declared.',
    };
  }

  return {
    componentId: component.id,
    status: 'unknown',
    checkedAt,
    message: 'Health check declared but not executed by descriptor-only registry.',
    command: component.healthCheck.command,
    endpoint: component.healthCheck.endpoint,
  };
}
