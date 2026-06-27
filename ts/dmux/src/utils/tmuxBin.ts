/**
 * Resolve the tmux binary @recoder/dmux drives.
 *
 * @recoder/dmux is the optional operator console over Recoder's Conductor substrate.
 * The Conductor pins a vendored tmux C binary (built from `c/tmux`) and drives it via
 * its CLI — never `tmux` from a random PATH. dmux MUST use the same binary so the
 * operator console and the headless conductor sessions share one tmux server.
 *
 * This mirrors `docker-backend/src/conductor/tmux-path.ts` exactly so both halves agree.
 *
 * Resolution order (first hit wins):
 *   1. DMUX_TMUX_BIN          — dmux-specific override (absolute path).
 *   2. CONDUCTOR_TMUX_BIN     — Conductor's pinned-binary override (absolute path).
 *   3. RECODER_TMUX_BUILD_PATH — the built vendored binary path.
 *   4. <repo>/c/tmux/tmux     — vendored build discovered by walking up to repo root.
 *   5. 'tmux'                 — system PATH (last resort, never assumed present).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resilient existsSync: never throws. Some unit tests partially mock `node:fs`
 * (e.g. provide `readFileSync` but not `existsSync`); resolution must degrade to the
 * system `tmux` rather than crash an unrelated module's import. A missing/broken
 * `existsSync` is treated as "path not found".
 */
function pathExists(p: string): boolean {
  try {
    return typeof existsSync === 'function' ? existsSync(p) : false;
  } catch {
    return false;
  }
}

function firstExistingEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && pathExists(value)) {
      return value;
    }
  }
  return undefined;
}

function resolveVendoredTmux(): string | undefined {
  const fromEnv = firstExistingEnv('RECODER_TMUX_BUILD_PATH');
  if (fromEnv) return fromEnv;

  // Walk up from this module to the Recoder repo root (the dir containing c/tmux/tmux.c).
  let dir = HERE;
  for (let i = 0; i < 12; i++) {
    if (pathExists(path.join(dir, 'c', 'tmux', 'tmux.c'))) {
      const built = path.join(dir, 'c', 'tmux', 'tmux');
      if (pathExists(built)) return built;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function resolveTmuxBin(): string {
  return (
    firstExistingEnv('DMUX_TMUX_BIN', 'CONDUCTOR_TMUX_BIN') ||
    resolveVendoredTmux() ||
    'tmux'
  );
}

/**
 * The resolved tmux binary path. Resolved once at import (the build path does not
 * move during a process lifetime), matching the Conductor's `TMUX_BIN` contract.
 */
export const TMUX_BIN: string = resolveTmuxBin();

/** Whether the resolved tmux is the vendored/pinned binary (not bare system `tmux`). */
export const TMUX_IS_VENDORED: boolean = TMUX_BIN !== 'tmux';

/**
 * Shell-quote a binary path so a resolved absolute path with spaces survives being
 * embedded in a shell command string. Bare `tmux` (no separators) is left untouched.
 */
function quoteBin(bin: string): string {
  if (bin === 'tmux') return bin;
  if (/^[A-Za-z0-9._\/-]+$/.test(bin)) return bin;
  return `'${bin.replace(/'/g, `'\\''`)}'`;
}

const QUOTED_TMUX_BIN = quoteBin(TMUX_BIN);

/**
 * Rewrite the leading `tmux` token(s) of a shell command string to the resolved,
 * pinned binary. dmux builds many commands as `tmux <args>` strings that are then
 * passed to execSync/execAsync; this routes every one of them through `TMUX_BIN`
 * without rewriting each call site.
 *
 * It replaces a `tmux` word that appears at the start of the string or immediately
 * after a shell separator (`&&`, `||`, `;`, `|`, `(`, newline), so chained commands
 * like `tmux a \; tmux b` are fully covered while leaving e.g. an embedded literal
 * argument that merely contains the substring "tmux" alone.
 */
export function tmuxCommand(command: string): string {
  if (TMUX_BIN === 'tmux') return command;
  return command.replace(
    /(^|[\n;&|(]\s*|&&\s*|\|\|\s*)tmux(?=\s|$)/g,
    (_match, prefix: string) => `${prefix}${QUOTED_TMUX_BIN}`,
  );
}

/**
 * The argv[0] to use when invoking tmux via spawn/spawnSync/execFile with an args
 * array (no shell). Returns the resolved absolute binary, or bare `tmux` for PATH.
 */
export function tmuxBinFile(): string {
  return TMUX_BIN;
}
