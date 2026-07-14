import { beforeEach, describe, expect, it } from 'vitest';
import { a2aSloMetricsRouter } from '../slo-metrics.routes';
import { getA2ASloMetrics, resetA2ASloMetrics } from '../slo-metrics';

function makeRes() {
  const state = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    jsonData: null as any,
    body: '' as string,
  };

  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(key: string, value: string) {
      state.headers[key.toLowerCase()] = value;
    },
    json(data: any) {
      state.jsonData = data;
      return res;
    },
    send(content: string) {
      state.body = content;
      return res;
    },
  };

  return { res, state };
}

async function run(path: string, method: 'get', req: any, res: any) {
  const layer = (a2aSloMetricsRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`missing route ${method.toUpperCase()} ${path}`);
  await layer.route.stack[0].handle(req, res);
}

describe('Adapter SLO metrics', () => {
  beforeEach(() => {
    resetA2ASloMetrics();
  });

  // ── recordAdapterExecution ──────────────────────────────────────────

  describe('recordAdapterExecution', () => {
    it('records successful execution reflected in getAdapterMetrics', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterExecution({
        adapterId: 'rest-1',
        adapterType: 'rest',
        success: true,
        durationMs: 150,
      });

      const summary = metrics.getAdapterMetrics();
      expect(summary.totalExecutions).toBe(1);
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(0);
      expect(summary.successRate).toBe(1);
    });

    it('records failed execution and increments failure count', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterExecution({
        adapterId: 'rest-1',
        adapterType: 'rest',
        success: false,
        durationMs: 500,
      });

      const summary = metrics.getAdapterMetrics();
      expect(summary.totalExecutions).toBe(1);
      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(1);
      expect(summary.successRate).toBe(0);
    });

    it('tracks duration correctly and computes avgDurationMs', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterExecution({
        adapterId: 'rest-1',
        adapterType: 'rest',
        success: true,
        durationMs: 100,
      });
      metrics.recordAdapterExecution({
        adapterId: 'rest-1',
        adapterType: 'rest',
        success: true,
        durationMs: 300,
      });

      const summary = metrics.getAdapterMetrics();
      expect(summary.avgDurationMs).toBe(200);
    });

    it('accumulates retry count', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterExecution({
        adapterId: 'rest-1',
        adapterType: 'rest',
        success: true,
        durationMs: 100,
        retryCount: 2,
      });
      metrics.recordAdapterExecution({
        adapterId: 'rest-1',
        adapterType: 'rest',
        success: true,
        durationMs: 200,
        retryCount: 3,
      });

      const summary = metrics.getAdapterMetrics();
      expect(summary.totalRetries).toBe(5);
    });
  });

  // ── recordAdapterHealthCheck ────────────────────────────────────────

  describe('recordAdapterHealthCheck', () => {
    it('records reachable health check', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterHealthCheck({
        adapterId: 'rest-1',
        adapterType: 'rest',
        reachable: true,
        latencyMs: 50,
      });

      const summary = metrics.getAdapterMetrics();
      expect(summary.healthChecks.total).toBe(1);
      expect(summary.healthChecks.reachable).toBe(1);
      expect(summary.healthChecks.unreachable).toBe(0);
    });

    it('records unreachable health check', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterHealthCheck({
        adapterId: 'rest-1',
        adapterType: 'rest',
        reachable: false,
        latencyMs: 5000,
      });

      const summary = metrics.getAdapterMetrics();
      expect(summary.healthChecks.total).toBe(1);
      expect(summary.healthChecks.reachable).toBe(0);
      expect(summary.healthChecks.unreachable).toBe(1);
    });

    it('tracks latency correctly', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterHealthCheck({
        adapterId: 'rest-1',
        adapterType: 'rest',
        reachable: true,
        latencyMs: 100,
      });
      metrics.recordAdapterHealthCheck({
        adapterId: 'rest-1',
        adapterType: 'rest',
        reachable: true,
        latencyMs: 200,
      });

      const summary = metrics.getAdapterMetrics();
      expect(summary.healthChecks.avgLatencyMs).toBe(150);
    });
  });

  // ── recordAdapterLifecycle ──────────────────────────────────────────

  describe('recordAdapterLifecycle', () => {
    it('counts registration events', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterLifecycle({
        adapterId: 'rest-1',
        adapterType: 'rest',
        event: 'registered',
      });
      metrics.recordAdapterLifecycle({
        adapterId: 'git-1',
        adapterType: 'git',
        event: 'registered',
      });

      const summary = metrics.getAdapterMetrics();
      expect(summary.registrations).toBe(2);
      expect(summary.deregistrations).toBe(0);
    });

    it('counts deregistration events', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterLifecycle({
        adapterId: 'rest-1',
        adapterType: 'rest',
        event: 'unregistered',
      });

      const summary = metrics.getAdapterMetrics();
      expect(summary.registrations).toBe(0);
      expect(summary.deregistrations).toBe(1);
    });
  });

  // ── getAdapterMetrics aggregate ─────────────────────────────────────

  describe('getAdapterMetrics aggregate', () => {
    it('computes success rate correctly from mixed results', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterExecution({ adapterId: 'r1', adapterType: 'rest', success: true, durationMs: 10 });
      metrics.recordAdapterExecution({ adapterId: 'r1', adapterType: 'rest', success: true, durationMs: 20 });
      metrics.recordAdapterExecution({ adapterId: 'r1', adapterType: 'rest', success: false, durationMs: 30 });
      metrics.recordAdapterExecution({ adapterId: 'r1', adapterType: 'rest', success: false, durationMs: 40 });

      const summary = metrics.getAdapterMetrics();
      expect(summary.successRate).toBe(0.5);
      expect(summary.successCount).toBe(2);
      expect(summary.failureCount).toBe(2);
    });

    it('computes p95 duration correctly', () => {
      const metrics = getA2ASloMetrics();
      // Insert 20 samples: 1..20 * 100
      for (let i = 1; i <= 20; i++) {
        metrics.recordAdapterExecution({
          adapterId: 'r1',
          adapterType: 'rest',
          success: true,
          durationMs: i * 100,
        });
      }

      const summary = metrics.getAdapterMetrics();
      // sorted: [100,200,...,2000], p95 index = ceil(0.95*20)-1 = 18 => 1900
      expect(summary.p95DurationMs).toBe(1900);
    });

    it('shows per-adapter stats in byAdapter breakdown', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterExecution({ adapterId: 'rest-1', adapterType: 'rest', success: true, durationMs: 100 });
      metrics.recordAdapterExecution({ adapterId: 'rest-1', adapterType: 'rest', success: false, durationMs: 200 });
      metrics.recordAdapterExecution({ adapterId: 'git-1', adapterType: 'git', success: true, durationMs: 50 });
      metrics.recordAdapterHealthCheck({ adapterId: 'rest-1', adapterType: 'rest', reachable: true, latencyMs: 30 });

      const summary = metrics.getAdapterMetrics();
      expect(Object.keys(summary.byAdapter)).toHaveLength(2);

      const rest1 = summary.byAdapter['rest-1'];
      expect(rest1).toBeDefined();
      expect(rest1.adapterId).toBe('rest-1');
      expect(rest1.adapterType).toBe('rest');
      expect(rest1.executions).toBe(2);
      expect(rest1.successRate).toBe(0.5);
      expect(rest1.avgDurationMs).toBe(150);
      expect(rest1.healthChecks).toBe(1);
      expect(rest1.lastActivity).toBeTruthy();

      const git1 = summary.byAdapter['git-1'];
      expect(git1).toBeDefined();
      expect(git1.adapterId).toBe('git-1');
      expect(git1.adapterType).toBe('git');
      expect(git1.executions).toBe(1);
      expect(git1.successRate).toBe(1);
      expect(git1.avgDurationMs).toBe(50);
      expect(git1.healthChecks).toBe(0);
    });
  });

  // ── Integration ─────────────────────────────────────────────────────

  describe('integration', () => {
    it('getSummary() includes adapters field', () => {
      const metrics = getA2ASloMetrics();
      metrics.recordAdapterExecution({
        adapterId: 'rest-1',
        adapterType: 'rest',
        success: true,
        durationMs: 200,
      });

      const summary = metrics.getSummary();
      expect(summary.adapters).toBeDefined();
      expect(summary.adapters.totalExecutions).toBe(1);
      expect(summary.adapters.successCount).toBe(1);
    });

    it('tracks multiple adapters independently', () => {
      const metrics = getA2ASloMetrics();

      // REST adapter
      metrics.recordAdapterExecution({ adapterId: 'rest-alpha', adapterType: 'rest', success: true, durationMs: 100 });
      metrics.recordAdapterExecution({ adapterId: 'rest-alpha', adapterType: 'rest', success: true, durationMs: 200 });
      metrics.recordAdapterHealthCheck({ adapterId: 'rest-alpha', adapterType: 'rest', reachable: true, latencyMs: 10 });
      metrics.recordAdapterLifecycle({ adapterId: 'rest-alpha', adapterType: 'rest', event: 'registered' });

      // Git adapter
      metrics.recordAdapterExecution({ adapterId: 'git-beta', adapterType: 'git', success: false, durationMs: 500 });
      metrics.recordAdapterHealthCheck({ adapterId: 'git-beta', adapterType: 'git', reachable: false, latencyMs: 5000 });
      metrics.recordAdapterLifecycle({ adapterId: 'git-beta', adapterType: 'git', event: 'registered' });

      const summary = metrics.getAdapterMetrics();

      // Global aggregates
      expect(summary.totalExecutions).toBe(3);
      expect(summary.successCount).toBe(2);
      expect(summary.failureCount).toBe(1);
      expect(summary.registrations).toBe(2);
      expect(summary.healthChecks.total).toBe(2);
      expect(summary.healthChecks.reachable).toBe(1);
      expect(summary.healthChecks.unreachable).toBe(1);

      // Per-adapter
      const restAlpha = summary.byAdapter['rest-alpha'];
      expect(restAlpha.executions).toBe(2);
      expect(restAlpha.successRate).toBe(1);
      expect(restAlpha.adapterType).toBe('rest');
      expect(restAlpha.healthChecks).toBe(1);

      const gitBeta = summary.byAdapter['git-beta'];
      expect(gitBeta.executions).toBe(1);
      expect(gitBeta.successRate).toBe(0);
      expect(gitBeta.adapterType).toBe('git');
      expect(gitBeta.healthChecks).toBe(1);
    });
  });
});
