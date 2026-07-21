/**
 * Catalog-config-provider seam (§2c/§4b):
 *  - `TensorzeroNapiAdapter.setCatalogConfigProvider` reaches the embedded-gateway
 *    boot: `resolveConfigFile` UNIONs the DB-catalog blocks over the env/registry
 *    config and boots on the merged temp file,
 *  - a provider that throws / returns an empty catalog / is unset degrades to the
 *    env-only boot config (byte-identical), never a throw across the seam,
 *  - the engines module's typed `setTensorzeroCatalogProvider` accessor reaches the
 *    concrete adapter and is a truthful no-op when tensorzero isn't a napi adapter
 *    (the generic `EngineClientPort` never learns about catalogs).
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../../shared/app-config.js';
import type { Logger } from '../../../../shared/logger.js';
import type { AuthMiddleware } from '../../../identity/middleware/authenticate.middleware.js';
import type { QueryExecutor } from '../../../persistence/ports/query-executor.port.js';
import type { GovernanceKernelPort } from '../../../governance/ports/kernel.port.js';
import type { NapiLoaderPort, NapiModule } from '../../ports/napi-loader.port.js';
import { generateTzConfig, type GeneratedTzConfig } from '../../../inference/adapters/tz-config-generator.js';
import type { ModelCatalogEntry } from '../../../inference/types.js';
import type { TensorzeroConfigProvider } from '../../ports/tensorzero-config.port.js';
import {
  registryFromEnv,
  buildTensorzeroConfig,
  tensorzeroFunctionName,
  TENSORZERO_DEFAULT_FUNCTION,
  generateTensorzeroConfig,
} from '../../../inference/tensorzero-config.js';
import { createEnginesModule } from '../../index.js';
import { TensorzeroNapiAdapter } from './tensorzero-napi.adapter.js';

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger;

/**
 * The REAL config provider bootstrap injects — the concrete inference
 * `tensorzero-config` module. The adapter's boot-config path (`resolveConfigFile`)
 * calls this injected port (§7 V5); wiring it here reproduces the production boot.
 */
const realTzConfig: TensorzeroConfigProvider = {
  registryFromEnv,
  buildTensorzeroConfig,
  tensorzeroFunctionName,
  TENSORZERO_DEFAULT_FUNCTION,
  generateTensorzeroConfig,
};

interface TzGateway {
  inference(p: string): Promise<string>;
  feedback(p: string): Promise<string>;
}
interface TzModule {
  gatewayVersion(): string;
  validateConfigPath(p: string): Promise<void>;
  EmbeddedGateway?: { boot(config?: string | null, ch?: string | null): Promise<TzGateway> };
}

/** A loader whose `.node` boots a gateway that captures the config file path it booted on. */
function capturingLoader(captured: { config?: string | null }): NapiLoaderPort {
  const module: TzModule = {
    gatewayVersion: () => '2.0.0',
    validateConfigPath: async () => {},
    EmbeddedGateway: {
      boot: async (config) => {
        captured.config = config;
        return { inference: async () => '{}', feedback: async () => '{}' };
      },
    },
  };
  const wrapped: NapiModule<TzModule> = { addon: module, path: '/tmp/tz.node', version: '2.0.0' };
  return { resolvePath: () => '/tmp/tz.node', load: <T>() => wrapped as NapiModule<T>, evict: () => {} };
}

function entry(modelId: string): ModelCatalogEntry {
  return {
    modelId,
    provider: modelId.split('/')[0],
    displayName: modelId,
    contextWindow: 128000,
    inputMicroUsdPerMTok: 0,
    outputMicroUsdPerMTok: 0,
    supportsStreaming: true,
    enabled: true,
    updatedAt: new Date().toISOString(),
  };
}
function overlay(...ids: string[]): GeneratedTzConfig {
  return generateTzConfig(ids.map(entry));
}

