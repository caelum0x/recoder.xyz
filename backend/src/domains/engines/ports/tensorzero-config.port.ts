/**
 * `TensorzeroConfigProvider` — the CONSUMER-OWNED port the tensorzero napi adapter
 * calls for its env→registry→config generation. The concrete implementation is the
 * inference domain's `tensorzero-config` module (env → registry → TOML → temp path);
 * bootstrap injects it via `enginesModule.setTensorzeroConfigProvider(...)` (a late
 * setter, engines is composed before inference — same ordering as the entitlement
 * gate / usage meter seams).
 *
 * WHY A PORT: `runModelCatalog` (:catalog) and `resolveConfigFile` (:config-file)
 * previously reached the inference domain through two lazy `await import(...)` calls
 * — runtime cross-domain VALUE edges. Injecting this one port removes BOTH: the
 * adapter reads all five members off the injected provider and keeps its exact
 * degrade-safe behavior (an unset provider ⇒ the same env-only / default-config
 * fallback the old dynamic-import catch produced).
 *
 * The type imports below are TYPE-ONLY (erased at build) — the inference domain owns
 * the config shapes; this engines-owned port merely names the surface the adapter
 * consumes, so there is no runtime engines→inference coupling.
 */
import type {
  TensorzeroRegistry,
  TensorzeroBuiltConfig,
  TensorzeroGeneratedConfig,
} from '../../inference/tensorzero-config.js';
import type { GeneratedTzConfig } from '../../inference/adapters/tz-config-generator.js';

/**
 * The five-member surface both adapter call sites destructure. Mirrors the exports
 * of the inference `tensorzero-config` module 1:1 so bootstrap can inject that module
 * directly (structural match — no wrapper needed).
 */
export interface TensorzeroConfigProvider {
  /** Resolve the routable model registry from the environment (never throws). */
  registryFromEnv(env?: NodeJS.ProcessEnv): TensorzeroRegistry;
  /** Build the tensorzero.toml + function list from a registry (pure — no I/O). */
  buildTensorzeroConfig(registry: TensorzeroRegistry): TensorzeroBuiltConfig;
  /** Deterministic TensorZero function name for a `<provider>/<model>` entry. */
  tensorzeroFunctionName(provider: string, modelName: string): string;
  /** The stable default function alias the first registry model is aliased to. */
  readonly TENSORZERO_DEFAULT_FUNCTION: string;
  /** End-to-end: env → registry → TOML → temp file path (optionally ∪ DB overlay). */
  generateTensorzeroConfig(
    env?: NodeJS.ProcessEnv,
    overlay?: GeneratedTzConfig | null,
  ): TensorzeroGeneratedConfig;
}
