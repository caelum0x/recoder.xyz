/**
 * `TensorzeroNapiAdapter` — the in-process adapter over the tensorzero embedded
 * gateway (`tensorzero-gateway-napi.node`), expressed through the frozen
 * `EngineClientPort`.
 *
 * TensorZero is an OpenAI-compatible LLM gateway with built-in observability,
 * routing, fallbacks and feedback collection. The embedded-gateway binding runs
 * the FULL engine in-process (no HTTP hop, no subprocess). This adapter binds the
 * `.node` through the injected `NapiLoaderPort`, boots the `EmbeddedGateway`
 * once, and exposes its real surface as `invoke(op,input)`:
 *   - `inference`       → POST /inference equivalent (routing + logging)
 *   - `inferenceStream` → POST /inference with `stream:true` — real per-chunk
 *                         deltas via an `onChunk` callback in the input (the
 *                         native side pushes `{chunk}` events through a
 *                         ThreadsafeFunction and terminates with `{done}` on
 *                         the SAME FIFO queue, so every chunk is delivered
 *                         before the invoke resolves)
 *   - `feedback`        → POST /feedback equivalent (metric/comment collection)
 *   - `configValidate`  → in-process TZ config validation
 *   - `version`         → the Rust crate version
 *
 * REUSE: the config generation (`generateTensorzeroConfig`) is the existing
 * `src/engines/tensorzero-config.ts` (env → registry → TOML → temp path); this
 * adapter re-homes the embedded-gateway boot behind the engines seam so the
 * inference domain consumes TensorZero via the typed `EngineClientPort`.
 *
 * DEGRADE-SAFE LAW: an absent `.node` / a build without the `EmbeddedGateway`
 * binding / a failed boot is a truthful `down`/`degraded` health and an
 * `{ ok:false, reason }` invoke — the inference domain then falls back to a
 * direct provider call. Never a thrown error across the seam, never a faked route.
 */
import type { Logger } from '../../../../shared/logger.js';
import { EngineClientBase, type EngineCall } from '../../ports/engine-client.port.js';
import type { NapiLoaderPort, NapiLoadSpec, NapiModule } from '../../ports/napi-loader.port.js';
import { type EngineHealth, type InvokeResult, down, fail, ok, up } from '../../types.js';
import { msg, parseJson, str, type NapiArgs } from './napi-util.js';

/** The embedded gateway (the full TZ engine, in-process — no HTTP server). */
interface TzEmbeddedGatewayInstance {
  /** POST /inference equivalent; params/result are JSON strings. Async (never blocks the loop). */
  inference(paramsJson: string): Promise<string>;
  /**
   * POST /inference with `stream:true`. Present only in builds that include the
   * streaming binding. `onEvent` receives `(err, eventJson)` per the napi
   * callee-handled ThreadsafeFunction convention; events are `{"chunk":...}`
   * per chunk then one `{"done":<summary>}`. Resolves the summary JSON.
   */
  inferenceStream?(paramsJson: string, onEvent: (err: unknown, eventJson: string) => void): Promise<string>;
  /** POST /feedback equivalent; params/result are JSON strings. */
  feedback(paramsJson: string): Promise<string>;
}

interface TzEmbeddedGatewayClass {
  boot(configFile?: string | null, clickhouseUrl?: string | null): Promise<TzEmbeddedGatewayInstance>;
}

/** The `tensorzero-gateway-napi` addon surface (mirrors the `#[napi]` exports). */
interface TzGatewayNapiModule {
  /** The Rust crate's `CARGO_PKG_VERSION`. */
  gatewayVersion(): string;
  /** Validate a TZ config path in-process; throws on invalid config. */
  validateConfigPath(configPath: string): Promise<void>;
  /** Present only in builds that include the embedded-gateway binding. */
  EmbeddedGateway?: TzEmbeddedGatewayClass;
}

