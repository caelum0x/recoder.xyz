/**
 * mcp-inject — give EVERY agent Recoder's tools automatically.
 *
 * When the conductor provisions a worktree, it writes a `.mcp.json` registering
 * the Recoder MCP server (mcp/recoder-a2a-server.js) so the launched coding
 * agent (Claude Code auto-discovers project `.mcp.json`) can immediately call
 * Recoder's capabilities — A2A (talk to other agents), sandbox exec, workspace
 * ops, memory, and the rest of the governed MCP host — with ZERO user setup.
 * This is the "make claude code / codex use these capabilities" wiring: the
 * polyglot backend becomes the agent's toolbelt.
 *
 * The server reads its auth/URL from env (injected at launch; MCP stdio children
 * inherit the parent CLI env), so `.mcp.json` carries NO secrets.
 *
 * Non-polluting: the injected file is added to the repo's git exclude so it
 * never shows up in the workspace's review diff. Merge-safe: if the worktree
 * already has a `.mcp.json` (the user's own), the Recoder server is added
 * alongside their servers, never clobbering them. Fully degrade-safe: any
 * failure is swallowed — a missing server file or write error never blocks the
 * agent launch.
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createLogger } from '../logger.js';

const logger = createLogger('conductor:mcp-inject');

const SERVER_KEY = 'recoder';

/** The Recoder MCP server entry for a `.mcp.json` (stdio, env-driven, no secrets). */
export function buildRecoderMcpServerEntry(serverPath: string): {
  command: string;
  args: string[];
} {
  return { command: 'node', args: [serverPath] };
}

/**
 * Merge the Recoder server into an existing `.mcp.json` object (or a fresh one),
 * never overwriting the user's other servers. Pure — returns the new object.
 */
export function mergeRecoderMcpConfig(
  existing: Record<string, unknown> | undefined,
  serverPath: string,
): Record<string, unknown> {
  const base = existing && typeof existing === 'object' ? { ...existing } : {};
  const servers =
    base.mcpServers && typeof base.mcpServers === 'object'
      ? { ...(base.mcpServers as Record<string, unknown>) }
      : {};
  // Only add ours; leave any user-defined servers (including a prior 'recoder')
  // untouched if the user set one explicitly.
  if (!servers[SERVER_KEY]) {
    servers[SERVER_KEY] = buildRecoderMcpServerEntry(serverPath);
  }
  return { ...base, mcpServers: servers };
}

/**
 * Resolve the Recoder MCP server script (mcp/recoder-a2a-server.js) from known
 * locations. Returns null when it cannot be found (injection then no-ops).
 */
export function resolveRecoderMcpServerPath(): string | null {
  const candidates = [
    process.env.RECODER_MCP_SERVER_PATH,
    // Repo root relative to docker-backend/dist or src (../.. → repo root).
    path.resolve(__dirname, '..', '..', '..', 'mcp', 'recoder-a2a-server.js'),
    path.resolve(process.cwd(), 'mcp', 'recoder-a2a-server.js'),
    path.resolve(process.cwd(), '..', 'mcp', 'recoder-a2a-server.js'),
  ].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Write/merge `.mcp.json` into a freshly provisioned worktree and hide it from
 * git so it never pollutes the review diff. Degrade-safe: returns true on
 * success, false (logged at debug) on any failure — NEVER throws.
 */
export function injectRecoderMcp(worktreePath: string, repoPath: string): boolean {
  try {
    const serverPath = resolveRecoderMcpServerPath();
    if (!serverPath) {
      logger.debug('recoder MCP server not found; skipping .mcp.json injection');
      return false;
    }
    const mcpPath = path.join(worktreePath, '.mcp.json');
    let existing: Record<string, unknown> | undefined;
    if (existsSync(mcpPath)) {
      try {
        existing = JSON.parse(readFileSync(mcpPath, 'utf8')) as Record<string, unknown>;
      } catch {
        existing = undefined; // malformed — start fresh but keep going
      }
    }
    const merged = mergeRecoderMcpConfig(existing, serverPath);
    writeFileSync(mcpPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

    // Hide the injected file from git (local exclude — never committed). Only
    // needed when we CREATED it (an existing tracked .mcp.json stays tracked;
    // exclude affects untracked only, so this is safe either way).
    excludeFromGit(repoPath, '.mcp.json');
    return true;
  } catch (err) {
    logger.debug({ err, worktreePath }, 'recoder MCP injection failed (non-fatal)');
    return false;
  }
}

/** Add a pattern to the repo's local git exclude, idempotently. Best-effort. */
function excludeFromGit(repoPath: string, pattern: string): void {
  try {
    const gitDir = execFileSync('git', ['-C', repoPath, 'rev-parse', '--git-common-dir'], {
      encoding: 'utf8',
    }).trim();
    const excludePath = path.isAbsolute(gitDir)
      ? path.join(gitDir, 'info', 'exclude')
      : path.join(repoPath, gitDir, 'info', 'exclude');
    const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
    if (!current.split('\n').some((l) => l.trim() === pattern)) {
      appendFileSync(excludePath, `${current.endsWith('\n') || !current ? '' : '\n'}${pattern}\n`);
    }
  } catch {
    // No git exclude available — the file just shows as untracked; acceptable.
  }
}
