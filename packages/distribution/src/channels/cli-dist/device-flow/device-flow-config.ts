import { DEFAULT_CLI_CLIENT_ID } from '../../../config/index';

/**
 * Device-flow configuration — CLIENT_ID, intervals, TTLs. NO SECRETS. The
 * client id matches `CLIENT_ID = 'recoder-code'` in RecoderAuthService and the
 * `CLIENT_ID` the verify-cli-device-flow-e2e.sh script uses.
 */
export interface DeviceFlowConfig {
  readonly clientId: string;
  /** recoder.xyz base — the auth source of truth. */
  readonly recoderBaseUrl: string;
  /** Grant lifetime in seconds (default 15 min, matching the CLI bridge). */
  readonly grantTtlSeconds: number;
  /** Poll interval in seconds. */
  readonly pollIntervalSeconds: number;
  /** Issued CLI access-token lifetime in seconds. */
  readonly accessTokenTtlSeconds: number;
  /** Path of the browser verification page (relative to recoderBaseUrl). */
  readonly verificationPath: string;
  /** Path of the CLI token exchange endpoint. */
  readonly tokenPath: string;
}

export const DEFAULT_DEVICE_FLOW_CONFIG = {
  clientId: DEFAULT_CLI_CLIENT_ID,
  grantTtlSeconds: 900,
  pollIntervalSeconds: 5,
  accessTokenTtlSeconds: 3600,
  verificationPath: '/auth/cli',
  tokenPath: '/api/auth/cli/token',
} as const;

/**
 * Build a device-flow config. `recoderBaseUrl` is required and must be a real
 * URL — no hardcoded localhost. Everything else has documented defaults.
 */
export function buildDeviceFlowConfig(input: {
  recoderBaseUrl: string;
  clientId?: string;
  grantTtlSeconds?: number;
  pollIntervalSeconds?: number;
  accessTokenTtlSeconds?: number;
}): DeviceFlowConfig {
  if (!input.recoderBaseUrl) {
    throw new Error('recoderBaseUrl is required (recoder.xyz is the auth source of truth)');
  }
  // Validate it is a real URL — fail fast on a malformed/relative value.
  const url = new URL(input.recoderBaseUrl);
  return {
    clientId: input.clientId ?? DEFAULT_DEVICE_FLOW_CONFIG.clientId,
    recoderBaseUrl: url.origin,
    grantTtlSeconds: input.grantTtlSeconds ?? DEFAULT_DEVICE_FLOW_CONFIG.grantTtlSeconds,
    pollIntervalSeconds:
      input.pollIntervalSeconds ?? DEFAULT_DEVICE_FLOW_CONFIG.pollIntervalSeconds,
    accessTokenTtlSeconds:
      input.accessTokenTtlSeconds ?? DEFAULT_DEVICE_FLOW_CONFIG.accessTokenTtlSeconds,
    verificationPath: DEFAULT_DEVICE_FLOW_CONFIG.verificationPath,
    tokenPath: DEFAULT_DEVICE_FLOW_CONFIG.tokenPath,
  };
}