/** The napi load spec for the tensorzero gateway addon (resolved via the injected loader). */
const TENSORZERO_SPEC: NapiLoadSpec<TzGatewayNapiModule> = {
  engineId: 'tensorzero',
  env: 'TENSORZERO_GATEWAY_NAPI_NODE',
  fileName: 'tensorzero_gateway_napi.node',
  // The gateway crate lives under `backend/engines/rust/tensorzero/crates`; its
  // workspace target dir is `.../tensorzero/crates/target` (verified on-disk).
  crateDir: 'tensorzero/crates',
  cratePackage: 'tensorzero-gateway-napi',
  validate: (mod) => typeof mod.gatewayVersion === 'function',
  probeVersion: (mod) => {
    try {
      return mod.gatewayVersion();
    } catch {
      return undefined;
    }
  },
};

const NOT_BUILT =
  'tensorzero gateway napi addon (.node) not built — build backend/engines/rust/tensorzero/crates -p tensorzero-gateway-napi';
const GATEWAY_DOWN =
  'tensorzero embedded gateway unavailable — addon absent, lacks EmbeddedGateway binding, or boot failed';
const NO_STREAM_BINDING =
  'tensorzero gateway napi addon lacks the inferenceStream binding — rebuild backend/engines/rust/tensorzero/crates -p tensorzero-gateway-napi';

// ---------------------------------------------------------------------------
// Inference-capability port — the DEEP surface the MCP binder consumes
// ---------------------------------------------------------------------------

/** One routable model in the generated catalog (env registry → gateway config). */
export interface TensorzeroCatalogModel {
  /** Recoder model id (`<provider>/<model>`). */
  readonly id: string;
  /** Recoder provider name (mirrors llm-router). */
  readonly provider: string;
  /** Provider-native model id. */
  readonly modelName: string;
  /** The TensorZero function name that routes to this model (`<provider>_<model>`). */
  readonly functionName: string;
  /** Env var NAME holding the key (never a value); `null` for keyless providers. */
  readonly keyEnv: string | null;
  /** OpenAI-compatible base URL override, when set. */
  readonly baseUrl?: string;
}

/** The introspected model/function catalog the embedded gateway would route. */
export interface TensorzeroModelCatalog {
  /** The Rust crate version, or `null` when the `.node` is absent. */
  readonly gatewayVersion: string | null;
  /** The routable models resolved from the Recoder registry (env). */
  readonly models: readonly TensorzeroCatalogModel[];
  /** Every TensorZero function name the config defines (includes the default alias). */
  readonly functions: readonly string[];
  /** The stable default function name, or `null` when no models are configured. */
  readonly defaultFunction: string | null;
  /** Registry entries excluded from the catalog, each with a truthful reason. */
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

/** One request in a batch — the same JSON body as `POST /inference`. */
export type TensorzeroInferenceRequest = Record<string, unknown>;

/** Options controlling a batch inference run. */
export interface TensorzeroBatchInput {
  /** The inference requests to run (each a `POST /inference`-shaped body). */
  readonly requests: readonly TensorzeroInferenceRequest[];
  /** Max in-flight inferences (clamped 1..16; default 4). */
  readonly concurrency?: number;
  /** Stop scheduling new requests after the first failure (already in-flight finish). */
  readonly stopOnError?: boolean;
}

/** The per-request outcome inside a batch (index-aligned to the input). */
export interface TensorzeroBatchItem {
  readonly index: number;
  readonly ok: boolean;
  /** The parsed inference response (present when `ok`). */
  readonly value?: unknown;
  /** The truthful failure reason (present when `!ok`). */
  readonly error?: string;
  /** `true` when the request was skipped by `stopOnError` after an earlier failure. */
  readonly skipped?: boolean;
}

/** The aggregated batch result — the batch op itself succeeds; item failures are reported. */
export interface TensorzeroBatchResult {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly skipped: number;
  readonly concurrency: number;
  readonly results: readonly TensorzeroBatchItem[];
}

/**
 * The DEEP inference capability surface the `recoder.tensorzero` MCP binder
 * consumes (mirrors `BrowserUseAdapter.ext()`). Every method is degrade-safe:
 * an absent `.node` / unbooted gateway is a truthful `{ ok:false, ENGINE_DOWN }`,
 * never a throw across the seam. `modelCatalog` needs no gateway boot at all —
 * it introspects the Recoder registry (env → config) so it stays truthful even
 * when the native addon is absent.
 */
export interface TensorzeroInferencePort {
  /** Introspect the model/function catalog the embedded gateway would route. */
  modelCatalog(): Promise<InvokeResult<TensorzeroModelCatalog>>;
  /** Run many inferences with bounded concurrency, aggregating per-item outcomes. */
  batchInference(input: TensorzeroBatchInput): Promise<InvokeResult<TensorzeroBatchResult>>;
}

const DEFAULT_BATCH_CONCURRENCY = 4;
const MAX_BATCH_CONCURRENCY = 16;
const MAX_BATCH_REQUESTS = 128;

export interface TensorzeroNapiOptions {
  /** When `false`, the engine is never bound and reports `down` with reason "disabled". */
  readonly enabled?: boolean;
  /**
   * Explicit TZ config file path for `EmbeddedGateway.boot`. `undefined` → the
   * adapter generates one from the reused model registry (unless `generateConfig`
   * is `false`); `null` → boot TensorZero's default empty config.
   */
  readonly configFile?: string | null;
  /** Optional ClickHouse URL for observability sink (`null` → in-memory only). */
  readonly clickhouseUrl?: string | null;
  /** Generate a config from the Recoder model registry when no `configFile`. Default `true`. */
  readonly generateConfig?: boolean;
}

export class TensorzeroNapiAdapter extends EngineClientBase<NapiArgs, unknown> {
  private module: NapiModule<TzGatewayNapiModule> | null = null;
  private gateway: TzEmbeddedGatewayInstance | undefined;
  private bootPromise: Promise<TzEmbeddedGatewayInstance | undefined> | undefined;
  private bootFailed = false;
  private started = false;

