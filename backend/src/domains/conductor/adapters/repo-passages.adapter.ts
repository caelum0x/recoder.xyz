/**
 * `readRepoPassages` — the conductor's degrade-safe repo → passages chunker feeding
 * the per-repo ColBERT PLAID index build (`ColbertSearchPort.ensureIndex`). On a
 * workspace create the conductor fires this to turn the repo's text files into a
 * bounded list of path-tagged line-window passages, so the late-interaction
 * retriever can surface code the single-vector Qdrant top-K misses.
 *
 * SEAM LAW (bounded + truthful): it NEVER throws. A missing root, an unreadable
 * dir/file, or a binary/oversized file is a SKIP — the worst case is an empty list
 * (⇒ the caller skips the index build). Hard bounds cap the walk so a huge repo can
 * never stall or OOM the fire-and-forget launch hook.
 */
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

/** Directory names never walked (build output, deps, VCS, caches). */
const SKIP_DIRS = new Set<string>([
  '.git',
  'node_modules',
  'dist',
  'build',
  'target',
  '.next',
  'coverage',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.turbo',
  '.cache',
  'out',
  '.pnpm-store',
]);

/** Extensions treated as indexable text (source + docs + config). */
const TEXT_EXTS = new Set<string>([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.kt', '.rb', '.php', '.swift',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs',
  '.css', '.scss', '.html', '.vue', '.svelte',
  '.md', '.mdx', '.txt', '.json', '.yml', '.yaml', '.toml', '.sh', '.sql',
]);

/** Bounds so a fire-and-forget launch hook can never stall or blow memory. */
const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_PASSAGES = 5_000;
/** Lines per passage window (a coarse, language-agnostic chunk). */
const CHUNK_LINES = 40;
/** NUL byte marker — a binary file that slipped the extension allowlist. */
const NUL_BYTE = String.fromCharCode(0);

/**
 * Walk `repoRoot`, chunk its text files into path-tagged line windows, and return
 * the passages. Bounded + degrade-safe: any fault yields the passages gathered so
 * far (possibly `[]`). The relative path is prefixed onto each chunk so a retrieved
 * passage still points the reader at its file.
 */
export async function readRepoPassages(repoRoot: string): Promise<string[]> {
  const root = repoRoot?.trim();
  if (!root) return [];
  const passages: string[] = [];
  let files = 0;

  const walk = async (dir: string): Promise<void> => {
    if (files >= MAX_FILES || passages.length >= MAX_PASSAGES) return;
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — skip truthfully
    }
    for (const entry of entries) {
      if (files >= MAX_FILES || passages.length >= MAX_PASSAGES) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        // Skip hidden dirs (e.g. .idea, .vscode) unless allowlisted above.
        if (entry.name.startsWith('.')) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!TEXT_EXTS.has(extname(entry.name).toLowerCase())) continue;
      await chunkFile(root, full, passages);
      files += 1;
    }
  };

  try {
    await walk(root);
  } catch {
    /* defensive — return whatever was gathered */
  }
  return passages;
}

/** Read one file (bounded) and append its line-window passages. Never throws. */
async function chunkFile(root: string, full: string, out: string[]): Promise<void> {
  try {
    const info = await stat(full);
    if (!info.isFile() || info.size === 0 || info.size > MAX_FILE_BYTES) return;
    const text = await readFile(full, 'utf8');
    // A NUL byte ⇒ binary that slipped the extension allowlist — skip.
    if (text.includes(NUL_BYTE)) return;
    const rel = relative(root, full);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += CHUNK_LINES) {
      if (out.length >= MAX_PASSAGES) return;
      const window = lines.slice(i, i + CHUNK_LINES).join('\n').trim();
      if (window.length === 0) continue;
      out.push(`${rel}\n${window}`);
    }
  } catch {
    /* unreadable file — skip truthfully */
  }
}
