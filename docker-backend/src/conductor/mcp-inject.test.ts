/**
 * mcp-inject — the worktree `.mcp.json` that gives every agent Recoder's tools.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeRecoderMcpConfig,
  buildRecoderMcpServerEntry,
  injectRecoderMcp,
} from './mcp-inject';

describe('mergeRecoderMcpConfig (pure)', () => {
  it('creates a fresh config with the recoder stdio server (no secrets)', () => {
    const cfg = mergeRecoderMcpConfig(undefined, '/repo/mcp/recoder-a2a-server.js');
    const servers = cfg.mcpServers as Record<string, unknown>;
    expect(servers.recoder).toEqual({ command: 'node', args: ['/repo/mcp/recoder-a2a-server.js'] });
    // No token/secret keys anywhere in the entry.
    expect(JSON.stringify(cfg)).not.toMatch(/token|secret|key/i);
  });

  it("preserves the user's existing servers, adding recoder alongside", () => {
    const existing = { mcpServers: { mine: { command: 'x' } } };
    const cfg = mergeRecoderMcpConfig(existing, '/s.js');
    const servers = cfg.mcpServers as Record<string, unknown>;
    expect(servers.mine).toEqual({ command: 'x' });
    expect(servers.recoder).toEqual(buildRecoderMcpServerEntry('/s.js'));
  });

  it('never clobbers a user-defined recoder server', () => {
    const existing = { mcpServers: { recoder: { command: 'custom' } } };
    const cfg = mergeRecoderMcpConfig(existing, '/s.js');
    expect((cfg.mcpServers as Record<string, unknown>).recoder).toEqual({ command: 'custom' });
  });
});

describe('injectRecoderMcp (real temp git repo)', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'mcp-inject-'));
    execFileSync('git', ['-C', repo, 'init', '-q']);
    // Point the resolver at a real existing server file.
    const server = path.join(repo, 'fake-recoder-server.js');
    writeFileSync(server, '// stub\n');
    vi.stubEnv('RECODER_MCP_SERVER_PATH', server);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(repo, { recursive: true, force: true });
  });

  it('writes .mcp.json into the worktree and hides it from git', () => {
    const ok = injectRecoderMcp(repo, repo);
    expect(ok).toBe(true);

    const mcpPath = path.join(repo, '.mcp.json');
    expect(existsSync(mcpPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(mcpPath, 'utf8'));
    expect(cfg.mcpServers.recoder.command).toBe('node');

    // git status must NOT show .mcp.json (excluded) — no diff pollution.
    const status = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' });
    expect(status).not.toMatch(/\.mcp\.json/);
  });

  it('is degrade-safe: never throws when the worktree path is invalid', () => {
    // A non-existent worktree dir makes the write fail; injection must swallow
    // it and return false rather than block the agent launch.
    const ok = injectRecoderMcp(path.join(repo, 'no', 'such', 'dir'), repo);
    expect(ok).toBe(false);
  });
});
