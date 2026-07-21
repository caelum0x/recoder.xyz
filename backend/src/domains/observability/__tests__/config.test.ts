/**
 * `sliceObservabilityConfig` unit — covers the NEW `signalsSyncEnabled` override
 * (the detector-tick gate that rides the signals poll loop). Absent ⇒ `false`
 * (opt-in, off by default); present ⇒ passed through and zod-valid.
 */
import { describe, it, expect } from 'vitest';
import type { AppConfig } from '../../../shared/app-config.js';
import { sliceObservabilityConfig } from '../config.js';

const app = {
  runtime: { isProduction: false },
  internal: { serviceKey: 'internal-test-key' },
} as unknown as AppConfig;

describe('sliceObservabilityConfig — signalsSyncEnabled', () => {
  it('defaults to false when the override is absent (opt-in)', () => {
    const cfg = sliceObservabilityConfig(app, {});
    expect(cfg.signalsSyncEnabled).toBe(false);
  });

  it('passes a true override through (zod-valid)', () => {
    const cfg = sliceObservabilityConfig(app, { signalsSyncEnabled: true });
    expect(cfg.signalsSyncEnabled).toBe(true);
  });

  it('passes an explicit false override through', () => {
    const cfg = sliceObservabilityConfig(app, { signalsSyncEnabled: false });
    expect(cfg.signalsSyncEnabled).toBe(false);
  });
});
