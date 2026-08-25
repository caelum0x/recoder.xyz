import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { isPublicHttpUrl } from './public-url';

export { isPublicHttpUrl } from './public-url';

export const PILOT_STATUSES = ['started', 'completed', 'verified', 'cancelled'] as const;
export const METRIC_DIRECTIONS = ['increase', 'decrease', 'exact'] as const;

export type PilotStatus = (typeof PILOT_STATUSES)[number];
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

export interface CreatePilotInput {
  designPartnerLeadId: string;
  metricName: string;
  metricUnit: string;
  metricDirection: MetricDirection;
  baselineValue: number;
  targetValue: number;
}

export interface UpdatePilotInput {
  pilotId: string;
  expectedRevision: number;
  status?: PilotStatus;
  metricName?: string;
  metricUnit?: string;
  metricDirection?: MetricDirection;
  baselineValue?: number;
  targetValue?: number;
  outcomeValue?: number | null;
  proofUrl?: string | null;
}

interface MutationContext {
  actorUserId: string;
  idempotencyKey: string;
  requestId: string;
  method: 'POST' | 'PATCH';
  path: string;
  requestBody: unknown;
}

export class PilotOperationError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED' | 'INVALID_INPUT',
    message: string,
  ) {
    super(message);
    this.name = 'PilotOperationError';
  }
}

const TRANSITIONS: Readonly<Record<PilotStatus, readonly PilotStatus[]>> = {
  started: ['completed', 'cancelled'],
  completed: ['verified', 'cancelled'],
  verified: [],
  cancelled: [],
};

const OPERATOR_MUTATIONS_PER_MINUTE = 30;

