/**
 * health-filter — drop unhealthy/offline agents and translate health into a
 * scoring contribution + reasons.
 *
 * MERGED from the health branch of `candidate()` in
 * `packages/agent-os/src/services/task-routing-service.ts` (`isHealthy`,
 * `healthy → +30`, `degraded → +15`) and the A2A registry's
 * online/degraded/offline distinction. Optionally fuses live `AgentPresence`
 * so an agent whose registry health is fine but whose heartbeat says `offline`
 * is still excluded.
 *
 * Pure: a health status (+ optional presence) → { healthy, score, reasons }.
 */

import type { PresenceStatus } from '../domain';
import type { DirectoryAgentHealth } from '../ports';

const HEALTHY_SCORE = 30;
const DEGRADED_SCORE = 15;

export type HealthAssessment = {
  /** Eligible on health grounds (healthy or degraded, and not offline). */
  healthy: boolean;
  /** Score contribution from health (0 when ineligible). */
  score: number;
  reasons: string[];
};

/** True when registry health alone permits routing (healthy or degraded). */
export function isHealthEligible(health: DirectoryAgentHealth): boolean {
  return health === 'healthy' || health === 'degraded';
}

/**
 * Assess an agent's health for routing. `presence`, when supplied, overrides a
 * healthy registry status if the live heartbeat says the agent is offline —
 * preventing dispatch to an agent that looks healthy but has gone dark.
 */
export function assessHealth(
  health: DirectoryAgentHealth,
  presence?: PresenceStatus,
): HealthAssessment {
  const reasons: string[] = [];

  if (presence === 'offline') {
    reasons.push('agent presence is offline');
    return { healthy: false, score: 0, reasons };
  }

  if (!isHealthEligible(health)) {
    reasons.push(`agent health is ${health}`);
    return { healthy: false, score: 0, reasons };
  }

  return {
    healthy: true,
    score: health === 'healthy' ? HEALTHY_SCORE : DEGRADED_SCORE,
    reasons,
  };
}
