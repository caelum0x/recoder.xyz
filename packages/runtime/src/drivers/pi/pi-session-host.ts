/**
 * FUSION of `packages/pi-coding-agent/src/core/agent-session-runtime.ts` (lifecycle ownership)
 * + `src/main.ts` (CLI arg assembly) + the spawn lifecycle of `print-mode.ts` / `rpc-client.ts`.
 *
 * The pi CLI owns the full session/model/auth bootstrap; this host's job is to compile a
 * `CliInvocation` for a headless pi run and provide the truthful presence/version probe.
 * Frame parsing lives in the print/rpc drivers; this module owns only invocation assembly
 * and process-presence — reusing `drivers/shared` plumbing, never duplicating spawn/jsonl logic.
 */

import type { RuntimeTaskInput } from '@recoder/agent-runtimes';
import type { RuntimeHealth } from '@recoder/agent-os';
import type { CliInvocation } from '../../contracts/cli-invocation';
import type { DriverContext, DriverProbeContext } from '../../contracts/driver-context';
import type { DriverProbe } from '../../contracts/runtime-driver';
import { makeCliInvocation } from '../../contracts/cli-invocation';
import { ArgBuilder } from '../shared/arg-builder';
import { buildChildEnv } from '../shared/env-builder';
import { probeCliVersion } from '../shared/cli-version-probe';
import { locateCli } from '../shared/cli-locator';
import { resolvePiModel } from './pi-model-resolver';

export const PI_BINARY = 'pi';

export type PiRunMode = 'json' | 'rpc';

/** Options shared by both pi drivers. */
export type PiDriverOptions = {
  /** Explicit path to the `pi` binary (overrides PATH lookup; used by tests with a faux CLI). */
  cliPathOverride?: string;
};

/**
 * Truthful presence/health probe for the pi CLI. Never green-washes: a missing `pi` binary
 * or a failing `--version` yields `available: false` with a reason.
 */
export function probePiCli(ctx: DriverProbeContext, override?: string): DriverProbe {
  const probe = probeCliVersion({
    binary: PI_BINARY,
    binName: PI_BINARY,
    override: ctx.cliPathOverride ?? override,
    cwd: ctx.cwd,
    pathEnv: ctx.env?.['PATH'],
    versionArg: '--version',
  });

  const health: RuntimeHealth = {
    status: probe.available ? 'healthy' : 'offline',
    checkedAt: new Date().toISOString(),
    message: probe.available
      ? `pi CLI available${probe.version ? ` (${probe.version})` : ''}`
      : (probe.unavailableReason ?? 'pi CLI not found'),
  };

  return {
    health,
    available: probe.available,
    version: probe.version,
    unavailableReason: probe.available ? undefined : probe.unavailableReason,
  };
}

/** Extract the prompt to drive the run from the compiled instruction bundle / task. */
export function resolvePiPrompt(input: RuntimeTaskInput): string {
  const rendered = input.bundle.renderedPrompt;
  if (typeof rendered === 'string' && rendered.trim().length > 0) {
    return rendered;
  }
  // Fail-safe: never run pi on an empty prompt; fall back to the shared goal.
  return input.task.goal;
}

/**
 * Build the headless pi CLI args common to both run modes.
 *
 * - json:  `pi --mode json -p <prompt>` (one-shot; prompt as a positional/`-p` arg).
 * - rpc:   `pi --mode rpc` (prompt is sent via an RPC `prompt` command on stdin).
 *
 * Model/provider/BYOK flags mirror pi `main.ts` (`--provider`/`--model`/`--api-key`).
 * `--no-extensions`/`--project-trust false` keep headless runs deterministic and sandbox-safe.
 */
export function buildPiArgs(
  mode: PiRunMode,
  input: RuntimeTaskInput,
  env: Readonly<Record<string, string>>,
): { args: string[]; prompt: string } {
  const prompt = resolvePiPrompt(input);
  const selection = resolvePiModel(input, env);

  let builder = ArgBuilder.create()
    .addFlag('--mode', mode)
    .add('--no-extensions');

  builder = builder.addFlagIf(Boolean(selection.provider), '--provider', selection.provider);
  builder = builder.addFlagIf(Boolean(selection.model), '--model', selection.model);
  builder = builder.addFlagIf(Boolean(selection.apiKey), '--api-key', selection.apiKey);

  // In json/print mode the prompt is a positional argument; in rpc mode it is streamed.
  if (mode === 'json') {
    builder = builder.addFlag('-p', prompt);
  }

  return { args: builder.build(), prompt };
}

/**
 * Resolve the pi binary path truthfully (override -> node_modules/.bin -> PATH). Returns
 * `undefined` when absent so the driver can emit a `runtime_unavailable` terminal — never fakes it.
 */
export function resolvePiBinary(ctx: DriverContext, override?: string): string | undefined {
  const location = locateCli({
    binary: PI_BINARY,
    binName: PI_BINARY,
    override,
    cwd: ctx.cwd,
    pathEnv: ctx.env['PATH'],
  });
  return location.found ? location.resolvedPath : undefined;
}

/**
 * Compile a fully-resolved `CliInvocation` for a pi headless run from the driver context.
 *
 * `command` is the resolved binary path; callers pass the located path (or the binary name as a
 * fallback). Env is rebuilt through the shared builder so offline intent + redaction are consistent.
 */
export function buildPiInvocation(
  mode: PiRunMode,
  ctx: DriverContext,
  command: string,
): {
  invocation: CliInvocation;
  prompt: string;
} {
  const { args, prompt } = buildPiArgs(mode, ctx.input, ctx.env);

  const { env } = buildChildEnv({
    base: ctx.env,
    overrides: { PI_HEADLESS: '1' },
    policy: { allowNetwork: ctx.policy.allowNetwork },
  });

  const invocation = makeCliInvocation({
    command,
    args,
    cwd: ctx.cwd,
    env,
    // rpc keeps stdin open for steering; json closes stdin after spawn.
    keepStdinOpen: mode === 'rpc',
  });

  return { invocation, prompt };
}
