import { createHash, createHmac, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { PilotOperationError } from './service';

export const TEAM_SIZES = ['1', '2-10', '11-50', '51-200', '201+'] as const;
export const DEPLOYMENTS = ['local', 'cloud', 'both'] as const;
export const PRIMARY_PAINS = ['compare', 'merge', 'governance', 'privacy', 'cost', 'reliability'] as const;
export const WEEKLY_RUNS = ['0-5', '6-20', '21-100', '101+'] as const;
export const PILOT_TIMINGS = ['now', '30-days', 'quarter', 'research'] as const;
export const CURRENT_AGENTS = ['claude code', 'codex', 'cursor', 'opencode', 'other'] as const;

export interface DesignPartnerInput {
  email: string;
  teamSize: (typeof TEAM_SIZES)[number];
  currentAgents: Array<(typeof CURRENT_AGENTS)[number]>;
  deployment: (typeof DEPLOYMENTS)[number];
  primaryPain: (typeof PRIMARY_PAINS)[number];
  weeklyRuns: (typeof WEEKLY_RUNS)[number];
  evidenceRequired: boolean;
  pilotTiming: (typeof PILOT_TIMINGS)[number];
  interviewConsent: boolean;
}

const INTAKES_PER_HOUR = 5;

export async function saveDesignPartnerIntake(
  input: DesignPartnerInput,
  context: { idempotencyKey: string; ipAddress: string; requestId: string },
): Promise<{ id: string; replayed: boolean }> {
  const ipDigest = digestIp(context.ipAddress);
  const requestFingerprint = sha256(`pilot-intake\n${context.idempotencyKey}`);
  const requestHash = sha256(canonicalJson(input));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        const replay = await tx.pilot_design_partner_leads.findUnique({
          where: { requestFingerprint },
          select: { id: true, requestHash: true },
        });
        if (replay) {
          if (replay.requestHash !== requestHash) {
            throw new PilotOperationError('CONFLICT', 'This Idempotency-Key was already used with a different intake.');
          }
          return { id: replay.id, replayed: true };
        }

        await consumeIntakeRateLimit(tx, ipDigest);
        const lead = await tx.pilot_design_partner_leads.create({
          data: {
            id: randomUUID(),
            source: 'design-partners',
            requestFingerprint,
            requestHash,
            ...input,
          },
          select: { id: true },
        });
        return { id: lead.id, replayed: false };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isPrismaCode(error, 'P2034') && attempt < 2) continue;
      if (isPrismaCode(error, 'P2002')) {
        const replay = await prisma.pilot_design_partner_leads.findUnique({
          where: { requestFingerprint },
          select: { id: true, requestHash: true },
        });
        if (replay) {
          if (replay.requestHash !== requestHash) {
            throw new PilotOperationError('CONFLICT', 'This Idempotency-Key was already used with a different intake.');
          }
          return { id: replay.id, replayed: true };
        }
      }
      throw error;
    }
  }
  throw new PilotOperationError('CONFLICT', 'The intake could not be serialized. Retry with the same Idempotency-Key.');
}

async function consumeIntakeRateLimit(tx: any, ipDigest: string): Promise<void> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const bucketKey = sha256(`${ipDigest}\n${windowStart.toISOString()}`);
  const bucket = await tx.pilot_intake_rate_limits.upsert({
    where: { bucketKey },
    create: { bucketKey, ipDigest, windowStart, count: 1, updatedAt: now },
    update: { count: { increment: 1 }, updatedAt: now },
    select: { count: true },
  });
  await tx.pilot_intake_rate_limits.deleteMany({
    where: { windowStart: { lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
  });
  if (bucket.count > INTAKES_PER_HOUR) {
    throw new PilotOperationError('RATE_LIMITED', 'Too many intake submissions. Try again later.');
  }
}

function digestIp(ipAddress: string): string {
  const secret = process.env.PILOT_INTAKE_IP_HASH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new PilotOperationError('INVALID_INPUT', 'Pilot intake privacy key is not configured.');
  }
  return createHmac('sha256', secret ?? 'recoder-local-pilot-intake').update(ipAddress).digest('hex');
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
