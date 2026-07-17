/**
 * `createRecoderMcpInjector` — the per-worktree `.mcp.json` writer.
 *
 * On workspace launch the composer calls `inject(worktreePath)`; this adapter
 * writes a `.mcp.json` that registers ONE MCP server (`recoder`) pointing the
 * launched agent at the governed backend MCP host via the vendored stdio bridge
 * (`mcp/recoder-a2a-server.js` → `recoder-capability-tools.cjs`). Every capability
 * call the agent makes then traverses the server-side gate.
 *
 * Guarantees (ARCHITECTURE conductor-terminal §3, `mcp-inject.adapter.ts`):
 *  - SECRET-FREE: the written `env` block is filtered so no key/token/secret is
 *    ever persisted; `INTERNAL_SERVICE_KEY` reaches the bridge from the agent's
 *    process env (substrate-injected), not this file.
 *  - MERGE-SAFE: a pre-existing `.mcp.json` keeps ALL its other servers + unknown
 *    top-level keys; only the `recoder` entry is upserted. An unparseable existing
 *    file is left untouched (the agent's config is never destroyed).
 *  - IDEMPOTENT: a re-run that would produce identical bytes does not rewrite
 *    (`changed:false`), so injecting on every launch is safe.
 *  - GIT-EXCLUDED: `.mcp.json` is added to the worktree's git exclude so the agent
 *    never commits it (degrade-safe — a non-repo / absent git is a silent skip).
 *  - DEGRADE-SAFE: a blank worktree path is a truthful `injected:false` skip.
 *
 * The fs + git seam is injected (`McpInjectIo`) so the write/merge/idempotency
 * logic is unit-testable with no real disk or git.
 */
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from '../../../shared/logger.js';
import type { McpInjectPort, McpInjectResult } from '../ports/mcp-inject.port.js';

const execFileAsync = promisify(execFile);

/** The filename every agent MCP client auto-discovers at the worktree root. */
const MCP_CONFIG_FILE = '.mcp.json';

/** The one server name the Recoder toolbelt registers under. */
const DEFAULT_SERVER_NAME = 'recoder';

/** Keys whose NAME implies a credential — never written into the git-visible file. */
const SECRET_KEY_PATTERN = /key|secret|token|password|passwd|credential|auth/i;

/** A stdio MCP server entry (the shape Claude Code / opencode read from `.mcp.json`). */
interface McpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

