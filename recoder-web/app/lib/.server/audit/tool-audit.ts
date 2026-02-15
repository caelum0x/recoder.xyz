import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ToolAudit');

export type ToolAuditStatus = 'accepted' | 'blocked' | 'success' | 'error';

interface ToolAuditEvent {
  route: string;
  action: string;
  userId: string;
  status: ToolAuditStatus;
  reason?: string;
  meta?: Record<string, unknown>;
}

export function logToolAuditEvent(event: ToolAuditEvent): void {
  const payload = {
    at: new Date().toISOString(),
    route: event.route,
    action: event.action,
    userId: event.userId,
    status: event.status,
    reason: event.reason,
    meta: event.meta || {},
  };

  if (event.status === 'error' || event.status === 'blocked') {
    logger.warn('[tool-audit]', JSON.stringify(payload));
    return;
  }

  logger.info('[tool-audit]', JSON.stringify(payload));
}
