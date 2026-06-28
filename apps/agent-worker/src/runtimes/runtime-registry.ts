/**
 * Wires the real `@recoder/runtime` driver engine into agent-worker as available
 * `RuntimeAdapterPort`s, ADDITIVELY.
 *
 * The worker workflow (`runAgentOsWorkflow`) resolves a runtime per node from a
 * `Record<string, RuntimeAdapterPort>` keyed by runtime/adapter/agent id or surface
 * `kind`. Until now that map was always empty, so every runtime node resolved to
 * `undefined` and the workflow had no executor. This module fills that map with the
 * finished `@recoder/runtime` adapters (`createRuntime().adapterFor(surface)`), each of
 * which is a drop-in `AgentRuntimeAdapter` (structurally a `RuntimeAdapterPort`).
 *
 * Registration is behind an availability/health gate: a surface is only registered when
 * its driver reports it is not `offline`/`error`. This keeps the proven, empty-map
 * behavior intact when the runtime engine or a CLI is unavailable — nothing is forced.
 */
import type { RuntimeAdapterPort } from '@recoder/agent-os';
import type { AgentRuntimeAdapter } from '@recoder/agent-runtimes';
import { createRuntime, type Runtime } from '@recoder/runtime';

/** Surfaces the runtime engine can serve, in resolution preference order. */
export const RUNTIME_SURFACES = [
  'recoder_code',
  'claude_code',
  'codex',
  'opencode',
  'gemini_cli',
  'qwen_code',
] as const;

export type RuntimeSurface = (typeof RUNTIME_SURFACES)[number];

export type BuildRuntimeRegistryOptions = {
  /**
   * Pre-built runtime to use (lets tests inject a runtime with stub drivers). When
   * omitted, a real `createRuntime()` engine with the built-in drivers is constructed.
   */
  runtime?: Runtime;
  /** Restrict to a subset of surfaces (defaults to all `RUNTIME_SURFACES`). */
  surfaces?: readonly string[];
  /**
   * When true (default), only register surfaces whose driver health is not
   * `offline`/`error`. When false, register every requested surface regardless of health
   * (useful for tests that assert resolvability without a real CLI on PATH).
   */
  requireHealthy?: boolean;
};

/**
 * A runtime adapter paired with its health snapshot at registration time. The adapter is
 * a `@recoder/runtime` `AgentRuntimeAdapter`, which is structurally a `RuntimeAdapterPort`
 * (the type the worker's runtime map expects) plus a `kind` surface tag.
 */
export type RegisteredRuntime = {
  surface: string;
  adapter: AgentRuntimeAdapter;
  healthStatus: string;
};

/**
 * Build the `RuntimeAdapterPort` registry from `@recoder/runtime`.
 *
 * Returns a map keyed by surface id (so the worker's resolver finds it via `kind`,
 * `runtimeId`, etc.) plus the adapter `id` of each registered adapter as an alias key.
 * Only available (non-offline) surfaces are included unless `requireHealthy` is false.
 */
export async function buildRuntimeRegistry(
  options: BuildRuntimeRegistryOptions = {},
): Promise<Record<string, RuntimeAdapterPort>> {
  const registered = await resolveRuntimeAdapters(options);
  const map: Record<string, RuntimeAdapterPort> = {};

  for (const entry of registered) {
    // Key by surface so node.config.kind / runtimeId='recoder_code' resolves.
    map[entry.surface] = entry.adapter;
    // Also alias by the adapter's own id (e.g. 'runtime:recoder_code').
    if (entry.adapter.id && entry.adapter.id !== entry.surface) {
      map[entry.adapter.id] = entry.adapter;
    }
  }

  return map;
}

/**
 * Resolve each requested surface to a real adapter, gated by health. Surfaces whose
 * driver is missing/offline are skipped (when `requireHealthy`), never faked.
 */
export async function resolveRuntimeAdapters(
  options: BuildRuntimeRegistryOptions = {},
): Promise<RegisteredRuntime[]> {
  const runtime = options.runtime ?? createRuntime();
  const surfaces = options.surfaces ?? RUNTIME_SURFACES;
  const requireHealthy = options.requireHealthy ?? true;

  const out: RegisteredRuntime[] = [];

  for (const surface of surfaces) {
    let adapter: AgentRuntimeAdapter;
    try {
      // adapterFor throws if no driver serves the surface; skip those cleanly.
      adapter = runtime.adapterFor(surface);
    } catch {
      continue;
    }

    let healthStatus = 'unknown';
    if (requireHealthy) {
      try {
        const health = await adapter.health();
        healthStatus = health.status;
        if (health.status === 'offline' || health.status === 'error') {
          continue;
        }
      } catch {
        // A driver that throws on probe is treated as unavailable, not registered.
        continue;
      }
    }

    out.push({ surface, adapter, healthStatus });
  }

  return out;
}
