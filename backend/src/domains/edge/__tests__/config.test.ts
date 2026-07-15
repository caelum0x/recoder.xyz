import { describe, it, expect } from 'vitest';
import type { AppConfig } from '../../../shared/app-config.js';
import { sliceEdgeConfig } from '../config.js';

function appConfig(overrides?: Partial<AppConfig>): AppConfig {
  const base: AppConfig = {
    runtime: { env: 'test', isProduction: false, serviceName: 'recoder-backend', instanceId: 'i1' },
    server: { port: 3001, host: '127.0.0.1', trustProxy: false, shutdownDrainMs: 8_000, bodyLimit: '2mb' },
    database: {
      url: null,
      ssl: false,
      maxPoolSize: 10,
      minPoolSize: 1,
      statementTimeoutMs: 0,
      allowSeed: false,
      migrationsDir: null,
    },
    auth: { betterAuthSecretPresent: false, authDatabaseUrl: null, cookieDomain: null, strict: false },
    internal: { serviceKeyPresent: true, serviceKey: 'k'.repeat(40) },
    cors: { origins: ['.recoder.xyz'], allowCredentials: true },
    logging: { level: 'info', pretty: false },
    conductor: {
      tmuxBin: null,
      worktreeRoot: '/tmp/recoder-worktrees',
      tmuxControlMode: false,
      caps: {
        maxConcurrentWorkspaces: 10,
        maxConcurrentPerUser: 5,
        maxTmuxSessions: 50,
        minFreeDiskGb: 5,
        maxWorktreeDiskGb: 50,
      },
    },
    agentOs: { natsUrl: null, brainEnabled: false, codeGraphEnabled: false, squadsEnabled: true },
    ...overrides,
  };
  return base;
}

describe('sliceEdgeConfig — the edge config slice (no process.env)', () => {
  it('derives cors, bodyLimit, internal-key, isProduction, drain from AppConfig', () => {
    const cfg = sliceEdgeConfig(appConfig());
    expect(cfg.cors).toEqual({ origins: ['.recoder.xyz'], allowCredentials: true });
    expect(cfg.bodyLimit).toBe('2mb');
    expect(cfg.internalKeyPresent).toBe(true);
    expect(cfg.internalServiceKey).toBe('k'.repeat(40));
    expect(cfg.isProduction).toBe(false);
    expect(cfg.shutdownDrainMs).toBe(8_000);
  });

  it('applies degrade-safe rate-limit + ws defaults', () => {
    const cfg = sliceEdgeConfig(appConfig());
    expect(cfg.rateLimit.api.maxRequests).toBeGreaterThan(0);
    expect(cfg.rateLimit.heavy.maxRequests).toBeLessThan(cfg.rateLimit.api.maxRequests);
    expect(cfg.ws.heartbeatMs).toBeGreaterThan(0);
  });

  it('honours overrides for the not-yet-foundational tiers', () => {
    const cfg = sliceEdgeConfig(appConfig(), {
      rateLimit: { heavy: { maxRequests: 3, windowMs: 1_000, maxConcurrent: 1 } },
      ws: { heartbeatMs: 5_000 },
    });
    expect(cfg.rateLimit.heavy).toEqual({ maxRequests: 3, windowMs: 1_000, maxConcurrent: 1 });
    expect(cfg.ws.heartbeatMs).toBe(5_000);
  });
});
