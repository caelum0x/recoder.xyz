import { NextResponse } from 'next/server';
import { getMonitoredServices } from '@/lib/config/platforms';
import type { RecoderService } from '@/lib/config/platforms';

interface ServiceHealth {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'down';
  responseTime: number | null;
  lastChecked: string;
  version?: string;
  details?: Record<string, unknown>;
}

interface HealthResponse {
  services: ServiceHealth[];
  overall: 'operational' | 'degraded' | 'down';
  cachedAt: string;
}

let cache: { data: HealthResponse; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

async function checkService(service: RecoderService): Promise<ServiceHealth> {
  const url = `${service.productionUrl}${service.healthPath}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const useGet = service.healthResponseType === 'json';

    const response = await fetch(url, {
      method: useGet ? 'GET' : 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;

    const result: ServiceHealth = {
      id: service.id,
      name: service.label,
      status: response.ok ? 'operational' : 'degraded',
      responseTime,
      lastChecked: new Date().toISOString(),
    };

    // Parse JSON health response for services that support it
    if (useGet && response.ok) {
      try {
        const body = await response.json();
        if (body.version) result.version = String(body.version);
        const { version: _v, ...rest } = body;
        if (Object.keys(rest).length > 0) result.details = rest;
      } catch {
        // JSON parse failed — still mark as operational based on HTTP status
      }
    }

    return result;
  } catch {
    return {
      id: service.id,
      name: service.label,
      status: 'down',
      responseTime: null,
      lastChecked: new Date().toISOString(),
    };
  }
}

async function getHealthData(): Promise<HealthResponse> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  const services = getMonitoredServices();
  const results = await Promise.all(services.map(checkService));

  const downCount = results.filter(s => s.status === 'down').length;
  const degradedCount = results.filter(s => s.status === 'degraded').length;

  let overall: HealthResponse['overall'] = 'operational';
  if (downCount > 0) overall = 'down';
  else if (degradedCount > 0) overall = 'degraded';

  const data: HealthResponse = {
    services: results,
    overall,
    cachedAt: new Date().toISOString(),
  };

  cache = { data, timestamp: Date.now() };
  return data;
}

export async function GET() {
  try {
    const data = await getHealthData();
    return NextResponse.json(data);
  } catch (error) {
    const { logger } = await import('@/lib/logger');
    logger.error('Ecosystem health check error', { route: 'api/ecosystem-health', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 }
    );
  }
}
