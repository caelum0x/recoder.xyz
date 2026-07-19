/**
 * `TensorzeroNapiAdapter` degrade-safe contract:
 *  - absent `.node` → `health` down, `inference`/`feedback` `{ok:false}` (no throw),
 *  - a present stub addon with `EmbeddedGateway` → inference/feedback route + parse JSON,
 *  - `inferenceStream` forwards `{chunk}` events to the live `onChunk` sink,
 *    waits for the `{done}` FIFO flush barrier (chunks never race the resolved
 *    invoke), and declines truthfully on a buffered-only build / native reject,
 *  - a build WITHOUT the `EmbeddedGateway` binding is `degraded` (version/config only),
 *  - `configValidate` returns a truthful `{valid:false, reason}` on an invalid config,
 *  - an unknown op is a truthful failure.
 *
 * `configFile: null` is passed so the adapter never imports the env-reading config
 * generator during the test (keeps the boot pure + deterministic).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Logger } from '../../../../shared/logger.js';
import type { NapiLoaderPort, NapiModule } from '../../ports/napi-loader.port.js';
import { TensorzeroNapiAdapter } from './tensorzero-napi.adapter.js';

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger;

interface TzGateway {
  inference(p: string): Promise<string>;
  inferenceStream?(p: string, onEvent: (err: unknown, eventJson: string) => void): Promise<string>;
  feedback(p: string): Promise<string>;
}

interface TzModule {
  gatewayVersion(): string;
  validateConfigPath(configPath: string): Promise<void>;
  EmbeddedGateway?: { boot(config?: string | null, ch?: string | null): Promise<TzGateway> };
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

function withEmbedded(gatewayOver: Partial<TzGateway> = {}): TzModule {
  return {
    gatewayVersion: () => '2.0.0',
    validateConfigPath: async () => {},
    EmbeddedGateway: {
      boot: async () => ({
        inference: async () => JSON.stringify({ inference_id: 'inf_1', content: 'ok' }),
        feedback: async () => JSON.stringify({ feedback_id: 'fb_1' }),
        ...gatewayOver,
      }),
    },
  };
}

/** A native-like `inferenceStream`: emits `{chunk}` events then `{done}` on the same FIFO callback. */
function streamingGateway(chunks: unknown[], summary: unknown): Partial<TzGateway> {
  return {
    inferenceStream: async (_p, onEvent) => {
      for (const chunk of chunks) onEvent(null, JSON.stringify({ chunk }));
      onEvent(null, JSON.stringify({ done: summary }));
      return JSON.stringify(summary);
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

  it('streams inference chunks to the onChunk sink and resolves the aggregated summary', async () => {
    const summary = { inference_id: 'inf_s', content: 'hello', usage: { input_tokens: 4, output_tokens: 2 }, chunks: 2 };
    const module = withEmbedded(
      streamingGateway(
        [
          { inference_id: 'inf_s', content: [{ type: 'text', id: '0', text: 'hel' }] },
          { inference_id: 'inf_s', content: [{ type: 'text', id: '0', text: 'lo' }] },
        ],
        summary,
      ),
    );
    const adapter = new TensorzeroNapiAdapter(fakeLoader(module, '/tmp/tz.node'), log, { configFile: null });
    const seen: unknown[] = [];
    const result = await adapter.invoke({
      op: 'inferenceStream',
      input: { function_name: 'recoder_default', input: { messages: [] }, onChunk: (chunk: unknown) => seen.push(chunk) },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ inference_id: 'inf_s', content: 'hello', chunks: 2 });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ content: [{ type: 'text', text: 'hel' }] });
  });

  it('waits for the {done} flush barrier: chunks queued AFTER the native promise resolves are still delivered', async () => {
    // Simulate the real cross-queue race: the native promise resolves first;
    // the ThreadsafeFunction events land on a later tick (FIFO, done last).
    const summary = { inference_id: 'inf_r', content: 'late', chunks: 1 };
    const module = withEmbedded({
      inferenceStream: async (_p, onEvent) => {
        setTimeout(() => {
          onEvent(null, JSON.stringify({ chunk: { content: [{ type: 'text', id: '0', text: 'late' }] } }));
          onEvent(null, JSON.stringify({ done: summary }));
        }, 0);
        return JSON.stringify(summary);
      },
    });
    const adapter = new TensorzeroNapiAdapter(fakeLoader(module, '/tmp/tz.node'), log, { configFile: null });
    const seen: unknown[] = [];
    const result = await adapter.invoke({
      op: 'inferenceStream',
      input: { function_name: 'f', input: {}, onChunk: (chunk: unknown) => seen.push(chunk) },
    });
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1); // delivered BEFORE invoke resolved, not dropped
  });

  it('fails truthfully when the build lacks the inferenceStream binding (buffered-only addon)', async () => {
    const adapter = new TensorzeroNapiAdapter(fakeLoader(withEmbedded(), '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({ op: 'inferenceStream', input: { function_name: 'f', input: {} } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ENGINE_DOWN');
      expect(result.reason).toMatch(/inferenceStream/);
    }
  });

  it('never throws across the seam when the native stream rejects mid-flight', async () => {
    const module = withEmbedded({
      inferenceStream: async (_p, onEvent) => {
        onEvent(null, JSON.stringify({ chunk: { content: [{ type: 'text', id: '0', text: 'par' }] } }));
        throw new Error('provider disconnected');
      },
    });
    const adapter = new TensorzeroNapiAdapter(fakeLoader(module, '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({ op: 'inferenceStream', input: { function_name: 'f', input: {}, onChunk: () => {} } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ENGINE_THREW');
      expect(result.reason).toMatch(/provider disconnected/);
    }
  });

  it('a throwing onChunk sink never poisons the stream (still resolves the summary)', async () => {
    const summary = { inference_id: 'inf_p', content: 'ok', chunks: 1 };
    const module = withEmbedded(streamingGateway([{ content: [{ type: 'text', id: '0', text: 'ok' }] }], summary));
    const adapter = new TensorzeroNapiAdapter(fakeLoader(module, '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({
      op: 'inferenceStream',
      input: { function_name: 'f', input: {}, onChunk: () => { throw new Error('sink boom'); } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ content: 'ok' });
  });

  it('fails truthfully on an unknown op', async () => {
    const adapter = new TensorzeroNapiAdapter(fakeLoader(withEmbedded(), '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({ op: 'notAnOp', input: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNKNOWN_OP');
  });
});

