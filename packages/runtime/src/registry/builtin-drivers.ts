import type { RuntimeDriver } from '../contracts/runtime-driver';
import { DriverRegistry } from './driver-registry';
import { createClaudeCodeDriver } from '../drivers/claude-code';
import { createCodexDriver } from '../drivers/codex';
import { createOpenCodeDriver } from '../drivers/opencode';
import { createPiDrivers } from '../drivers/pi';
import { createInProcessDriver } from '../drivers/in-process';
import { createRecoderCodeDriver } from '../drivers/recoder-code';
import {
  createGeminiCliDriver,
  createQwenCodeDriver,
  createAcpDriver,
} from '../drivers/generic';

export type BuiltinDriverOptions = {
  /** Which delegate the first-party `recoder-code` driver routes to. Default `pi`. */
  recoderCodeDelegate?: 'pi' | 'in_process';
  /** Per-surface CLI path overrides (mirrors RuntimeConfig.cliPaths). */
  cliPaths?: Readonly<Record<string, string>>;
};

/**
 * Construct the full set of built-in drivers.
 *
 * Order matters for surface resolution: the registry resolves a surface to the FIRST
 * registered driver that serves it. The first-party `recoder-code` driver is therefore
 * placed ahead of the pi/in-process drivers that also serve `recoder_code`, so it is the
 * default for that surface while the others remain resolvable by explicit driver id / mode.
 */
export function createBuiltinDrivers(options: BuiltinDriverOptions = {}): RuntimeDriver[] {
  const cliPaths = options.cliPaths ?? {};

  const piDrivers = createPiDrivers();
  const inProcessDriver = createInProcessDriver();
  const recoderCode = createRecoderCodeDriver({
    delegate: options.recoderCodeDelegate ?? 'pi',
    piDriver: piDrivers[0],
    inProcessDriver,
  });

  return [
    // First-party surface (must precede pi/in-process for recoder_code resolution).
    recoderCode,
    // Fused per-CLI drivers.
    createClaudeCodeDriver({ cliPathOverride: cliPaths['claude_code'] }),
    createCodexDriver({ cliPathOverride: cliPaths['codex'] }),
    createOpenCodeDriver({ cliPathOverride: cliPaths['opencode'] }),
    ...piDrivers,
    inProcessDriver,
    // Generic process drivers (design §3.5).
    createGeminiCliDriver({ cliPathOverride: cliPaths['gemini_cli'] }),
    createQwenCodeDriver({ cliPathOverride: cliPaths['qwen_code'] }),
    createAcpDriver({ cliPathOverride: cliPaths['acp'] }),
  ];
}

/**
 * Register the built-in drivers (claude-code, codex, opencode, pi, in-process, recoder-code,
 * gemini-cli, qwen-code, acp).
 *
 * When `extraDrivers` are supplied they are registered FIRST (they win surface resolution and
 * may override a built-in by id), then the built-ins fill in any surface not already covered.
 * A driver whose id is already registered is skipped — never double-registered.
 */
export function registerBuiltinDrivers(
  registry: DriverRegistry,
  extraDrivers: readonly RuntimeDriver[] = [],
  options: BuiltinDriverOptions = {},
): DriverRegistry {
  const ordered = [...extraDrivers, ...createBuiltinDrivers(options)];
  for (const driver of ordered) {
    if (!registry.has(driver.descriptor.id)) {
      registry.register(driver);
    }
  }
  return registry;
}
