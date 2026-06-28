import { z } from 'zod';

/**
 * A license key, mirroring the Polar license_key shape we fuse. The key value
 * is opaque; validation/activation is the billing engine's authority.
 */
export interface LicenseKey {
  readonly id: string;
  readonly key: string;
  readonly subjectId: string;
  readonly status: 'granted' | 'disabled' | 'revoked';
  readonly limitActivations?: number;
  readonly usage: number;
  readonly expiresAt?: string;
}

export const LicenseKeySchema: z.ZodType<LicenseKey> = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  subjectId: z.string().min(1),
  status: z.enum(['granted', 'disabled', 'revoked']),
  limitActivations: z.number().int().positive().optional(),
  usage: z.number().int().nonnegative(),
  expiresAt: z.string().optional(),
});

/** The result of validating/activating a license key. */
export interface LicenseKeyActivation {
  readonly valid: boolean;
  readonly key?: LicenseKey;
  readonly activationId?: string;
  readonly reason?: string;
}

export const LicenseKeyActivationSchema: z.ZodType<LicenseKeyActivation> = z.object({
  valid: z.boolean(),
  key: LicenseKeySchema.optional(),
  activationId: z.string().optional(),
  reason: z.string().optional(),
});
