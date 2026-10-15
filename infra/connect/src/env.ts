/**
 * Typed Worker bindings + env for Recoder Connect. Everything optional here
 * is genuinely optional at runtime — callers (billing, auth, mail) must
 * degrade truthfully (503 / explicit "not configured" error) rather than
 * throw at import time or fabricate success. This mirrors the repo-wide
 * billing law already enforced in backend/src/domains/billing (fail-safe,
 * never a faked readiness).
 */
import { z } from 'zod';

export interface HyperdriveBinding {
  readonly connectionString: string;
}

/** The Worker's bindings, as declared in wrangler.jsonc. */
export interface ConnectEnv {
  readonly HYPERDRIVE: HyperdriveBinding;
  readonly APP_URL: string;
  readonly CONNECT_URL: string;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly BETTER_AUTH_SECRET?: string;
  readonly SCRIBASE_MAIL_API_URL: string;
  readonly SCRIBASE_MAIL_API_KEY?: string;
  readonly SCRIBASE_MAIL_FROM: string;
  readonly RECODER_CONNECT_DODO_API_KEY?: string;
  readonly RECODER_CONNECT_DODO_WEBHOOK_SECRET?: string;
  readonly RECODER_CONNECT_DODO_PRODUCT_PRO_MONTHLY?: string;
  readonly RECODER_CONNECT_DODO_PRODUCT_PRO_ANNUAL?: string;
  readonly RECODER_CONNECT_DODO_PRODUCT_TEAM_MONTHLY?: string;
  readonly RECODER_CONNECT_DODO_TEST_MODE?: string;
}

const presentString = z.string().trim().min(1);

/** True when the value is a non-empty string — never logs the value itself. */
export function isPresent(value: string | undefined | null): value is string {
  return presentString.safeParse(value).success;
}

export interface DodoCredential {
  readonly apiKey: string | null;
  readonly present: boolean;
  readonly webhookSecret: string | null;
  readonly webhookSecretPresent: boolean;
  readonly testMode: boolean;
}

/** Projects the Dodo credential slice out of env — never throws on absence. */
export function dodoCredential(env: ConnectEnv): DodoCredential {
  const apiKey = env.RECODER_CONNECT_DODO_API_KEY ?? null;
  const webhookSecret = env.RECODER_CONNECT_DODO_WEBHOOK_SECRET ?? null;
  return {
    apiKey,
    present: isPresent(apiKey),
    webhookSecret,
    webhookSecretPresent: isPresent(webhookSecret),
    testMode: env.RECODER_CONNECT_DODO_TEST_MODE !== 'false',
  };
}

export interface DodoProductMap {
  readonly pro_monthly: string | null;
  readonly pro_annual: string | null;
  readonly team_monthly: string | null;
}

export function dodoProducts(env: ConnectEnv): DodoProductMap {
  return {
    pro_monthly: env.RECODER_CONNECT_DODO_PRODUCT_PRO_MONTHLY ?? null,
    pro_annual: env.RECODER_CONNECT_DODO_PRODUCT_PRO_ANNUAL ?? null,
    team_monthly: env.RECODER_CONNECT_DODO_PRODUCT_TEAM_MONTHLY ?? null,
  };
}

export interface ScribaseMailCredential {
  readonly apiUrl: string;
  readonly apiKey: string | null;
  readonly present: boolean;
  readonly from: string;
}

export function scribaseMailCredential(env: ConnectEnv): ScribaseMailCredential {
  const apiKey = env.SCRIBASE_MAIL_API_KEY ?? null;
  return {
    apiUrl: env.SCRIBASE_MAIL_API_URL,
    apiKey,
    present: isPresent(apiKey),
    from: env.SCRIBASE_MAIL_FROM,
  };
}