  constructor(
    private readonly loader: NapiLoaderPort,
    private readonly log: Logger,
    private readonly options: TensorzeroNapiOptions = {},
  ) {
    super('tensorzero', 'napi');
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.options.enabled === false) return;
    // Boot eagerly so the first inference doesn't pay the config+boot cost; the
    // boot is degrade-safe (an absent addon just resolves to undefined).
    await this.ensureGateway();
  }

  async stop(): Promise<void> {
    this.gateway = undefined;
    this.bootPromise = undefined;
    this.bootFailed = false;
    this.module = null;
    this.started = false;
  }

  async invoke(call: EngineCall<NapiArgs>): Promise<InvokeResult<unknown>> {
    if (this.options.enabled === false) return fail('tensorzero engine disabled by config', 'DISABLED');
    const op = call.op;
    const input = (call.input ?? {}) as NapiArgs;

    if (op === 'version') {
      const mod = this.ensureModule();
      if (!mod) return fail(NOT_BUILT, 'ENGINE_DOWN');
      try {
        return ok({ version: mod.gatewayVersion() });
      } catch (err) {
        return fail(`tensorzero version threw: ${msg(err)}`, 'ENGINE_THREW');
      }
    }

    if (op === 'configValidate') {
      const mod = this.ensureModule();
      if (!mod) return fail(NOT_BUILT, 'ENGINE_DOWN');
      const configPath = str(input, 'configPath');
      if (!configPath) return fail('configValidate requires configPath', 'BAD_INPUT');
      try {
        await mod.validateConfigPath(configPath);
        return ok({ valid: true, configPath });
      } catch (err) {
        // An invalid config is a legitimate answer (not a seam failure): the
        // native call throws with the validation reason — surface it truthfully.
        return ok({ valid: false, configPath, reason: msg(err) });
      }
    }

    if (op === 'modelCatalog') {
      return this.runModelCatalog();
    }

    if (op === 'batchInference') {
      const requests = Array.isArray(input.requests) ? (input.requests as TensorzeroInferenceRequest[]) : undefined;
      if (!requests) return fail('batchInference requires a non-empty requests array', 'BAD_INPUT');
      return this.runBatchInference({
        requests,
        ...(typeof input.concurrency === 'number' ? { concurrency: input.concurrency } : {}),
        ...(input.stopOnError === true ? { stopOnError: true } : {}),
      });
    }

    if (op === 'inferenceStream') {
      const gateway = await this.ensureGateway();
      if (!gateway) return fail(GATEWAY_DOWN, 'ENGINE_DOWN');
      if (typeof gateway.inferenceStream !== 'function') return fail(NO_STREAM_BINDING, 'ENGINE_DOWN');
      // `onChunk` is a live callback riding in the input — extracted (never
      // serialized) so the remaining fields are the POST /inference body.
      const { onChunk, ...params } = input;
      const sink = typeof onChunk === 'function' ? (onChunk as (chunk: unknown) => void) : undefined;
      return this.invokeInferenceStream(gateway, params, sink);
    }

    if (op === 'inference' || op === 'feedback') {
      const gateway = await this.ensureGateway();
      if (!gateway) return fail(GATEWAY_DOWN, 'ENGINE_DOWN');
      try {
        const raw =
          op === 'inference'
            ? await gateway.inference(JSON.stringify(input))
            : await gateway.feedback(JSON.stringify(input));
        return ok(parseJson(raw));
      } catch (err) {
        return fail(`tensorzero ${op} threw: ${msg(err)}`, 'ENGINE_THREW');
      }
    }

    return fail(`unknown tensorzero op "${op}"`, 'UNKNOWN_OP');
  }

