/**
 * Convention resolvers for the Python-sidecar layout (`backend/engines/py/<x>`).
 *
 * The deep sidecar adapters (mem0, browser-use) resolve their venv python +
 * entrypoint by CONVENTION from the repo root so bootstrap does not have to pin
 * every path. An explicit `EnginesConfig.sidecarPython.<x>` override always wins;
 * these are the degrade-safe fallbacks. Every lookup is a pure `existsSync` walk
 * (no env reads, no spawn) and returns `null` when the layout is absent, so the
 * supervisor preflight degrades truthfully rather than spawning a phantom.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Resolve `<root>/engines/py` (the sidecar root). Honors an explicit repo root
 * (`<repoRoot>/backend/engines/py` or `<repoRoot>/engines/py`), else walks up
 * from this module — the same bounded, loop-free strategy the napi loader uses.
 */
export function resolveEnginesPyRoot(repoRoot: string | null): string | null {
  if (repoRoot) {
    for (const rel of [['backend', 'engines', 'py'], ['engines', 'py']]) {
      const candidate = join(repoRoot, ...rel);
      if (existsSync(candidate)) return candidate;
    }
  }
  let dir: string;
  try {
    dir = __dirname;
  } catch {
    return null;
  }
  for (let i = 0; i < 12; i++) {
    for (const rel of [['backend', 'engines', 'py'], ['engines', 'py']]) {
      const candidate = join(dir, ...rel);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** First existing venv python under `dir` (checking `.venv` then a parent `../.venv`), or null. */
export function resolveVenvPython(dir: string): string | null {
  const candidates = [
    join(dir, '.venv', 'bin', 'python3'),
    join(dir, '.venv', 'bin', 'python'),
    join(dir, '..', '.venv', 'bin', 'python3'),
    join(dir, '..', '.venv', 'bin', 'python'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}
