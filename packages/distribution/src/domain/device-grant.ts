import { z } from 'zod';

/**
 * Device-flow grant state. Mirrors the OAuth 2.0 Device Authorization Grant
 * (RFC 8628) lifecycle used by the recoder.xyz CLI login.
 */
export type DeviceGrantStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';

export const DeviceGrantStatusSchema = z.enum([
  'pending',
  'approved',
  'denied',
  'expired',
  'consumed',
]);

/**
 * A device authorization grant. Shape is the union of the fields the owned CLI
 * bridge (`WebAuthSession` in packages/cli/.../web-cli-auth-bridge.ts) and the
 * recoder.xyz token endpoint exchange. `deviceCode` is the CLI-side secret;
 * `userCode` is the short human-typed code shown in the browser.
 */
export interface DeviceAuthGrant {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete: string;
  /** Seconds until expiry, as reported to the CLI. */
  readonly expiresIn: number;
  /** Minimum poll interval, seconds. */
  readonly interval: number;
  readonly clientId: string;
  readonly status: DeviceGrantStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** Set once a browser session approves the grant. */
  readonly approvedUserId?: string;
}

export const DeviceAuthGrantSchema: z.ZodType<DeviceAuthGrant> = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.string().url(),
  verificationUriComplete: z.string().url(),
  expiresIn: z.number().int().positive(),
  interval: z.number().int().positive(),
  clientId: z.string().min(1),
  status: DeviceGrantStatusSchema,
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  approvedUserId: z.string().optional(),
});

/** True when the grant's wall-clock expiry has passed relative to `now`. */
export function isGrantExpired(grant: DeviceAuthGrant, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(grant.expiresAt).getTime();
}
