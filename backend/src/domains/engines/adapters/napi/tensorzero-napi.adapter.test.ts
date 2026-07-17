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
import { describe, it, expect, vi } from 'vitest';
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
