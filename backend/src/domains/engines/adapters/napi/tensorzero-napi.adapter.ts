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

  // --- internals ---

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

/** Factory for the tensorzero napi engine client (the seam consumers hold). */
export function createTensorzeroClient(
  loader: NapiLoaderPort,
  log: Logger,
  options: TensorzeroNapiOptions = {},
): TensorzeroNapiAdapter {
  return new TensorzeroNapiAdapter(loader, log, options);
}
