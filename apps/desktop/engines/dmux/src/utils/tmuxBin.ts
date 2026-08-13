/**
 * Resolve the tmux binary @recoder/dmux drives.
 *
 * @recoder/dmux is the optional operator console over Recoder's Conductor substrate.
 * The Conductor pins a vendored tmux C binary (built from `apps/desktop/engines/tmux`) and drives it via
 * its CLI — never `tmux` from a random PATH. dmux MUST use the same binary so the
 * operator console and the headless conductor sessions share one tmux server.
 *
 * This mirrors the resolution CONTRACT of `backend/src/domains/engines/tmux-path.ts`
 * (CONDUCTOR_TMUX_BIN → vendored build → system PATH). CONDUCTOR_TMUX_BIN is honored
 * unconditionally in both halves, so whenever the Conductor pins a binary both the
 * operator console and the headless conductor resolve the SAME path and share one
 * tmux server. It is NOT a byte-for-byte copy: dmux layers one documented, dmux-only
 * addition on top — a higher-priority DMUX_TMUX_BIN console-local override — and walks
 * a couple extra parent directories because this module sits deeper in the tree.
 *
 * Resolution order (first hit wins):
 *   1. DMUX_TMUX_BIN          — dmux-only console override (absolute path). Not read by the backend.
 *   2. CONDUCTOR_TMUX_BIN     — Conductor's pinned-binary override (absolute path); the shared contract.
 *   3. RECODER_TMUX_BUILD_PATH — the built vendored binary path.
 *   4. <repo>/apps/desktop/engines/tmux/tmux     — vendored build discovered by walking up to repo root.
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

  // Walk up from this module to the Recoder repo root (the dir containing apps/desktop/engines/tmux/tmux.c).
  let dir = HERE;
  for (let i = 0; i < 12; i++) {
    if (pathExists(path.join(dir, 'apps', 'desktop', 'engines', 'tmux', 'tmux.c'))) {
      const built = path.join(dir, 'apps', 'desktop', 'engines', 'tmux', 'tmux');
      if (pathExists(built)) return built;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function resolveTmuxBin(): string {
  // dmux-only console override (highest priority). Honored as-is when set so an
  // operator can force a specific binary for the operator console without touching the
  // Conductor. The backend does not read this variable.
  const dmuxOverride = process.env.DMUX_TMUX_BIN;
  if (dmuxOverride) return dmuxOverride;

  // Conductor's pinned-binary override. Honored UNCONDITIONALLY (never existence-gated)
  // to match backend/src/domains/engines/tmux-path.ts: when the Conductor pins a binary,
  // both halves must resolve the exact same path so they share one tmux server. A bad
  // path fails fast at exec rather than silently diverging to a different binary.
  const conductorOverride = process.env.CONDUCTOR_TMUX_BIN;
  if (conductorOverride) return conductorOverride;

  return resolveVendoredTmux() || 'tmux';
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