describe('TensorzeroNapiAdapter deep inference port (catalog + batch)', () => {
  const OLD_MODELS = process.env.TENSORZERO_MODELS;
  const OLD_KEY = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (OLD_MODELS === undefined) delete process.env.TENSORZERO_MODELS;
    else process.env.TENSORZERO_MODELS = OLD_MODELS;
    if (OLD_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = OLD_KEY;
  });

  it('modelCatalog introspects the Recoder registry from env (truthful even with .node absent)', async () => {
    process.env.TENSORZERO_MODELS = 'openai/gpt-4o-mini';
    process.env.OPENAI_API_KEY = 'sk-test';
    // .node absent → gatewayVersion is null, but the catalog is still resolved.
    const adapter = new TensorzeroNapiAdapter(fakeLoader(null, null), log, { configFile: null });
    const result = await adapter.invoke({ op: 'modelCatalog', input: {} });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const catalog = result.value as {
        gatewayVersion: string | null;
        models: { id: string; functionName: string }[];
        functions: string[];
        defaultFunction: string | null;
      };
      expect(catalog.gatewayVersion).toBeNull();
      expect(catalog.models).toHaveLength(1);
      expect(catalog.models[0]).toMatchObject({ id: 'openai/gpt-4o-mini' });
      expect(catalog.defaultFunction).toBe('recoder_default');
      expect(catalog.functions).toContain('recoder_default');
    }
  });

  it('modelCatalog reports the gateway version when the .node is present', async () => {
    process.env.TENSORZERO_MODELS = '';
    const adapter = new TensorzeroNapiAdapter(fakeLoader(withEmbedded(), '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({ op: 'modelCatalog', input: {} });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const catalog = result.value as { gatewayVersion: string | null; models: unknown[]; defaultFunction: string | null };
      expect(catalog.gatewayVersion).toBe('2.0.0');
      expect(catalog.models).toHaveLength(0);
      expect(catalog.defaultFunction).toBeNull();
    }
  });

  it('batchInference runs every request over the single-inference napi and aggregates outcomes', async () => {
    let seen = 0;
    const module = withEmbedded({
      inference: async (p: string) => {
        seen++;
        return JSON.stringify({ inference_id: `inf_${seen}`, echo: JSON.parse(p) });
      },
    });
    const adapter = new TensorzeroNapiAdapter(fakeLoader(module, '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({
      op: 'batchInference',
      input: { requests: [{ function_name: 'f', input: {} }, { function_name: 'g', input: {} }], concurrency: 2 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const batch = result.value as { total: number; succeeded: number; failed: number; results: { index: number; ok: boolean }[] };
      expect(batch).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
      expect(batch.results.map((r) => r.index)).toEqual([0, 1]);
    }
    expect(seen).toBe(2);
  });

  it('batchInference reports a per-item failure without failing the whole batch', async () => {
    const module = withEmbedded({
      inference: async (p: string) => {
        const body = JSON.parse(p) as { function_name?: string };
        if (body.function_name === 'boom') throw new Error('provider rejected');
        return JSON.stringify({ inference_id: 'ok' });
      },
    });
    const adapter = new TensorzeroNapiAdapter(fakeLoader(module, '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({
      op: 'batchInference',
      input: { requests: [{ function_name: 'ok' }, { function_name: 'boom' }], concurrency: 1 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const batch = result.value as { succeeded: number; failed: number; results: { ok: boolean; error?: string }[] };
      expect(batch).toMatchObject({ succeeded: 1, failed: 1 });
      expect(batch.results[1]).toMatchObject({ ok: false });
      expect(batch.results[1].error).toMatch(/provider rejected/);
    }
  });

  it('batchInference stopOnError skips not-yet-scheduled requests truthfully', async () => {
    const module = withEmbedded({
      inference: async (p: string) => {
        const body = JSON.parse(p) as { function_name?: string };
        if (body.function_name === 'boom') throw new Error('provider rejected');
        return JSON.stringify({ inference_id: 'ok' });
      },
    });
    const adapter = new TensorzeroNapiAdapter(fakeLoader(module, '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({
      op: 'batchInference',
      // concurrency 1 so ordering is deterministic: boom fails, the rest are skipped.
      input: { requests: [{ function_name: 'boom' }, { function_name: 'ok' }, { function_name: 'ok' }], concurrency: 1, stopOnError: true },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const batch = result.value as { failed: number; skipped: number };
      expect(batch).toMatchObject({ failed: 1, skipped: 2 });
    }
  });

  it('batchInference fails truthfully (ENGINE_DOWN) when the gateway is absent', async () => {
    const adapter = new TensorzeroNapiAdapter(fakeLoader(null, null), log, { configFile: null });
    const result = await adapter.invoke({ op: 'batchInference', input: { requests: [{ function_name: 'f' }] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ENGINE_DOWN');
  });

  it('batchInference rejects an empty requests array (BAD_INPUT)', async () => {
    const adapter = new TensorzeroNapiAdapter(fakeLoader(withEmbedded(), '/tmp/tz.node'), log, { configFile: null });
    const result = await adapter.invoke({ op: 'batchInference', input: { requests: [] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BAD_INPUT');
  });
});
