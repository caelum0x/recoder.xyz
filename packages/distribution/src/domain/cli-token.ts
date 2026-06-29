import { z } from 'zod';
import { PlanSchema, type Plan } from './subscription-plan';

/**
 * The scopes a CLI token may carry. Mirrors the scopes the owned CLI auth
 * services request (`cli:full`, `profile`, `cli:basic`).
 */
export type CliScope = 'cli:basic' | 'cli:full' | 'profile' | 'byok';

export const CliScopeSchema = z.enum(['cli:basic', 'cli:full', 'profile', 'byok']);

/**
 * A scoped CLI token. This is the union of the owned `CLIToken`
 * (packages/cli/.../web-cli-auth-bridge.ts) and `RecoderAuthData`
 * (packages/recoder-code/.../RecoderAuthService.ts): access + refresh + plan +
 * scopes, bound to a recoder.xyz user. recoder.xyz remains the source of truth;
 * this token is only an issued-and-verifiable artifact.
 */
export interface CliToken {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** ISO-8601 expiry of the access token. */
  readonly expiresAt: string;
  readonly userId: string;
  readonly email: string;
  readonly plan: Plan;
  readonly scopes: readonly CliScope[];
  readonly clientId: string;
}

export const CliTokenSchema: z.ZodType<CliToken> = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string().min(1),
  userId: z.string().min(1),
  email: z.string().email(),
  plan: PlanSchema,
  scopes: z.array(CliScopeSchema),
  clientId: z.string().min(1),
});

/**
 * The `~/.recoder/auth.json` on-disk shape, taken verbatim from
 * `RecoderAuthData` so an issued token round-trips with the existing CLI.
 */
export interface RecoderUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly subscription_plan: Plan;
  readonly has_own_api_key: boolean;
  readonly quota: {
    readonly requests_remaining: number;
    readonly requests_limit: number;
    readonly reset_date: string;
  };
}

export interface RecoderAuthData {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: string;
  readonly user: RecoderUser;
}

export const RecoderAuthDataSchema: z.ZodType<RecoderAuthData> = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.string().min(1),
  user: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string(),
    subscription_plan: PlanSchema,
    has_own_api_key: z.boolean(),
    quota: z.object({
      requests_remaining: z.number().int(),
      requests_limit: z.number().int(),
      reset_date: z.string().min(1),
    }),
  }),
});

/** True when the access token has expired relative to `now`. */
export function isTokenExpired(token: CliToken, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(token.expiresAt).getTime();
}
