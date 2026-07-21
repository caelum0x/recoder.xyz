/**
 * `AgentOsComposer` squad seed (§8.1) — the opt-in path that makes
 * {@link SquadService.route} reachable in production. Without a seed the
 * in-memory squad store is empty, so `route()` fails closed with "squad not
 * found" and the autopilot skips EVERY dispatch. These tests pin:
 *
 *   1. `squadSeed` set ⇒ after `start()` the store holds the squad + its members
 *      (so `route()` can genuinely select one).
 *   2. `squadSeed` null (default) ⇒ store stays empty ⇒ degrade-truthful
 *      pass-through, byte-identical to today.
 *   3. Seeding is idempotent — a repeated seed never duplicates members.
 *   4. `RECODER_SQUAD_ID` set WITHOUT a seed ⇒ a truthful warn (the autopilot
 *      routes flat instead of the skip-all footgun).
 */
import { describe, it, expect } from 'vitest';
import type { AppConfig } from '../../../shared/app-config.js';
import type { AgentOsDeps } from '../types.js';
import type { AgentOsConfigOverrides, SquadSeed } from '../config.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { GovernanceGate } from '../ports/governance-gate.port.js';
import { AgentOsComposer } from '../agent-os-module.js';

// sliceAgentOsConfig only reads database.url, internal.serviceKeyPresent and
// runtime.isProduction — a minimal shape is enough. No db url ⇒ memory driver.
const baseApp = {
  database: { url: null },
  internal: { serviceKeyPresent: false },
  runtime: { isProduction: false },
} as unknown as AppConfig;

/** A logger that records warn calls (to assert the footgun warn fires). */
function recordingLogger() {
  const warns: Array<{ ctx: unknown; msg: string }> = [];
  const logger = {
    info: () => {},
    warn: (ctx: unknown, msg?: string) => {
      warns.push({ ctx, msg: msg ?? String(ctx) });
    },
    error: () => {},
    debug: () => {},
  } as never;
  return { logger, warns };
}

/** A no-op auth middleware (routers register the handlers; none run in-test). */
function fakeMiddleware(): AuthMiddleware {
  const handler = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    authenticate: handler,
    authenticateMutating: handler,
    requireAdmin: handler,
    requireInternal: handler,
    requirePermission: () => handler,
    verifyOrgAccess: () => handler,
  } as unknown as AuthMiddleware;
}

/** A gate that always allows (unused during seeding — no writes go through it). */
function fakeGate(): GovernanceGate {
  return {
    decide: async () => ({ effect: 'allow', reason: 'test', degraded: false }),
  } as unknown as GovernanceGate;
}

async function buildComposer(
  overrides: AgentOsConfigOverrides,
  logger = recordingLogger().logger,
): Promise<AgentOsComposer> {
  const deps: AgentOsDeps = {
    config: baseApp,
    logger,
    middleware: fakeMiddleware(),
    gate: fakeGate(),
    // A log-only outbox sink so create() never touches NATS.
    outboxPublisher: { publish: async () => {}, health: () => 'down' } as never,
    overrides,
  };
  return AgentOsComposer.create(deps);
}

const seed: SquadSeed = {
  squadId: 'sq-alpha',
  displayName: 'Alpha Squad',
  spaceId: 'space-default',
  leaderAgentId: 'agent-lead',
  routingStrategy: 'leader',
  members: [
    { agentId: 'agent-lead', role: 'leader', weight: 3 },
    { agentId: 'agent-2', role: 'member', weight: 1 },
  ],
};

describe('AgentOsComposer — squad seed', () => {
  it('seeds the store at start() so route() finds a real squad', async () => {
    const composer = await buildComposer({ squadsEnabled: true, squadSeed: seed });
    await composer.start();
    try {
      const squads = composer.squadService();
      expect(squads).not.toBeNull();

      const stored = await squads!.getSquad('sq-alpha');
      expect(stored).not.toBeNull();
      expect(stored?.displayName).toBe('Alpha Squad');
      expect(stored?.leaderAgentId).toBe('agent-lead');
      expect(stored?.routingStrategy).toBe('leader');

      const members = await squads!.listMembers('sq-alpha');
      expect(members.map((m) => m.agentId).sort()).toEqual(['agent-2', 'agent-lead']);

      // The dark verb is now live: route() selects the leader, not "squad not found".
      const route = await squads!.route('sq-alpha', 'task-1');
      expect(route.routed).toBe(true);
      expect(route.routedAgentId).toBe('agent-lead');
    } finally {
      await composer.stop();
    }
  });

  it('leaves the store empty when no seed is configured (degrade-truthful)', async () => {
    const composer = await buildComposer({ squadsEnabled: true });
    await composer.start();
    try {
      const squads = composer.squadService();
      expect(squads).not.toBeNull();
      expect(await squads!.listSquads()).toEqual([]);
      expect(await squads!.getSquad('sq-alpha')).toBeNull();
    } finally {
      await composer.stop();
    }
  });

  it('is idempotent — a repeated seed never duplicates members', async () => {
    const composer = await buildComposer({ squadsEnabled: true, squadSeed: seed });
    // Call the private seed path twice (start() itself only seeds once via the
    // `started` guard; this proves the seed op is safe to re-run).
    const runSeed = (composer as unknown as { seedSquad(): Promise<string | null> }).seedSquad.bind(
      composer,
    );
    const first = await runSeed();
    const second = await runSeed();
    expect(first).toBe('sq-alpha');
    expect(second).toBe('sq-alpha');

    const members = await composer.squadService()!.listMembers('sq-alpha');
    expect(members).toHaveLength(2);
  });

  it('warns when RECODER_SQUAD_ID is set without a seed (no skip-all footgun)', async () => {
    const { logger, warns } = recordingLogger();
    const composer = await buildComposer(
      { squadsEnabled: true, squadAutopilotEnabled: true, squadId: 'sq-ghost' },
      logger,
    );
    try {
      expect(warns.some((w) => w.msg.includes('without a squadSeed'))).toBe(true);
    } finally {
      await composer.stop();
    }
  });

  it('does not warn when neither squadId nor seed is set (default OFF)', async () => {
    const { logger, warns } = recordingLogger();
    const composer = await buildComposer({ squadsEnabled: true }, logger);
    try {
      expect(warns.some((w) => w.msg.includes('without a squadSeed'))).toBe(false);
    } finally {
      await composer.stop();
    }
  });
});