describe('TensorzeroNapiAdapter catalog-config-provider merge (§4b)', () => {
  const KEEP = { models: process.env.TENSORZERO_MODELS, openai: process.env.OPENAI_API_KEY };
  beforeEach(() => {
    process.env.TENSORZERO_MODELS = 'openai/gpt-4o-mini';
    process.env.OPENAI_API_KEY = 'sk-test';
  });
  afterEach(() => {
    if (KEEP.models === undefined) delete process.env.TENSORZERO_MODELS;
    else process.env.TENSORZERO_MODELS = KEEP.models;
    if (KEEP.openai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = KEEP.openai;
  });

  it('boots the gateway on registry ∪ DB catalog when a provider is wired', async () => {
    const captured: { config?: string | null } = {};
    const adapter = new TensorzeroNapiAdapter(capturingLoader(captured), log);
    adapter.setTensorzeroConfigProvider(realTzConfig);
    adapter.setCatalogConfigProvider(async () => overlay('anthropic/claude-3-5-haiku'));
    await adapter.start();
    expect(captured.config).toBeTruthy();
    const toml = readFileSync(captured.config!, 'utf8');
    expect(toml).toContain('[models."openai/gpt-4o-mini"]'); // env registry
    expect(toml).toContain('[models."anthropic/claude-3-5-haiku"]'); // DB catalog
  });

  it('degrades to the env-only config when the provider throws', async () => {
    const captured: { config?: string | null } = {};
    const adapter = new TensorzeroNapiAdapter(capturingLoader(captured), log);
    adapter.setTensorzeroConfigProvider(realTzConfig);
    adapter.setCatalogConfigProvider(async () => {
      throw new Error('catalog DB down');
    });
    await adapter.start();
    const toml = readFileSync(captured.config!, 'utf8');
    expect(toml).toContain('[models."openai/gpt-4o-mini"]');
    expect(toml).not.toContain('anthropic');
  });

  it('degrades to the env-only config when the catalog is empty', async () => {
    const captured: { config?: string | null } = {};
    const adapter = new TensorzeroNapiAdapter(capturingLoader(captured), log);
    adapter.setTensorzeroConfigProvider(realTzConfig);
    adapter.setCatalogConfigProvider(async () => overlay()); // no models
    await adapter.start();
    const toml = readFileSync(captured.config!, 'utf8');
    expect(toml).toContain('[models."openai/gpt-4o-mini"]');
    expect(toml).not.toContain('anthropic');
  });

  it('boots the env-only config when NO catalog provider is wired', async () => {
    const captured: { config?: string | null } = {};
    const adapter = new TensorzeroNapiAdapter(capturingLoader(captured), log);
    adapter.setTensorzeroConfigProvider(realTzConfig);
    await adapter.start();
    const toml = readFileSync(captured.config!, 'utf8');
    expect(toml).toContain('[models."openai/gpt-4o-mini"]');
    expect(toml).not.toContain('anthropic');
  });

  it('boots the default (null) config when NO tensorzero config provider is injected', async () => {
    // §7 V5: without the injected config provider the boot-config path degrades to
    // the default (null) config instead of lazy-importing the inference domain.
    const captured: { config?: string | null } = {};
    const adapter = new TensorzeroNapiAdapter(capturingLoader(captured), log);
    await adapter.start();
    expect(captured.config).toBeNull();
  });
});

// --- The typed engines-module accessor (§2c) ------------------------------------

const fakeExecutor: QueryExecutor = {
  execute: async () => [],
  one: async () => null,
  read: async () => [],
  mutate: async () => 0,
  withTransaction: async (fn) => fn(fakeExecutor),
  isAvailable: () => false,
};
const noop = (_req: unknown, _res: unknown, next: () => void) => next();
const fakeMiddleware = {
  authenticate: noop,
  authenticateMutating: noop,
  requireAdmin: noop,
  requireInternal: noop,
  requirePermission: () => noop,
  verifyOrgAccess: () => noop,
} as unknown as AuthMiddleware;
const fakeKernel = {
  decide: async () => ({ effect: 'allow', tier: 'low', reason: 'ok', degraded: false, engine: 'synthetic' }),
  enforceTool: async () => ({ outcome: 'allowed', reason: 'ok', degraded: false, engine: 'synthetic' }),
  route: async () => ({ routable: true, tier: 'low', reason: 'ok' }),
  auditTip: async () => 'a'.repeat(64),
  verifyAudit: async () => ({ ok: true, entries: 0 }),
  status: () => ({ engine: 'synthetic', available: false }),
} as unknown as GovernanceKernelPort;
const fakeConfig = {
  runtime: { isProduction: false },
  internal: { serviceKeyPresent: false, serviceKey: null },
} as unknown as AppConfig;

async function buildEngines() {
  return createEnginesModule({
    config: fakeConfig,
    logger: log,
    executor: fakeExecutor,
    middleware: fakeMiddleware,
    kernel: fakeKernel,
  });
}

describe('engines.setTensorzeroCatalogProvider (typed tz-scoped accessor)', () => {
  it('reaches the concrete TensorzeroNapiAdapter', async () => {
    const engines = await buildEngines();
    const adapter = engines.tensorzero();
    expect(adapter).toBeInstanceOf(TensorzeroNapiAdapter);
    const spy = vi.spyOn(adapter as TensorzeroNapiAdapter, 'setCatalogConfigProvider');
    const provider = async () => overlay('openai/gpt-4o-mini');
    engines.setTensorzeroCatalogProvider(provider);
    expect(spy).toHaveBeenCalledWith(provider);
  });

  it('is a truthful no-op (never throws) when tensorzero is not a bound napi adapter', async () => {
    const engines = await buildEngines();
    // Simulate a build where tensorzero isn't bound as a napi adapter.
    (engines as unknown as { adapters: Map<string, unknown> }).adapters.delete('tensorzero');
    expect(() => engines.setTensorzeroCatalogProvider(async () => overlay())).not.toThrow();
  });

  it('does not add the tz-specific seam to the generic engine-client port', async () => {
    const engines = await buildEngines();
    const generic = engines.client('beads'); // a non-tensorzero engine client
    expect(generic).not.toBeNull();
    expect((generic as unknown as { setCatalogConfigProvider?: unknown }).setCatalogConfigProvider).toBeUndefined();
  });
});

describe('engines.setTensorzeroConfigProvider (typed tz-scoped accessor, §7 V5)', () => {
  it('reaches the concrete TensorzeroNapiAdapter', async () => {
    const engines = await buildEngines();
    const adapter = engines.tensorzero();
    expect(adapter).toBeInstanceOf(TensorzeroNapiAdapter);
    const spy = vi.spyOn(adapter as TensorzeroNapiAdapter, 'setTensorzeroConfigProvider');
    engines.setTensorzeroConfigProvider(realTzConfig);
    expect(spy).toHaveBeenCalledWith(realTzConfig);
  });

  it('is a truthful no-op (never throws) when tensorzero is not a bound napi adapter', async () => {
    const engines = await buildEngines();
    (engines as unknown as { adapters: Map<string, unknown> }).adapters.delete('tensorzero');
    expect(() => engines.setTensorzeroConfigProvider(realTzConfig)).not.toThrow();
  });
});
