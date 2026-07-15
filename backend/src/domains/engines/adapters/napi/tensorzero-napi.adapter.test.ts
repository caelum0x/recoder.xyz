/**
 * `TensorzeroNapiAdapter` degrade-safe contract:
 *  - absent `.node` → `health` down, `inference`/`feedback` `{ok:false}` (no throw),
 *  - a present stub addon with `EmbeddedGateway` → inference/feedback route + parse JSON,
 *  - a build WITHOUT the `EmbeddedGateway` binding is `degraded` (version/config only),
 *  - `configValidate` returns a truthful `{valid:false, reason}` on an invalid config,
 *  - an unknown op is a truthful failure.
 *
 * `configFile: null` is passed so the adapter never imports the env-reading config
 * generator during the test (keeps the boot pure + deterministic).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../../shared/logger.js';
import type { NapiLoaderPort, NapiModule } from '../../ports/napi-loader.port.js';
import { TensorzeroNapiAdapter } from './tensorzero-napi.adapter.js';

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger;

interface TzModule {
  gatewayVersion(): string;
  validateConfigPath(configPath: string): Promise<void>;
  EmbeddedGateway?: { boot(config?: string | null, ch?: string | null): Promise<{ inference(p: string): Promise<string>; feedback(p: string): Promise<string> }> };
}

function fakeLoader(module: TzModule | null, path: string | null): NapiLoaderPort {
  const wrapped: NapiModule<TzModule> | null = module
    ? { addon: module, path: path ?? '/tmp/tz.node', version: '2.0.0' }
    : null;
  return {
    resolvePath: () => path,
    load: <T>() => wrapped as NapiModule<T> | null,
    evict: () => {},
  };
}

function withEmbedded(): TzModule {
  return {
    gatewayVersion: () => '2.0.0',
    validateConfigPath: async () => {},
    EmbeddedGateway: {
      boot: async () => ({
        inference: async () => JSON.stringify({ inference_id: 'inf_1', content: 'ok' }),
        feedback: async () => JSON.stringify({ feedback_id: 'fb_1' }),
      }),
    },
  };
}

describe('TensorzeroNapiAdapter (degrade-safe)', () => {
  it('reports down + fails inference when the .node is absent', async () => {
    const adapter = new TensorzeroNapiAdapter(fakeLoader(null, null), log, { configFile: null });
    const health = await adapter.health();
    expect(health.status).toBe('down');

    const result = await adapter.invoke({ op: 'inference', input: { function_name: 'f', input: {} } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ENGINE_DOWN');
  });

  it('routes inference + feedback through the embedded gateway and reports up', async () => {
    const adapter = new TensorzeroNapiAdapter(fakeLoader(withEmbedded(), '/tmp/tz.node'), log, { configFile: null });
    const health = await adapter.health();
    expect(health.status).toBe('up');
    expect(health.version).toBe('2.0.0');

    const inf = await adapter.invoke({ op: 'inference', input: { function_name: 'recoder_default', input: { messages: [] } } });
    expect(inf.ok).toBe(true);
    if (inf.ok) expect(inf.value).toMatchObject({ inference_id: 'inf_1' });

    const fb = await adapter.invoke({ op: 'feedback', input: { inference_id: 'inf_1', metric_name: 'thumbs', value: true } });
    expect(fb.ok).toBe(true);
  });

  it('is degraded (version + config only) when the build lacks the EmbeddedGateway binding', async () => {
    const noEmbedded: TzModule = { gatewayVersion: () => '2.0.0', validateConfigPath: async () => {} };
    const adapter = new TensorzeroNapiAdapter(fakeLoader(noEmbedded, '/tmp/tz.node'), log, { configFile: null });
    const health = await adapter.health();
    expect(health.status).toBe('degraded');
    expect(health.reason).toMatch(/EmbeddedGateway/);

    const version = await adapter.invoke({ op: 'version', input: {} });
    expect(version.ok).toBe(true);
    if (version.ok) expect(version.value).toMatchObject({ version: '2.0.0' });

    const inf = await adapter.invoke({ op: 'inference', input: {} });
    expect(inf.ok).toBe(false);
  });

  it('configValidate returns a truthful {valid:false, reason} on an invalid config', async () => {
    const badConfig: TzModule = {
      gatewayVersion: () => '2.0.0',
      validateConfigPath: async () => { throw new Error('missing [models] table'); },
    };
    const adapter = new TensorzeroNapiAdapter(fakeLoader(badConfig, '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({ op: 'configValidate', input: { configPath: '/tmp/bad.toml' } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ valid: false });
  });

  it('fails truthfully on an unknown op', async () => {
    const adapter = new TensorzeroNapiAdapter(fakeLoader(withEmbedded(), '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({ op: 'notAnOp', input: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNKNOWN_OP');
  });
});
