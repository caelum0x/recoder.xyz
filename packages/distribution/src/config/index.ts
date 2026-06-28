import { z } from 'zod';

/**
 * Documented env var NAMES (never values). Secrets are read at runtime from
 * env/vault only — never inlined (memory landmine: broad secret globs once hid
 * source). This list is the contract the adapters and health checks read.
 */
export const ENV_KEYS = {
  /** Polar Merchant-of-Record access token. Absent → billing unhealthy + deny. */
  POLAR_ACCESS_TOKEN: 'POLAR_ACCESS_TOKEN',
  /** Polar API base override (defaults to the documented production base). */
  POLAR_API_BASE: 'POLAR_API_BASE',
  /** Polar webhook signing secret (verify the wire; never trust it blindly). */
  POLAR_WEBHOOK_SECRET: 'POLAR_WEBHOOK_SECRET',
  /** recoder.xyz base URL (auth source of truth). No hardcoded localhost. */
  RECODER_BASE_URL: 'RECODER_BASE_URL',
  /** npm publish token. Absent → npm channel unhealthy + deny. */
  NPM_TOKEN: 'NPM_TOKEN',
  /** CLI token signing key for issuing/verifying scoped CLI tokens. */
  CLI_TOKEN_SIGNING_KEY: 'CLI_TOKEN_SIGNING_KEY',
  /** Internal service key for the signed envelope to py/recoder-billing. */
  INTERNAL_SERVICE_KEY: 'INTERNAL_SERVICE_KEY',
} as const;

export type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS];

/** Default production base for the Polar Merchant-of-Record API. */
export const DEFAULT_POLAR_API_BASE = 'https://api.polar.sh';

/** Default device-flow client id (matches CLIENT_ID in RecoderAuthService). */
export const DEFAULT_CLI_CLIENT_ID = 'recoder-code';

export const DistributionConfigSchema = z.object({
  /** recoder.xyz base URL — the auth authority. No hardcoded localhost. */
  recoderBaseUrl: z.string().url(),
  /** Polar API base (Merchant of Record). */
  polarApiBase: z.string().url().default(DEFAULT_POLAR_API_BASE),
  /** Device-flow client id. */
  cliClientId: z.string().min(1).default(DEFAULT_CLI_CLIENT_ID),
  /** Default device-grant TTL in seconds. */
  deviceGrantTtlSeconds: z.number().int().positive().default(900),
  /** Default device-poll interval in seconds. */
  devicePollIntervalSeconds: z.number().int().positive().default(5),
  /** CLI access-token TTL in seconds. */
  cliTokenTtlSeconds: z.number().int().positive().default(3600),
});

export type DistributionConfig = z.infer<typeof DistributionConfigSchema>;

/**
 * Build config from a record (env). Fails fast (Zod) when a required field like
 * the recoder.xyz base URL is missing or malformed — no localhost fallback.
 */
export function loadDistributionConfig(
  env: Record<string, string | undefined>,
): DistributionConfig {
  const recoderBaseUrl = env[ENV_KEYS.RECODER_BASE_URL];
  if (!recoderBaseUrl) {
    throw new Error(
      `${ENV_KEYS.RECODER_BASE_URL} is required (recoder.xyz is the auth source of truth; no hardcoded localhost).`,
    );
  }
  return DistributionConfigSchema.parse({
    recoderBaseUrl,
    polarApiBase: env[ENV_KEYS.POLAR_API_BASE] ?? DEFAULT_POLAR_API_BASE,
    cliClientId: DEFAULT_CLI_CLIENT_ID,
  });
}