  async health(): Promise<EngineHealth> {
    if (this.options.enabled === false) {
      return down('tensorzero', 'napi', 'disabled by config');
    }
    // `resolvePath` reads only the path fields, never the generic validators, so
    // widening to the base spec is safe.
    const bindingPath = this.loader.resolvePath(TENSORZERO_SPEC as NapiLoadSpec);
    if (!bindingPath) return down('tensorzero', 'napi', NOT_BUILT);
    const mod = this.ensureModule();
    if (!mod) return down('tensorzero', 'napi', 'gateway napi addon failed to load', { bindingPath });
    const version = this.module?.version;
    // Builds without the embedded-gateway binding still expose version +
    // config-validate — that is `degraded`, not `up` (no inference in-process).
    if (typeof mod.EmbeddedGateway?.boot !== 'function') {
      return this.degraded(
        'addon loaded but lacks the EmbeddedGateway binding (version + config-validate only)',
        bindingPath,
        version,
      );
    }
    if (this.bootFailed) {
      return this.degraded('embedded gateway boot failed (bad config?)', bindingPath, version);
    }
    return up('tensorzero', 'napi', { bindingPath, ...(version ? { version } : {}) });
  }

  /**
   * The DEEP inference-capability port the `recoder.tensorzero` MCP binder holds
   * (mirrors `BrowserUseAdapter.ext()`). Bound over THIS adapter so it shares the
   * one embedded-gateway boot; every method is degrade-safe.
   */
  inference(): TensorzeroInferencePort {
    return {
      modelCatalog: () => this.runModelCatalog(),
      batchInference: (batchInput) => this.runBatchInference(batchInput),
    };
  }

  // --- internals ---

