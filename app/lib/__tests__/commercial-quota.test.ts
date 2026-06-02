import { describe, expect, it } from 'vitest';
import { formatCommercialQuotaResponse, getCommercialQuotaConfig } from '@/lib/commercial-quota';

describe('commercial-quota', () => {
  it('derives legacy quota compatibility from commercial entitlements', () => {
    const config = getCommercialQuotaConfig('pro-monthly');

    expect(config.plan).toBe('monthly');
    expect(config.sessionsPerDay).toBe(15);
    expect(config.tokensPerSession).toBe(50000);
    expect(config.entitlements.workspaces).toBe(10);
    expect(config.entitlements.connectedAgents).toBe(5);
  });

  it('formats quota responses with commercial activation context', () => {
    const periodEnd = new Date('2026-05-15T00:00:00.000Z');
    const response = formatCommercialQuotaResponse(
      {
        sessionsPerDay: 15,
        sessionsUsedToday: 4,
        tokensPerSession: 50000,
        requestsLimit: 10000,
        requestsUsed: 12,
        periodStart: new Date('2026-05-14T00:00:00.000Z'),
        periodEnd,
        lastResetAt: new Date('2026-05-14T00:00:00.000Z'),
      },
      'monthly',
    );

    expect(response.legacy.remaining).toBe(11);
    expect(response.canMakeRequest).toBe(true);
    expect(response.commercial).toMatchObject({
      plan: 'monthly',
      activationMilestone: 'connect-agent',
    });
    expect(response.commercial.entitlements.previewDeploysPerMonth).toBe(50);
  });
});
