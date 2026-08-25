import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  CURRENT_AGENTS,
  DEPLOYMENTS,
  PILOT_TIMINGS,
  PRIMARY_PAINS,
  saveDesignPartnerIntake,
  TEAM_SIZES,
  WEEKLY_RUNS,
  type DesignPartnerInput,
} from '@/lib/pilot-operations/intake';
import { PilotOperationError } from '@/lib/pilot-operations/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CANONICAL_ORIGIN = 'https://recoder.xyz';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = boundedHeader(request.headers.get('x-request-id'), 128) ?? randomUUID();
  const originFailure = requireAllowedOrigin(request, requestId);
  if (originFailure) return originFailure;

  const idempotencyKey = boundedHeader(request.headers.get('idempotency-key'), 128);
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return jsonError('Idempotency-Key must contain 8 to 128 visible characters.', 400, requestId);
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return jsonError('Content-Type must be application/json.', 415, requestId);
  }

  let body: Record<string, unknown>;
  try {
    const candidate: unknown = await request.json();
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      return jsonError('JSON body must be an object.', 400, requestId);
    }
    body = candidate as Record<string, unknown>;
  } catch {
    return jsonError('Invalid JSON body.', 400, requestId);
  }

  if (typeof body.website === 'string' && body.website.trim()) {
    return NextResponse.json({ success: true, id: 'accepted', replayed: false }, {
      status: 201,
      headers: { ...NO_STORE, 'X-Request-Id': requestId },
    });
  }

  const input = parseInput(body);
  if (!input) return jsonError('Complete every design-partner intake field with a valid email.', 400, requestId);

  try {
    const result = await saveDesignPartnerIntake(input, {
      idempotencyKey,
      ipAddress: clientIp(request),
      requestId,
    });
    return NextResponse.json({ success: true, ...result }, {
      status: result.replayed ? 200 : 201,
      headers: { ...NO_STORE, 'X-Request-Id': requestId, 'Idempotency-Replayed': String(result.replayed) },
    });
  } catch (error) {
    if (error instanceof PilotOperationError) {
      const status = error.code === 'CONFLICT' ? 409 : error.code === 'RATE_LIMITED' ? 429 : 503;
      return jsonError(error.message, status, requestId);
    }
    console.error('Pilot intake failed', { requestId, error: error instanceof Error ? error.name : 'unknown' });
    return jsonError("We couldn't record that right now. Email founders@recoder.xyz.", 503, requestId);
  }
}

function parseInput(body: Record<string, unknown>): DesignPartnerInput | null {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL.test(email)) return null;
  const teamSize = enumValue(body.teamSize, TEAM_SIZES);
  const deployment = enumValue(body.deployment, DEPLOYMENTS);
  const primaryPain = enumValue(body.primaryPain, PRIMARY_PAINS);
  const weeklyRuns = enumValue(body.weeklyRuns, WEEKLY_RUNS);
  const pilotTiming = enumValue(body.pilotTiming, PILOT_TIMINGS);
  const currentAgents = Array.isArray(body.currentAgents)
    ? Array.from(new Set(body.currentAgents.map((value) => enumValue(value, CURRENT_AGENTS)).filter(Boolean)))
    : [];
  if (!teamSize || !deployment || !primaryPain || !weeklyRuns || !pilotTiming || currentAgents.length === 0) return null;
  return {
    email,
    teamSize,
    currentAgents: currentAgents as DesignPartnerInput['currentAgents'],
    deployment,
    primaryPain,
    weeklyRuns,
    pilotTiming,
    evidenceRequired: body.evidenceRequired === true,
    interviewConsent: body.interviewConsent === true,
  };
}

function requireAllowedOrigin(request: NextRequest, requestId: string): NextResponse | null {
  const origin = request.headers.get('origin');
  const configured = [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL]
    .map((value) => value?.trim()).filter(Boolean).flatMap((value) => {
      try { return [new URL(value as string).origin]; } catch { return []; }
    });
  const allowed = new Set([CANONICAL_ORIGIN, ...configured]);
  if (process.env.NODE_ENV !== 'production') allowed.add(request.nextUrl.origin);
  if (allowed.size === 0) return jsonError('Pilot intake origin is not configured.', 503, requestId);
  if (!origin || !allowed.has(origin)) return jsonError('Cross-origin intake refused.', 403, requestId);
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return jsonError('Cross-site intake refused.', 403, requestId);
  return null;
}

function clientIp(request: NextRequest): string {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 128);
  return (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown').slice(0, 128);
}

function enumValue<T extends string>(value: unknown, choices: readonly T[]): T | null {
  return typeof value === 'string' && choices.includes(value.trim().toLowerCase() as T)
    ? value.trim().toLowerCase() as T
    : null;
}

function boundedHeader(value: string | null, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max && /^[\x21-\x7e]+$/.test(trimmed) ? trimmed : null;
}

function jsonError(error: string, status: number, requestId: string): NextResponse {
  return NextResponse.json({ success: false, error, requestId }, {
    status,
    headers: { ...NO_STORE, 'X-Request-Id': requestId },
  });
}
