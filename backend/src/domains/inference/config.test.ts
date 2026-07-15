/**
 * `sliceInferenceConfig` — verifies degrade-safe defaults, endpoint normalization
 * (trailing slash trimmed), and the key presence-gate (the value stays in-memory,
 * `gatewayApiKeyPresent` is the surfaced signal).
 */
import { describe, it, expect } from 'vitest';
import { sliceInferenceConfig, DEFAULT_COMPLETE_PATH } from './config.js';
import type { AppConfig } from '../../shared/app-config.js';

function appConfig(over: { isProduction?: boolean; serviceKeyPresent?: boolean; serviceKey?: string | null } = {}): AppConfig {
  return {
    runtime: { isProduction: over.isProduction ?? false },
    internal: { serviceKeyPresent: over.serviceKeyPresent ?? false, serviceKey: over.serviceKey ?? null },
  } as unknown as AppConfig;
}

describe('sliceInferenceConfig', () => {
  it('applies degrade-safe defaults when no overrides given', () => {
    const cfg = sliceInferenceConfig(appConfig());
    expect(cfg.gatewayEndpoint).toBeNull();
    expect(cfg.gatewayApiKeyPresent).toBe(false);
    expect(cfg.gatewayApiKey).toBeNull();
    expect(cfg.completePath).toBe(DEFAULT_COMPLETE_PATH);
    expect(cfg.napiFirst).toBe(true);
    expect(cfg.streamingEnabled).toBe(true);
    expect(cfg.defaultModel).toBe('openai/gpt-4o-mini');
  });

  it('normalizes the endpoint (trims trailing slash) + gates the key presence', () => {
    const cfg = sliceInferenceConfig(appConfig(), {
      gatewayEndpoint: 'http://127.0.0.1:3778/',
      gatewayApiKey: '  secret-key  ',
    });
    expect(cfg.gatewayEndpoint).toBe('http://127.0.0.1:3778');
    expect(cfg.gatewayApiKeyPresent).toBe(true);
    expect(cfg.gatewayApiKey).toBe('secret-key');
  });

  it('carries the internal-service key presence from AppConfig', () => {
    const cfg = sliceInferenceConfig(appConfig({ serviceKeyPresent: true, serviceKey: 'k' }));
    expect(cfg.internalServiceKeyPresent).toBe(true);
    expect(cfg.internalServiceKey).toBe('k');
  });
});
