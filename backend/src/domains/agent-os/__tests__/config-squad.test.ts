/**
 * `sliceAgentOsConfig` — the squadId wiring that makes `SquadService.route`
 * reachable in production. Without a sliced `squadId` the autopilot always
 * pass-through dispatches (route() is dead); with it, every dispatch routes
 * leader-first / weighted through the configured squad.
 */
import { describe, it, expect } from 'vitest';
import type { AppConfig } from '../../../shared/app-config.js';
import { sliceAgentOsConfig } from '../config.js';

// sliceAgentOsConfig only reads database.url, internal.serviceKeyPresent, and
// runtime.isProduction — a minimal shape is enough to exercise the squadId seam.
const baseApp = {
  database: { url: null },
  internal: { serviceKeyPresent: false },
  runtime: { isProduction: false },
} as unknown as AppConfig;

describe('sliceAgentOsConfig — squadId', () => {
  it('surfaces the squadId override so the autopilot can route through it', () => {
    const cfg = sliceAgentOsConfig(baseApp, { squadId: 'sq-1' });
    expect(cfg.squadId).toBe('sq-1');
  });

  it('defaults squadId to null (flat default dispatch — degrade-truthful)', () => {
    const cfg = sliceAgentOsConfig(baseApp);
    expect(cfg.squadId).toBeNull();
  });
});