/** The `.mcp.json` document shape (unknown top-level keys preserved on merge). */
interface McpConfigDoc {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Config for the Recoder MCP server entry the injector writes. */
export interface RecoderMcpInjectConfig {
  /** Absolute path(s) launched as the stdio bridge (e.g. `[<abs>/recoder-a2a-server.js]`). REQUIRED. */
  readonly args: readonly string[];
  /** The launcher binary (default `node`). */
  readonly command?: string;
  /** The server key written into `mcpServers` (default `recoder`). */
  readonly serverName?: string;
  /** Non-secret loopback backend URL → `RECODER_INTERNAL_URL` (e.g. `http://127.0.0.1:3100`). */
  readonly internalUrl?: string;
  /** Optional agent id → `RECODER_AGENT_ID`. */
  readonly agentId?: string;
  /** Extra NON-SECRET env hints; any secret-looking key is dropped defensively. */
  readonly extraEnv?: Readonly<Record<string, string>>;
}

/** The injectable fs + git-exclude seam (default: real node fs + git). */
export interface McpInjectIo {
  /** Read a file's text, or `null` when it does not exist. */
  readFile(path: string): Promise<string | null>;
  /** Write text to a file (overwrites). */
  writeFile(path: string, content: string): Promise<void>;
  /** Ensure `entry` is git-excluded for the worktree (degrade-safe, best-effort). */
  ensureGitExcluded(worktreePath: string, entry: string): Promise<void>;
}

/** The real fs + git implementation of {@link McpInjectIo}. */
export function createMcpInjectIo(logger?: Logger): McpInjectIo {
  return {
    async readFile(path) {
      try {
        return await readFile(path, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async writeFile(path, content) {
      await writeFile(path, content, 'utf8');
    },
    async ensureGitExcluded(worktreePath, entry) {
      // Resolve the worktree's real exclude file (works for linked worktrees whose
      // `.git` is a file). A non-repo / absent git is a truthful silent skip.
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['-C', worktreePath, 'rev-parse', '--git-path', 'info/exclude'],
          { timeout: 5_000 },
        );
        const excludePath = stdout.trim();
        if (!excludePath) return;
        const resolved = excludePath.startsWith('/') ? excludePath : join(worktreePath, excludePath);
        const current = await this.readFile(resolved);
        const lines = (current ?? '').split('\n');
        if (lines.some((line) => line.trim() === entry)) return;
        const prefix = current && !current.endsWith('\n') ? '\n' : '';
        await appendFile(resolved, `${prefix}${entry}\n`, 'utf8');
      } catch (err) {
        logger?.debug({ err, worktreePath }, 'mcp-inject git-exclude skipped (non-repo or git absent)');
      }
    },
  };
}

/** Drop undefined/blank values and any secret-looking key — the file stays secret-free. */
function safeEnv(candidate: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (value == null || value.trim().length === 0) continue;
    if (SECRET_KEY_PATTERN.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Build the secret-free `recoder` server entry from the injector config. */
export function buildRecoderServerEntry(config: RecoderMcpInjectConfig): McpServerEntry {
  const env = safeEnv({
    RECODER_INTERNAL_URL: config.internalUrl,
    RECODER_AGENT_ID: config.agentId,
    ...(config.extraEnv ?? {}),
  });
  const entry: McpServerEntry = {
    command: config.command ?? 'node',
    args: [...config.args],
    ...(Object.keys(env).length > 0 ? { env } : {}),
  };
  return entry;
}

/** Serialize the merged `.mcp.json` document (stable 2-space, trailing newline). */
function serialize(doc: McpConfigDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * Inject the `recoder` server into `<worktreePath>/.mcp.json` — the pure operation
 * behind {@link createRecoderMcpInjector}, exported for direct testing. Merge-safe,
 * idempotent, secret-free; a blank worktree is a truthful skip.
 */
export async function injectRecoderMcp(
  worktreePath: string | null | undefined,
  config: RecoderMcpInjectConfig,
  io: McpInjectIo = createMcpInjectIo(),
): Promise<McpInjectResult> {
  const root = worktreePath?.trim();
  if (!root) {
    return { injected: false, reason: 'no worktree path (nothing to inject into)' };
  }
  const serverName = config.serverName ?? DEFAULT_SERVER_NAME;
  const entry = buildRecoderServerEntry(config);
  const filePath = join(root, MCP_CONFIG_FILE);

  const existingText = await io.readFile(filePath);
  let doc: McpConfigDoc = {};
  if (existingText != null && existingText.trim().length > 0) {
    try {
      const parsed = JSON.parse(existingText) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        doc = parsed as McpConfigDoc;
      } else {
        return { injected: false, path: filePath, reason: 'existing .mcp.json is not an object (left untouched)' };
      }
    } catch {
      return { injected: false, path: filePath, reason: 'existing .mcp.json is not valid JSON (left untouched)' };
    }
  }

  // Merge-safe upsert: keep other servers + unknown top-level keys, replace ours.
  const merged: McpConfigDoc = {
    ...doc,
    mcpServers: { ...(doc.mcpServers ?? {}), [serverName]: entry },
  };
  const content = serialize(merged);

  // Idempotent: identical bytes ⇒ no rewrite (safe to call on every launch).
  if (existingText === content) {
    await io.ensureGitExcluded(root, MCP_CONFIG_FILE);
    return { injected: true, path: filePath, changed: false };
  }

  await io.writeFile(filePath, content);
  await io.ensureGitExcluded(root, MCP_CONFIG_FILE);
  return { injected: true, path: filePath, changed: true };
}

/** Deps for the injector adapter. */
export interface RecoderMcpInjectorDeps {
  readonly config: RecoderMcpInjectConfig;
  readonly logger: Logger;
  /** Override the fs/git seam (tests inject a fake). */
  readonly io?: McpInjectIo;
}

/**
 * Build the {@link McpInjectPort} the composer calls on workspace launch. A write
 * fault is contained (logged, reported `injected:false`) — an injection hiccup must
 * NEVER fail an otherwise-successful launch.
 */
export function createRecoderMcpInjector(deps: RecoderMcpInjectorDeps): McpInjectPort {
  const io = deps.io ?? createMcpInjectIo(deps.logger);
  return {
    async inject(worktreePath) {
      try {
        const result = await injectRecoderMcp(worktreePath, deps.config, io);
        if (result.changed) {
          deps.logger.info({ path: result.path }, 'injected Recoder .mcp.json into worktree');
        }
        return result;
      } catch (err) {
        deps.logger.warn({ err, worktreePath }, 'conductor .mcp.json injection failed (launch unaffected)');
        return { injected: false, reason: err instanceof Error ? err.message : 'injection failed' };
      }
    },
  };
}
