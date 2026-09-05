import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureSessionAdminAccess } from '@/lib/admin-auth';
import {
  createPilot,
  METRIC_DIRECTIONS,
  PILOT_STATUSES,
  PilotOperationError,
  readPilotOperations,
  updatePilot,
  type UpdatePilotInput,
} from '@/lib/pilot-operations/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, private', 'Vary': 'Cookie' };
const CANONICAL_ORIGIN = 'https://recoder.xyz';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const access = await ensureSessionAdminAccess(request);
  // `=== false` (not `!access.ok`) — with strictNullChecks off, truthiness
  // does not narrow the discriminated union to the branch carrying `response`.
  if (access.ok === false) return withPrivateHeaders(access.response);
  try {
    const records = await readPilotOperations();
    return NextResponse.json({ success: true, ...records }, { headers: NO_STORE });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return mutate(request, 'POST');
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return mutate(request, 'PATCH');
}

async function mutate(request: NextRequest, method: 'POST' | 'PATCH'): Promise<NextResponse> {
  const requestId = boundedHeader(request.headers.get('x-request-id'), 128) ?? randomUUID();
  const originFailure = requireSameOrigin(request, requestId);
  if (originFailure) return originFailure;

  const access = await ensureSessionAdminAccess(request);
  if (access.ok === false) return withPrivateHeaders(access.response, requestId);
  // Defensive: session admins always carry a userId, but the audit trail
  // depends on it, so refuse the mutation rather than crash on `response`
  // (which does not exist on the ok branch).
  if (!access.admin.userId) return jsonError('Admin access required', 403, requestId);

  const idempotencyKey = boundedHeader(request.headers.get('idempotency-key'), 128);
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return jsonError('Idempotency-Key must contain 8 to 128 visible characters.', 400, requestId);
  }

  const body = await readBody(request);
  if (body instanceof NextResponse) return withPrivateHeaders(body, requestId);

  try {
    if (method === 'POST') {
      const designPartnerLeadId = boundedString(body.designPartnerLeadId, 160);
      const metricName = boundedString(body.metricName, 120);
      const metricUnit = boundedString(body.metricUnit, 40);
      const metricDirection = enumValue(body.metricDirection, METRIC_DIRECTIONS);
      const baselineValue = finiteNumber(body.baselineValue);
      const targetValue = finiteNumber(body.targetValue);
      if (!designPartnerLeadId || !metricName || !metricUnit || !metricDirection || baselineValue === null || targetValue === null) {
        return jsonError('A linked lead, measure, unit, direction, baseline, and target are required.', 400, requestId);
      }
      const result = await createPilot({
        designPartnerLeadId,
        metricName,
        metricUnit,
        metricDirection,
        baselineValue,
        targetValue,
      }, mutationContext(request, access.admin.userId, idempotencyKey, requestId, method, body));
      return NextResponse.json({ success: true, ...result }, {
        status: result.replayed ? 200 : 201,
        headers: { ...NO_STORE, 'X-Request-Id': requestId, 'Idempotency-Replayed': String(result.replayed) },
      });
    }

    const input = parseUpdate(body);
    if (input instanceof NextResponse) return withPrivateHeaders(input, requestId);
    const result = await updatePilot(
      input,
      mutationContext(request, access.admin.userId, idempotencyKey, requestId, method, body),
    );
    return NextResponse.json({ success: true, ...result }, {
      headers: { ...NO_STORE, 'X-Request-Id': requestId, 'Idempotency-Replayed': String(result.replayed) },
    });
  } catch (error) {
    return failure(error, requestId);
  }
}

