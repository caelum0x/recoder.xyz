import { describe, expect, it } from 'vitest';
import { shouldShowMaintenanceForApiOutage } from '@/components/dashboard/layout-health';

describe('shouldShowMaintenanceForApiOutage', () => {
  it('does not block the dashboard for degraded health', () => {
    expect(
      shouldShowMaintenanceForApiOutage({
        healthData: { status: 'degraded', timestamp: '', instance_id: '' },
        isCheckingHealth: false,
        isCheckingAdminRole: false,
        isAdmin: false,
      }),
    ).toBe(false);
  });

  it('blocks the dashboard only for confirmed down health', () => {
    expect(
      shouldShowMaintenanceForApiOutage({
        healthData: { status: 'down', timestamp: '', instance_id: '' },
        isCheckingHealth: false,
        isCheckingAdminRole: false,
        isAdmin: false,
      }),
    ).toBe(true);
  });

  it('never blocks admins', () => {
    expect(
      shouldShowMaintenanceForApiOutage({
        healthData: { status: 'down', timestamp: '', instance_id: '' },
        isCheckingHealth: false,
        isCheckingAdminRole: false,
        isAdmin: true,
      }),
    ).toBe(false);
  });
});