  /**
   * Introspect the model/function catalog from the Recoder registry (env →
   * config). Needs no gateway boot — this is exactly the registry the embedded
   * gateway boots from, so it is truthful even when the `.node` is absent (the
   * gateway version is then reported as `null`). Never throws across the seam.
   */
  private async runModelCatalog(): Promise<InvokeResult<TensorzeroModelCatalog>> {
    if (this.options.enabled === false) return fail('tensorzero engine disabled by config', 'DISABLED');
    try {
      const { registryFromEnv, buildTensorzeroConfig, tensorzeroFunctionName, TENSORZERO_DEFAULT_FUNCTION } =
        await import('../../../inference/tensorzero-config.js');
      const registry = registryFromEnv();
      const built = buildTensorzeroConfig(registry);
      const models: TensorzeroCatalogModel[] = registry.models.map((entry) => ({
        id: `${entry.provider}/${entry.modelName}`,
        provider: entry.provider,
        modelName: entry.modelName,
        functionName: tensorzeroFunctionName(entry.provider, entry.modelName),
        keyEnv: entry.keyEnv ?? null,
        ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
      }));
      const catalog: TensorzeroModelCatalog = {
        gatewayVersion: this.probeVersion(),
        models,
        functions: built.functions,
        defaultFunction: built.functions.includes(TENSORZERO_DEFAULT_FUNCTION)
          ? TENSORZERO_DEFAULT_FUNCTION
          : null,
        skipped: built.skipped,
      };
      return ok(catalog);
    } catch (err) {
      return fail(`tensorzero modelCatalog failed: ${msg(err)}`, 'ENGINE_THREW');
    }
  }

  /**
   * Run many inferences over the EXISTING single-inference napi with bounded
   * concurrency. The batch OP itself succeeds (`ok`) and reports per-item
   * outcomes — one provider failure never fails the whole batch (unless
   * `stopOnError`, which skips not-yet-scheduled requests truthfully). An absent
   * gateway is a truthful `ENGINE_DOWN` for the whole batch.
   */
  private async runBatchInference(input: TensorzeroBatchInput): Promise<InvokeResult<TensorzeroBatchResult>> {
    const requests = input.requests;
    if (!Array.isArray(requests) || requests.length === 0) {
      return fail('batchInference requires a non-empty requests array', 'BAD_INPUT');
    }
    if (requests.length > MAX_BATCH_REQUESTS) {
      return fail(`batchInference accepts at most ${MAX_BATCH_REQUESTS} requests (got ${requests.length})`, 'BAD_INPUT');
    }
    const gateway = await this.ensureGateway();
    if (!gateway) return fail(GATEWAY_DOWN, 'ENGINE_DOWN');

    const concurrency = clampConcurrency(input.concurrency);
    const stopOnError = input.stopOnError === true;
    const results: TensorzeroBatchItem[] = new Array(requests.length);
    let nextIndex = 0;
    let aborted = false;

    const worker = async (): Promise<void> => {
      for (;;) {
        const index = nextIndex++;
        if (index >= requests.length) return;
        if (aborted) {
          results[index] = { index, ok: false, skipped: true, error: 'skipped after an earlier failure (stopOnError)' };
          continue;
        }
        try {
          const raw = await gateway.inference(JSON.stringify(requests[index]));
          results[index] = { index, ok: true, value: parseJson(raw) };
        } catch (err) {
          results[index] = { index, ok: false, error: msg(err) };
          if (stopOnError) aborted = true;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, requests.length) }, () => worker()));

