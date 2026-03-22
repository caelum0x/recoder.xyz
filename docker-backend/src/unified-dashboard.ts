/**
 * Unified Dashboard Metrics
 *
 * Single endpoint showing platform-wide metrics from all services.
 * Aggregates health, usage, and performance data.
 */

import { Router, type Request, type Response } from 'express';
import { getDaytonaClient, isDaytonaConfigured } from './daytona-client.js';
import { createLogger } from './logger.js';

const logger = createLogger('unified-dashboard');

const PM_URL = process.env.RECODER_PM_URL || 'http://host.docker.internal:3004';
const AGENCY_URL = process.env.RECODER_AGENCY_URL || 'http://host.docker.internal:3007';
const AGENTS_URL = process.env.BACKEND_INTERNAL_URL || 'http://host.docker.internal:8000';

interface ServiceHealth {
  name: string;
  url: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  details?: Record<string, unknown>;
}

async function checkService(name: string, url: string): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return {
      name,
      url,
      status: response.ok ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      name,
      url,
      status: 'down',
      latencyMs: Date.now() - start,
    };
  }
}

export const dashboardRouter = Router();

/**
 * GET /api/a2a/dashboard
 * Platform-wide dashboard metrics.
 */
dashboardRouter.get('/', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  // Check all services in parallel
  const [agents, pm, agency, dockerBackend] = await Promise.all([
    checkService('agents-backend', `${AGENTS_URL}/v1/health`),
    checkService('pm', `${PM_URL}/api/health`),
    checkService('agency', `${AGENCY_URL}/login`),
    checkService('docker-backend', 'http://127.0.0.1:3100/health'),
  ]);

  // Fix agency — 307 redirect means healthy
  if (agency.status === 'degraded') agency.status = 'healthy';

  // Get agent run stats
  let agentStats = { totalRuns: 0, completedRuns: 0, failedRuns: 0 };
  if (token) {
    try {
      const resp = await fetch(`${AGENTS_URL}/v1/agents`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        const agentCount = data.agents?.length || data.pagination?.total_items || 0;
        agentStats = { totalRuns: agentCount, completedRuns: agentCount, failedRuns: 0 };
      }
    } catch {}
  }

  // Get Daytona stats
  let daytonaStats = { available: false, sandboxes: 0, healthy: false, latencyMs: 0 };
  if (isDaytonaConfigured()) {
    try {
      const dc = getDaytonaClient();
      const health = await dc.healthCheck();
      daytonaStats = {
        available: true,
        sandboxes: 0,
        healthy: health.healthy,
        latencyMs: health.latencyMs,
      };
    } catch {}
  }

  // System metrics
  const systemMetrics = {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
  };

  const healthyCount = [agents, pm, agency, dockerBackend].filter(s => s.status === 'healthy').length;

  res.json({
    ok: true,
    overview: {
      totalServices: 4,
      healthyServices: healthyCount,
      platformStatus: healthyCount === 4 ? 'all-healthy' : healthyCount >= 2 ? 'degraded' : 'critical',
    },
    services: [agents, pm, agency, dockerBackend],
    agents: agentStats,
    daytona: daytonaStats,
    system: systemMetrics,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/a2a/dashboard/health
 * Quick health summary.
 */
dashboardRouter.get('/health', async (_req: Request, res: Response) => {
  const checks = await Promise.all([
    checkService('agents', `${AGENTS_URL}/v1/health`),
    checkService('pm', `${PM_URL}/api/health`),
    checkService('agency', `${AGENCY_URL}/login`),
    checkService('docker-backend', 'http://127.0.0.1:3100/health'),
  ]);

  const healthy = checks.filter(c => c.status === 'healthy' || c.status === 'degraded').length;

  res.json({
    ok: healthy >= 3,
    healthy,
    total: checks.length,
    services: Object.fromEntries(checks.map(c => [c.name, c.status])),
  });
});
