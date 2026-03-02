import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export interface NormalizedVerificationRecord {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  source: 'verification' | 'verifications';
}

export async function createVerificationRecord(
  identifier: string,
  rawTokenOrCode: string,
  expiresAt: Date
): Promise<string> {
  const hashedValue = crypto.createHash('sha256').update(rawTokenOrCode).digest('hex');
  const id = crypto.randomUUID();

  await Promise.allSettled([
    prisma.verifications.create({
      data: {
        id,
        identifier,
        value: hashedValue,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      },
    }),
    prisma.verification.create({
      data: {
        id,
        identifier,
        value: hashedValue,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }),
  ]);

  return hashedValue;
}

export async function findValidVerificationByHashedValue(
  hashedValue: string
): Promise<NormalizedVerificationRecord | null> {
  const now = new Date();

  const [legacy, modern] = await Promise.all([
    prisma.verifications.findFirst({
      where: {
        value: hashedValue,
        expires_at: { gt: now },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.verification.findFirst({
      where: {
        value: hashedValue,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  if (legacy) {
    return {
      id: legacy.id,
      identifier: legacy.identifier,
      value: legacy.value,
      expiresAt: legacy.expires_at,
      source: 'verifications',
    };
  }

  if (modern) {
    return {
      id: modern.id,
      identifier: modern.identifier,
      value: modern.value,
      expiresAt: modern.expiresAt,
      source: 'verification',
    };
  }

  return null;
}

export async function consumeVerification(identifier: string, hashedValue: string): Promise<void> {
  const results = await Promise.allSettled([
    prisma.verifications.deleteMany({
      where: { identifier, value: hashedValue },
    }),
    prisma.verification.deleteMany({
      where: { identifier, value: hashedValue },
    }),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('Failed consuming verification record', {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        identifier,
      });
    }
  }
}