export async function readPilotOperations(): Promise<{
  leadRefs: Array<{ id: string; createdAt: string }>;
  pilots: Array<Record<string, unknown>>;
}> {
  const [leads, pilots] = await Promise.all([
    prisma.pilot_design_partner_leads.findMany({
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.pilot_evidence_pilots.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 500,
      include: {
        events: {
          orderBy: { revision: 'asc' },
          select: {
            actorUserId: true,
            action: true,
            fromStatus: true,
            toStatus: true,
            revision: true,
            requestHash: true,
            requestId: true,
            previousHash: true,
            eventHash: true,
            snapshot: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  return {
    leadRefs: leads.map((lead: { id: string; createdAt: Date }) => ({
      id: lead.id,
      createdAt: lead.createdAt.toISOString(),
    })),
    pilots: pilots.map((pilot: any) => {
      verifyEvidenceChain(pilot);
      return toPilotWire(pilot);
    }),
  };
}

export async function createPilot(
  input: CreatePilotInput,
  context: MutationContext,
): Promise<{ pilot: Record<string, unknown>; replayed: boolean }> {
  return runIdempotentMutation(context, async (tx, requestFingerprint, requestHash) => {
    const lead = await tx.pilot_design_partner_leads.findUnique({
      where: { id: input.designPartnerLeadId },
      select: { id: true },
    });
    if (!lead) {
      throw new PilotOperationError('NOT_FOUND', 'The design-partner lead does not exist.');
    }

    const now = new Date();
    const pilot = await tx.pilot_evidence_pilots.create({
      data: {
        designPartnerLeadId: input.designPartnerLeadId,
        metricName: input.metricName,
        metricUnit: input.metricUnit,
        metricDirection: input.metricDirection,
        baselineValue: input.baselineValue,
        targetValue: input.targetValue,
        status: 'started',
        startedAt: now,
        revision: 1,
        createdById: context.actorUserId,
        updatedById: context.actorUserId,
        createdAt: now,
        updatedAt: now,
      },
    });
    const snapshot = toPilotWire(pilot);
    await appendEvidenceEvent(tx, {
      pilotId: pilot.id,
      actorUserId: context.actorUserId,
      action: 'pilot.created',
      fromStatus: null,
      toStatus: 'started',
      revision: 1,
      requestFingerprint,
      requestHash,
      requestId: context.requestId,
      previousHash: null,
      snapshot,
      createdAt: now,
    });
    return snapshot;
  });
}

export async function updatePilot(
  input: UpdatePilotInput,
  context: MutationContext,
): Promise<{ pilot: Record<string, unknown>; replayed: boolean }> {
  return runIdempotentMutation(context, async (tx, requestFingerprint, requestHash) => {
    const current = await tx.pilot_evidence_pilots.findUnique({
      where: { id: input.pilotId },
      include: {
        events: {
          orderBy: { revision: 'desc' },
          take: 1,
          select: { eventHash: true },
        },
      },
    });
    if (!current) throw new PilotOperationError('NOT_FOUND', 'Pilot not found.');
    if (current.revision !== input.expectedRevision) {
      throw new PilotOperationError(
        'CONFLICT',
        `Pilot changed after revision ${input.expectedRevision}. Refresh before saving.`,
      );
    }
    if (current.status === 'verified' || current.status === 'cancelled') {
      throw new PilotOperationError('CONFLICT', `Pilot status ${current.status} is terminal.`);
    }
    if (!current.events[0]?.eventHash) {
      throw new Error(`Pilot ${current.id} is missing its current evidence event.`);
    }

    const nextStatus = input.status ?? current.status as PilotStatus;
    if (
      nextStatus !== current.status &&
      !TRANSITIONS[current.status as PilotStatus].includes(nextStatus)
    ) {
      throw new PilotOperationError(
        'CONFLICT',
        `Pilot cannot move from ${current.status} to ${nextStatus}.`,
      );
    }

    const now = new Date();
    const next = {
      metricName: input.metricName ?? current.metricName,
      metricUnit: input.metricUnit ?? current.metricUnit,
      metricDirection: input.metricDirection ?? current.metricDirection,
      baselineValue: input.baselineValue ?? current.baselineValue,
      targetValue: input.targetValue ?? current.targetValue,
      outcomeValue: input.outcomeValue !== undefined ? input.outcomeValue : current.outcomeValue,
      proofUrl: input.proofUrl !== undefined ? input.proofUrl : current.proofUrl,
      status: nextStatus,
      completedAt:
        nextStatus === 'completed' && current.status !== 'completed'
          ? now
          : current.completedAt,
      verifiedAt: nextStatus === 'verified' ? now : current.verifiedAt,
      cancelledAt: nextStatus === 'cancelled' ? now : current.cancelledAt,
    };
    assertPilotInvariant(next);

    const revision = current.revision + 1;
    const updated = await tx.pilot_evidence_pilots.updateMany({
      where: { id: current.id, revision: current.revision },
      data: {
        ...next,
        revision,
        updatedById: context.actorUserId,
        updatedAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new PilotOperationError('CONFLICT', 'Pilot changed while this update was being saved. Refresh and retry.');
    }

    const pilot = await tx.pilot_evidence_pilots.findUnique({ where: { id: current.id } });
    if (!pilot) throw new PilotOperationError('NOT_FOUND', 'Pilot not found after update.');
    const snapshot = toPilotWire(pilot);
    await appendEvidenceEvent(tx, {
      pilotId: pilot.id,
      actorUserId: context.actorUserId,
      action: nextStatus !== current.status ? `pilot.${nextStatus}` : 'pilot.updated',
      fromStatus: current.status,
      toStatus: nextStatus,
      revision,
      requestFingerprint,
      requestHash,
      requestId: context.requestId,
      previousHash: current.events[0]?.eventHash ?? null,
      snapshot,
      createdAt: now,
    });
    return snapshot;
  });
}

async function runIdempotentMutation(
  context: MutationContext,
  mutation: (tx: any, requestFingerprint: string, requestHash: string) => Promise<Record<string, unknown>>,
): Promise<{ pilot: Record<string, unknown>; replayed: boolean }> {
  const requestFingerprint = sha256([
    context.actorUserId,
    context.method,
    context.path,
    context.idempotencyKey,
  ].join('\n'));
  const requestHash = sha256(canonicalJson(context.requestBody));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        const replay = await tx.pilot_evidence_events.findUnique({
          where: { requestFingerprint },
          select: { requestHash: true, snapshot: true },
        });
        if (replay) {
          if (replay.requestHash !== requestHash) {
            throw new PilotOperationError(
              'CONFLICT',
              'This Idempotency-Key was already used with a different request.',
            );
          }
          return { pilot: replay.snapshot as Record<string, unknown>, replayed: true };
        }

        await consumeOperatorRateLimit(tx, context.actorUserId);
        const pilot = await mutation(tx, requestFingerprint, requestHash);
        return { pilot, replayed: false };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isPrismaCode(error, 'P2034') && attempt < 2) continue;
      if (isPrismaCode(error, 'P2002')) {
        const replay = await prisma.pilot_evidence_events.findUnique({
          where: { requestFingerprint },
          select: { requestHash: true, snapshot: true },
        });
        if (replay) {
          if (replay.requestHash !== requestHash) {
            throw new PilotOperationError(
              'CONFLICT',
              'This Idempotency-Key was already used with a different request.',
            );
          }
          return { pilot: replay.snapshot as Record<string, unknown>, replayed: true };
        }
      }
      throw error;
    }
  }
  throw new PilotOperationError('CONFLICT', 'The pilot operation could not be serialized. Retry with the same Idempotency-Key.');
}

async function consumeOperatorRateLimit(tx: any, actorUserId: string): Promise<void> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const bucketKey = sha256(`${actorUserId}\n${windowStart.toISOString()}`);
  const bucket = await tx.pilot_operator_rate_limits.upsert({
    where: { bucketKey },
    create: { bucketKey, actorUserId, windowStart, count: 1, updatedAt: now },
    update: { count: { increment: 1 }, updatedAt: now },
    select: { count: true },
  });
  await tx.pilot_operator_rate_limits.deleteMany({
    where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
  });
  if (bucket.count > OPERATOR_MUTATIONS_PER_MINUTE) {
    throw new PilotOperationError('RATE_LIMITED', 'Too many pilot mutations. Retry after the current minute.');
  }
}

async function appendEvidenceEvent(tx: any, event: {
  pilotId: string;
  actorUserId: string;
  action: string;
  fromStatus: string | null;
  toStatus: PilotStatus;
  revision: number;
  requestFingerprint: string;
  requestHash: string;
  requestId: string;
  previousHash: string | null;
  snapshot: Record<string, unknown>;
  createdAt: Date;
}): Promise<void> {
  const eventHash = evidenceHash({
    pilotId: event.pilotId,
    actorUserId: event.actorUserId,
    action: event.action,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    revision: event.revision,
    requestHash: event.requestHash,
    requestId: event.requestId,
    previousHash: event.previousHash,
    snapshot: event.snapshot,
    createdAt: event.createdAt,
  });
  await tx.pilot_evidence_events.create({
    data: { ...event, id: randomUUID(), eventHash },
  });
}

function assertPilotInvariant(pilot: {
  metricName: string;
  metricUnit: string;
  metricDirection: string;
  baselineValue: number;
  targetValue: number;
  outcomeValue: number | null;
  proofUrl: string | null;
  status: string;
  completedAt: Date | null;
  verifiedAt: Date | null;
}): void {
  if (!pilot.metricName || !pilot.metricUnit) {
    throw new PilotOperationError('INVALID_INPUT', 'Pilot measure and unit are required.');
  }
  if (!METRIC_DIRECTIONS.includes(pilot.metricDirection as MetricDirection)) {
    throw new PilotOperationError('INVALID_INPUT', 'Unknown metric direction.');
  }
  if (![pilot.baselineValue, pilot.targetValue].every(isFiniteMeasure)) {
    throw new PilotOperationError('INVALID_INPUT', 'Pilot baseline and target must be finite numbers.');
  }
  if (pilot.outcomeValue !== null && !isFiniteMeasure(pilot.outcomeValue)) {
    throw new PilotOperationError('INVALID_INPUT', 'Pilot outcome must be a finite number.');
  }
  if (pilot.proofUrl !== null && !isPublicHttpUrl(pilot.proofUrl)) {
    throw new PilotOperationError('INVALID_INPUT', 'Proof URL must be a public HTTP or HTTPS URL.');
  }
  if ((pilot.status === 'completed' || pilot.status === 'verified') && pilot.outcomeValue === null) {
    throw new PilotOperationError('INVALID_INPUT', 'A completed pilot requires an outcome.');
  }
  if (pilot.status === 'completed' && !pilot.completedAt) {
    throw new PilotOperationError('INVALID_INPUT', 'A completed pilot requires a completion time.');
  }
  if (pilot.status === 'verified' && (!pilot.completedAt || !pilot.verifiedAt || !pilot.proofUrl)) {
    throw new PilotOperationError('INVALID_INPUT', 'A verified pilot requires completion, outcome, and public proof.');
  }
}

function toPilotWire(pilot: any): Record<string, unknown> {
  const lastEvent = pilot.events?.at(-1);
  return {
    id: pilot.id,
    designPartnerLeadId: pilot.designPartnerLeadId,
    metricName: pilot.metricName,
    metricUnit: pilot.metricUnit,
    metricDirection: pilot.metricDirection,
    baselineValue: pilot.baselineValue,
    targetValue: pilot.targetValue,
    outcomeValue: pilot.outcomeValue,
    proofUrl: pilot.proofUrl,
    status: pilot.status,
    startedAt: iso(pilot.startedAt),
    completedAt: iso(pilot.completedAt),
    verifiedAt: iso(pilot.verifiedAt),
    cancelledAt: iso(pilot.cancelledAt),
    createdAt: iso(pilot.createdAt),
    updatedAt: iso(pilot.updatedAt),
    revision: pilot.revision,
    ...(lastEvent ? { lastEvidence: {
      action: lastEvent.action,
      eventHash: lastEvent.eventHash,
      createdAt: iso(lastEvent.createdAt),
    } } : {}),
  };
}

/** Fail closed when a persisted pilot's append-only evidence chain diverges. */
export function verifyEvidenceChain(pilot: any): void {
  const events = Array.isArray(pilot.events) ? pilot.events : [];
  if (events.length !== pilot.revision) throw new Error(`Pilot ${pilot.id} evidence revision count mismatch.`);
  let previousHash: string | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const expectedRevision = index + 1;
    if (event.revision !== expectedRevision || event.previousHash !== previousHash) {
      throw new Error(`Pilot ${pilot.id} evidence sequence mismatch.`);
    }
    const expectedHash = evidenceHash({
      pilotId: pilot.id,
      actorUserId: event.actorUserId,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      revision: event.revision,
      requestHash: event.requestHash,
      requestId: event.requestId,
      previousHash: event.previousHash,
      snapshot: event.snapshot,
      createdAt: event.createdAt,
    });
    if (event.eventHash !== expectedHash) throw new Error(`Pilot ${pilot.id} evidence hash mismatch.`);
    previousHash = event.eventHash;
  }
  const current = events.at(-1)?.snapshot as Record<string, unknown> | undefined;
  const wire = toPilotWire({ ...pilot, events: [] });
  delete wire.lastEvidence;
  if (!current || canonicalJson(current) !== canonicalJson(wire)) {
    throw new Error(`Pilot ${pilot.id} current state differs from its evidence snapshot.`);
  }
}

function evidenceHash(event: {
  pilotId: string;
  actorUserId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  revision: number;
  requestHash: string;
  requestId: string;
  previousHash: string | null;
  snapshot: unknown;
  createdAt: Date | string;
}): string {
  return sha256(canonicalJson({
    ...event,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : new Date(event.createdAt).toISOString(),
  }));
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isFiniteMeasure(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