    const succeeded = results.filter((item) => item.ok).length;
    const skipped = results.filter((item) => item.skipped).length;
    const failed = results.length - succeeded - skipped;
    return ok({ total: requests.length, succeeded, failed, skipped, concurrency, results });
  }

  /** The gateway crate version, or `null` when the `.node` is absent / throws. */
  private probeVersion(): string | null {
    const mod = this.ensureModule();
    if (!mod) return null;
    try {
      return mod.gatewayVersion();
    } catch {
      return null;
    }
  }


  /**
   * Drive one native streamed inference. Chunk events are forwarded to
   * `onChunk` as they arrive; the `{done}` event on the SAME FIFO callback is
   * the flush barrier (the native promise resolution has no cross-queue
   * ordering guarantee vs the ThreadsafeFunction queue) — awaiting it
   * guarantees every chunk was delivered before this resolves. A mid-stream
   * native failure is a truthful `{ ok:false }`, never a thrown error.
   */
  private async invokeInferenceStream(
    gateway: TzEmbeddedGatewayInstance,
    params: NapiArgs,
    onChunk?: (chunk: unknown) => void,
  ): Promise<InvokeResult<unknown>> {
    let flushed!: () => void;
    const flushBarrier = new Promise<void>((resolve) => {
      flushed = resolve;
    });
    try {
      const summaryJson = await gateway.inferenceStream!(JSON.stringify(params), (_err, eventJson) => {
        const event = parseJson(eventJson);
        if (!event || typeof event !== 'object') return;
        if ('done' in event) {
          flushed();
          return;
        }
        if ('chunk' in event) {
          try {
            onChunk?.((event as { chunk: unknown }).chunk);
          } catch {
            // A sink error must never poison the native callback queue.
          }
        }
      });
      await this.awaitFlushBarrier(flushBarrier);
      return ok(parseJson(summaryJson));
    } catch (err) {
      flushed(); // never leave the barrier pending
      return fail(`tensorzero inferenceStream threw: ${msg(err)}`, 'ENGINE_THREW');
    }
  }

  /** Bounded wait on the `{done}` flush barrier — the seam must never hang. */
  private async awaitFlushBarrier(flushBarrier: Promise<void>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const bound = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 2_000);
    });
    try {
      await Promise.race([flushBarrier, bound]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private degraded(reason: string, bindingPath: string, version?: string): EngineHealth {
    return {
      engineId: 'tensorzero',
      transport: 'napi',
      status: 'degraded',
      reason,
      bindingPath,
      checkedAt: new Date().toISOString(),
      ...(version ? { version } : {}),
    };
  }

  private ensureModule(): TzGatewayNapiModule | undefined {
    if (this.options.enabled === false) return undefined;
    if (this.module) return this.module.addon;
    const loaded = this.loader.load(TENSORZERO_SPEC);
    this.module = loaded;
    return loaded?.addon;
  }

  private ensureGateway(): Promise<TzEmbeddedGatewayInstance | undefined> {
    if (this.options.enabled === false) return Promise.resolve(undefined);
    if (this.gateway) return Promise.resolve(this.gateway);
    if (this.bootPromise) return this.bootPromise;
    this.bootPromise = this.bootGateway();
    return this.bootPromise;
  }

  private async bootGateway(): Promise<TzEmbeddedGatewayInstance | undefined> {
    const mod = this.ensureModule();
    if (!mod?.EmbeddedGateway || typeof mod.EmbeddedGateway.boot !== 'function') return undefined;
    const configFile = await this.resolveConfigFile();
    try {
      this.gateway = await mod.EmbeddedGateway.boot(configFile, this.options.clickhouseUrl ?? null);
      this.log.info({ engineId: 'tensorzero', configFile }, 'tensorzero embedded gateway booted in-process');
      return this.gateway;
    } catch (err) {
      this.bootFailed = true;
      this.log.warn({ engineId: 'tensorzero', err: msg(err) }, 'tensorzero embedded gateway boot failed — degrading');
      return undefined;
    }
  }

  private async resolveConfigFile(): Promise<string | null> {
    if (this.options.configFile !== undefined) return this.options.configFile;
    if (this.options.generateConfig === false) return null;
    // REUSE the existing config generator (env → registry → TOML → temp path).
    try {
      const { generateTensorzeroConfig } = await import('../../../inference/tensorzero-config.js');
      return generateTensorzeroConfig().path ?? null;
    } catch (err) {
      this.log.warn({ err: msg(err) }, 'tensorzero config generation failed — booting default config');
      return null;
    }
  }
}

/** Clamp a requested batch concurrency into `1..MAX_BATCH_CONCURRENCY` (default when absent/invalid). */
function clampConcurrency(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return DEFAULT_BATCH_CONCURRENCY;
  return Math.max(1, Math.min(MAX_BATCH_CONCURRENCY, Math.floor(requested)));
}

/** Factory for the tensorzero napi engine client (the seam consumers hold). */
export function createTensorzeroClient(
  loader: NapiLoaderPort,
  log: Logger,
  options: TensorzeroNapiOptions = {},
): TensorzeroNapiAdapter {
  return new TensorzeroNapiAdapter(loader, log, options);
}
