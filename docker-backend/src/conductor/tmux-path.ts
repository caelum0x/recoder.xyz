/**
 * Resolve the tmux binary the Conductor drives.
 *
 * Per the architecture (docs/RECODER-PRODUCT-ARCHITECTURE.md §8c, LOCKED): tmux is a
 * vendored C binary — pinned in the runtime image and driven via its CLI. We own it
 * by vendoring + pinning + driving, not by reimplementing it (the node-pty
 * session-mux attempt was reverted because it cannot survive a backend restart).
 *
 * Resolution order:
 *   1. CONDUCTOR_TMUX_BIN env override (absolute path to a pinned binary).
 *   2. The vendored binary built from c/tmux (at RECODER_TMUX_BUILD_PATH or
 *      <repo>/c/tmux/tmux relative to this module).
 *   3. The system `tmux` on PATH (last resort — never assumed present).
 *
 * Exported as a resolved string so callers pass it straight to execFile.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

function resolveVendoredTmux(): string | undefined {
  const envPath = process.env.RECODER_TMUX_BUILD_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }
  // Walk up from this module to find the repo root (the dir containing c/tmux/tmux.c).
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, 'c', 'tmux', 'tmux.c'))) {
      const built = path.join(dir, 'c', 'tmux', 'tmux');
      if (existsSync(built)) return built;
      break;
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

/**
 * The resolved tmux binary path. Prefer explicit override, then the vendored
 * build, then the bare `'tmux'` name (resolved on PATH by the shell).
 */
export const TMUX_BIN: string =
  process.env.CONDUCTOR_TMUX_BIN ||
  resolveVendoredTmux() ||
  'tmux';

/** Whether the resolved tmux is the vendored/pinned binary (not system PATH). */
export const TMUX_IS_VENDORED: boolean =
  TMUX_BIN !== 'tmux' &&
  Boolean(process.env.CONDUCTOR_TMUX_BIN || resolveVendoredTmux());
