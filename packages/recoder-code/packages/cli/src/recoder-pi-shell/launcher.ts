/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Recoder Code on pi — Stage A launcher (opt-in behind `RECODER_PI_SHELL`).
 *
 * When the flag is truthy, the `recoder` CLI hands off to full pi's *interactive*
 * mode (`@recoder/pi-coding-agent` `main()`), configured with the Recoder config
 * dir, Recoder branding, and the default recodergit + brain MCP servers bridged
 * into pi's agent. When the flag is unset (the DEFAULT), this module is never
 * reached and the legacy Ink path runs unchanged.
 *
 * pi ships no `.d.ts` and is ESM-only with an exports map, so its `main` entry is
 * loaded via a dynamic import that survives the CLI's module output (mirrors
 * `recoder-code-core`'s existing `pi-runtime.ts` bridge). The entry is injectable
 * so tests assert the wiring without spawning a real TUI.
 */

import {
  buildRecoderPiLaunchPlan,
  type BuildLaunchPlanOptions,
  type EnvLike,
  type RecoderPiLaunchPlan,
} from './launch-plan.js';
import {
  createRecoderMcpBridgeFactory,
  type PiExtensionFactory,
} from './mcp-bridge.js';

/** The env flag that opts Recoder Code into the pi interactive shell. */
export const RECODER_PI_SHELL_ENV = 'RECODER_PI_SHELL';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/** True when `RECODER_PI_SHELL` is set to a truthy value. */
export function isPiShellEnabled(env: EnvLike = process.env): boolean {
  const raw = env[RECODER_PI_SHELL_ENV]?.trim().toLowerCase();
  return !!raw && TRUTHY.has(raw);
}

/**
 * pi's interactive entry point: `main(args, { extensionFactories })`.
 * Typed structurally — pi ships no declarations.
 */
export type PiMainEntry = (
  args: string[],
  options?: { extensionFactories?: PiExtensionFactory[] },
) => Promise<unknown> | unknown;

export interface RunPiShellDeps extends BuildLaunchPlanOptions {
  /** Mutable env to read flags from and apply config-dir overrides to. */
  readonly env?: Record<string, string | undefined>;
  /** Loads pi's interactive `main` (injected in tests; default dynamic import). */
  readonly loadPiMain?: () => Promise<PiMainEntry>;
  /** Builds the MCP bridge factory (injected in tests; default = real bridge). */
  readonly buildBridge?: (
    mcpServers: RecoderPiLaunchPlan['mcpServers'],
  ) => PiExtensionFactory;
  /** Applies env overrides (injected in tests; default mutates `env`). */
  readonly applyEnv?: (
    env: Record<string, string | undefined>,
    overrides: Record<string, string>,
  ) => void;
}

/** Default pi `main` loader: dynamic import that survives CJS/ESM output. */
async function defaultLoadPiMain(): Promise<PiMainEntry> {
  const dynamicImport = new Function(
    'specifier',
    'return import(specifier)',
  ) as (specifier: string) => Promise<{ main?: PiMainEntry }>;
  const pi = await dynamicImport('@recoder/pi-coding-agent');
  if (typeof pi.main !== 'function') {
    throw new Error(
      'pi interactive entry (@recoder/pi-coding-agent `main`) is not available.',
    );
  }
  return pi.main;
}

function defaultApplyEnv(
  env: Record<string, string | undefined>,
  overrides: Record<string, string>,
): void {
  for (const [key, value] of Object.entries(overrides)) {
    env[key] = value;
  }
}

/**
 * Launch full pi's interactive mode as the Recoder Code shell.
 *
 * Real wiring performed here:
 *  1. Build the launch plan (Recoder config dir + branding + default MCP servers).
 *  2. Apply the env overrides so pi writes its config under the Recoder config dir.
 *  3. Bridge the recodergit + brain MCP servers into pi via an extension factory.
 *  4. Invoke pi's interactive `main(piArgs, { extensionFactories })`.
 *
 * Returns the plan it executed (so callers/tests can assert the wiring).
 */
export async function runRecoderPiShell(
  deps: RunPiShellDeps = {},
): Promise<RecoderPiLaunchPlan> {
  const env = deps.env ?? process.env;

  const plan = buildRecoderPiLaunchPlan({
    env,
    argv: deps.argv,
    exists: deps.exists,
    isOnPath: deps.isOnPath,
    startDir: deps.startDir,
  });

  const applyEnv = deps.applyEnv ?? defaultApplyEnv;
  applyEnv(env, plan.envOverrides);

  const buildBridge =
    deps.buildBridge ??
    ((mcpServers) => createRecoderMcpBridgeFactory(mcpServers));
  const bridge = buildBridge(plan.mcpServers);

  const loadPiMain = deps.loadPiMain ?? defaultLoadPiMain;
  const piMain = await loadPiMain();

  await piMain(plan.piArgs, { extensionFactories: [bridge] });

  return plan;
}

/**
 * Gate used by the CLI entry: when the flag is enabled, launch the pi shell and
 * return `true` (caller should return without running the legacy path).
 * Otherwise return `false` (no side effects), so the default Ink path runs.
 */
export async function maybeRunRecoderPiShell(
  deps: RunPiShellDeps = {},
): Promise<boolean> {
  const env = deps.env ?? process.env;
  if (!isPiShellEnabled(env)) {
    return false;
  }
  await runRecoderPiShell(deps);
  return true;
}