function parseUpdate(body: Record<string, unknown>): UpdatePilotInput | NextResponse {
  const pilotId = boundedString(body.pilotId, 160);
  const expectedRevision = positiveInteger(body.expectedRevision);
  if (!pilotId || expectedRevision === null) {
    return jsonError('pilotId and a positive expectedRevision are required.', 400);
  }
  const patch: UpdatePilotInput = { pilotId, expectedRevision };
  if (body.status !== undefined) {
    const status = enumValue(body.status, PILOT_STATUSES);
    if (!status) return jsonError('Unknown pilot status.', 400);
    patch.status = status;
  }
  if (body.metricDirection !== undefined) {
    const value = enumValue(body.metricDirection, METRIC_DIRECTIONS);
    if (!value) return jsonError('Unknown metric direction.', 400);
    patch.metricDirection = value;
  }
  for (const [key, limit] of [['metricName', 120], ['metricUnit', 40]] as const) {
    if (body[key] === undefined) continue;
    const value = boundedString(body[key], limit);
    if (!value) return jsonError(`${key} cannot be empty.`, 400);
    patch[key] = value;
  }
  for (const key of ['baselineValue', 'targetValue'] as const) {
    if (body[key] === undefined) continue;
    const value = finiteNumber(body[key]);
    if (value === null) return jsonError(`${key} must be a finite number.`, 400);
    patch[key] = value;
  }
  if (body.outcomeValue !== undefined) {
    const value = body.outcomeValue === null ? null : finiteNumber(body.outcomeValue);
    if (value === null && body.outcomeValue !== null) return jsonError('outcomeValue must be a finite number or null.', 400);
    patch.outcomeValue = value;
  }
  if (body.proofUrl !== undefined) {
    if (body.proofUrl === null || body.proofUrl === '') patch.proofUrl = null;
    else {
      const value = boundedString(body.proofUrl, 2048);
      if (!value) return jsonError('proofUrl must be a URL or null.', 400);
      patch.proofUrl = value;
    }
  }
  if (Object.keys(patch).length === 2) return jsonError('Provide at least one pilot field to update.', 400);
  return patch;
}

function mutationContext(
  request: NextRequest,
  actorUserId: string,
  idempotencyKey: string,
  requestId: string,
  method: 'POST' | 'PATCH',
  body: unknown,
) {
  return {
    actorUserId,
    idempotencyKey,
    requestId,
    method,
    path: request.nextUrl.pathname,
    requestBody: body,
  };
}

function requireSameOrigin(request: NextRequest, requestId: string): NextResponse | null {
  const origin = request.headers.get('origin');
  const configured = [
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    ...(process.env.PILOT_ADMIN_ALLOWED_ORIGINS ?? '').split(','),
  ].map((value) => value?.trim()).filter(Boolean).flatMap((value) => {
    try { return [new URL(value as string).origin]; } catch { return []; }
  });
  const allowed = new Set([CANONICAL_ORIGIN, ...configured]);
  if (process.env.NODE_ENV !== 'production') allowed.add(request.nextUrl.origin);
  if (allowed.size === 0) return jsonError('Pilot administration origin is not configured.', 503, requestId);
  if (!origin || !allowed.has(origin)) return jsonError('Cross-origin pilot mutation refused.', 403, requestId);
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return jsonError('Cross-site pilot mutation refused.', 403, requestId);
  return null;
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return jsonError('Content-Type must be application/json.', 415);
  }
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return jsonError('JSON body must be an object.', 400);
    return body as Record<string, unknown>;
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function boundedHeader(value: string | null, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max && /^[\x21-\x7e]+$/.test(trimmed) ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function enumValue<T extends string>(value: unknown, choices: readonly T[]): T | null {
  return typeof value === 'string' && choices.includes(value as T) ? value as T : null;
}

function failure(error: unknown, requestId: string = randomUUID()): NextResponse {
  if (error instanceof PilotOperationError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : error.code === 'RATE_LIMITED' ? 429 : 400;
    return jsonError(error.message, status, requestId);
  }
  console.error('Pilot operation failed', {
    requestId,
    error: error instanceof Error ? error.name : 'unknown',
  });
  return jsonError('Pilot operations are temporarily unavailable.', 503, requestId);
}

function jsonError(error: string, status: number, requestId?: string): NextResponse {
  return NextResponse.json({ success: false, error, ...(requestId ? { requestId } : {}) }, {
    status,
    headers: { ...NO_STORE, ...(requestId ? { 'X-Request-Id': requestId } : {}) },
  });
}

function withPrivateHeaders(response: NextResponse, requestId?: string): NextResponse {
  for (const [key, value] of Object.entries(NO_STORE)) response.headers.set(key, value);
  if (requestId) response.headers.set('X-Request-Id', requestId);
  return response;
}
