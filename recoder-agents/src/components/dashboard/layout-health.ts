import type { HealthCheckResponse } from '@/lib/api/health';

export function shouldShowMaintenanceForApiOutage(args: {
  healthData?: HealthCheckResponse;
  isCheckingHealth: boolean;
  isCheckingAdminRole: boolean;
  isAdmin: boolean;
}): boolean {
  const { healthData, isCheckingHealth, isCheckingAdminRole, isAdmin } = args;

  if (isCheckingHealth || isCheckingAdminRole || isAdmin) {
    return false;
  }

  return healthData?.status === 'down';
}
