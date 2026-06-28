import { z } from 'zod';

/**
 * A truthful health state. The production rule forbids inferred/faked success:
 * a missing key or absent dependency is reported as `unhealthy` with a reason,
 * never green-washed to `ok`.
 */
export type HealthStatus = 'ok' | 'degraded' | 'unhealthy';

export const HealthStatusSchema = z.enum(['ok', 'degraded', 'unhealthy']);

export interface ChannelHealth {
  readonly status: HealthStatus;
  /** Required whenever status !== 'ok' — the environment/evidence reason. */
  readonly reason?: string;
  /** Optional structured detail (which keys are missing, etc.). */
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly checkedAt: string;
}

export const ChannelHealthSchema: z.ZodType<ChannelHealth> = z
  .object({
    status: HealthStatusSchema,
    reason: z.string().optional(),
    detail: z.record(z.unknown()).optional(),
    checkedAt: z.string().min(1),
  })
  .refine((h) => h.status === 'ok' || (h.reason !== undefined && h.reason.length > 0), {
    message: 'non-ok health must carry a reason',
  });

export function healthy(detail?: Record<string, unknown>): ChannelHealth {
  return {
    status: 'ok',
    ...(detail ? { detail } : {}),
    checkedAt: new Date().toISOString(),
  };
}

export function unhealthy(reason: string, detail?: Record<string, unknown>): ChannelHealth {
  return {
    status: 'unhealthy',
    reason,
    ...(detail ? { detail } : {}),
    checkedAt: new Date().toISOString(),
  };
}

export function degraded(reason: string, detail?: Record<string, unknown>): ChannelHealth {
  return {
    status: 'degraded',
    reason,
    ...(detail ? { detail } : {}),
    checkedAt: new Date().toISOString(),
  };
}
