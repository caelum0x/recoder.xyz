import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSqliteKvStore, type SqliteKvStore } from '../../persistence/repositories/sqlite-kv-store.repository.js';
import { createAgentAutomationStateStore } from '../adapters/automation-state.adapter.js';
import { SquadAutopilotService } from '../services/squad-autopilot.service.js';
import { PullRequestReviewAgentService } from '../services/pr-review-agent.service.js';
import { AgentOsComposer } from '../agent-os-module.js';
import type { AppConfig } from '../../../shared/app-config.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { GovernanceGate } from '../ports/governance-gate.port.js';

const logger = { info() {}, warn() {}, error() {}, debug() {} } as never;
const profile = {
  repoPath: '/repos/acme',
  spaceId: 'default',
  projectId: 'acme',
  runtimeId: 'codex',
} as const;

let root = '';
let kv: SqliteKvStore | null = null;

afterEach(() => {
  kv?.close();
  kv = null;
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

function store() {
  root = mkdtempSync(join(tmpdir(), 'recoder-automation-restart-'));
  kv = createSqliteKvStore(join(root, 'state.sqlite'));
  return createAgentAutomationStateStore(kv);
}

function background(state: ReturnType<typeof store>) {
  return new SquadAutopilotService({
    logger,
    intervalMs: 60_000,
    maxDispatchesPerTick: 2,
    state,
  });
}

function reviews(state: ReturnType<typeof store>) {
  return new PullRequestReviewAgentService({
    gate: {
      guard: async () => ({
        allowed: true,
        effect: 'allow',
        tier: 'low',
        reason: 'allowed',
        degraded: false,
      }),
    },
    logger,
    intervalMs: 60_000,
    maxDispatchesPerScan: 2,
    state,
  });
}

const baseApp = {
  database: { url: null },
  internal: { serviceKeyPresent: false },
  runtime: { isProduction: false },
} as unknown as AppConfig;

function middleware(): AuthMiddleware {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    authenticate: pass,
    authenticateMutating: pass,
    requireAdmin: pass,
    requireInternal: pass,
    requirePermission: () => pass,
    verifyOrgAccess: () => pass,
  } as unknown as AuthMiddleware;
}

const gate = {
  decide: async () => ({ effect: 'allow', reason: 'allowed', degraded: false }),
} as unknown as GovernanceGate;

async function composer(state: ReturnType<typeof store>, bootRunning = false) {
  return AgentOsComposer.create({
    config: baseApp,
    logger,
    middleware: middleware(),
    gate,
    outboxPublisher: { publish: async () => {}, health: () => 'down' } as never,
    overrides: { squadsEnabled: true, squadAutopilotEnabled: bootRunning },
    automationState: state,
  });
}

describe('installed background automation survives backend restart', () => {
  it('restores the issue-agent target and running posture, while an explicit pause stays paused', async () => {
    const state = store();
    const first = background(state);
    await first.configure(profile);
    await first.setRunning(true);
    first.stop(); // process shutdown: do not rewrite the operator's running intent

    const restarted = background(state);
    await restarted.restore();
    expect(await restarted.board()).toMatchObject({
      running: true,
      launchProfile: profile,
      persistence: { wired: true, durable: true },
    });

    await restarted.setRunning(false);
    const pausedRestart = background(state);
    await pausedRestart.restore();
    expect(await pausedRestart.board()).toMatchObject({ running: false, launchProfile: profile });
    pausedRestart.stop();
  });

  it('restores the PR cohort, draft choice, owner, target, and standing watcher posture', async () => {
    const state = store();
    const first = reviews(state);
    await first.configure({
      profile,
      reviewerRuntimeIds: ['codex', 'claude_code', 'codex'],
      includeDrafts: true,
      operatorId: 'user-installed',
    });
    await first.setRunning(true);
    first.stop();

    const restarted = reviews(state);
    await restarted.restore();
    expect(restarted.board()).toMatchObject({
      running: true,
      launchProfile: profile,
      reviewerRuntimeIds: ['codex', 'claude_code'],
      includeDrafts: true,
      persistence: { wired: true, durable: true },
    });
    restarted.stop();
  });

  it('hydrates both loops through the real AgentOsComposer start hook', async () => {
    const state = store();
    const first = await composer(state);
    await first.start();
    await first.squadAutopilot()!.configure(profile);
    await first.squadAutopilot()!.setRunning(true);
    await first.pullRequestReviewAgents().configure({
      profile,
      reviewerRuntimeIds: ['codex', 'claude_code'],
      operatorId: 'user-installed',
    });
    await first.pullRequestReviewAgents().setRunning(true);
    await first.stop();

    const restarted = await composer(state);
    await restarted.start();
    try {
      expect(await restarted.squadAutopilot()!.board()).toMatchObject({
        running: true,
        launchProfile: profile,
      });
      expect(restarted.pullRequestReviewAgents().board()).toMatchObject({
        running: true,
        launchProfile: profile,
        reviewerRuntimeIds: ['codex', 'claude_code'],
      });
    } finally {
      await restarted.stop();
    }
  });

  it('keeps an explicit persisted pause even when the boot default requests running', async () => {
    const state = store();
    const first = await composer(state);
    await first.start();
    await first.squadAutopilot()!.configure(profile);
    await first.squadAutopilot()!.setRunning(false);
    await first.stop();

    const restarted = await composer(state, true);
    await restarted.start();
    try {
      expect(await restarted.squadAutopilot()!.board()).toMatchObject({
        running: false,
        launchProfile: profile,
      });
      await expect(restarted.squadAutopilot()!.catchUpIfRunning()).resolves.toBeNull();
    } finally {
      await restarted.stop();
    }
  });
});
