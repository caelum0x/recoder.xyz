/**
 * Recoder-owned Daytona SDK integration.
 *
 * Wires the merged, first-party `@recoder/sandbox-daytona` (vendored + owned from
 * daytona-projects, OpenTelemetry neutralized, generated API clients owned as
 * @recoder/daytona-*-api-client) into docker-backend's sandbox layer. The
 * legacy hand-rolled `DaytonaClient` (daytona-client.ts) stays as the default
 * REST path used across the codebase; this exposes the owned SDK's richer
 * `Daytona`/`Sandbox` API (filesystem, git, process, lsp, ...) for callers that
 * opt into it, so the product runs on owned code rather than an external dep.
 */
import { Daytona, type DaytonaConfig } from '@recoder/sandbox-daytona';
import { createLogger } from './logger';

const logger = createLogger('daytona-sdk');

let _sdk: Daytona | null = null;

/** Build a DaytonaConfig from the same env the legacy client reads. */
export function resolveDaytonaSdkConfig(): DaytonaConfig {
  return {
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL || process.env.DAYTONA_SERVER_URL,
    target: process.env.DAYTONA_TARGET,
    organizationId: process.env.DAYTONA_ORGANIZATION_ID,
  };
}

/** Lazily construct the owned Daytona SDK client (singleton). */
export function getDaytonaSdk(): Daytona {
  if (!_sdk) {
    _sdk = new Daytona(resolveDaytonaSdkConfig());
    logger.info('Initialized owned @recoder/sandbox-daytona SDK client');
  }
  return _sdk;
}

/** Whether the SDK-backed sandbox path is enabled (opt-in during migration). */
export function isDaytonaSdkEnabled(): boolean {
  return process.env.DAYTONA_USE_SDK === 'true';
}

export { Daytona };
export type { DaytonaConfig };
