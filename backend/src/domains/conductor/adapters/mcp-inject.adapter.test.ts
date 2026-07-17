/**
 * `.mcp.json` injection — the per-worktree Recoder toolbelt writer.
 *
 * Proves: the written config registers the governed `recoder` server (command +
 * args + non-secret env) and is SECRET-FREE even when a secret-looking value is
 * passed; the write is MERGE-SAFE (other servers + unknown top-level keys survive)
 * and IDEMPOTENT (a re-run does not rewrite); an unparseable existing file is left
 * untouched; a blank worktree is a truthful skip; and `.mcp.json` is git-excluded.
 */
import { describe, it, expect } from 'vitest';
import {
  injectRecoderMcp,
  buildRecoderServerEntry,
  type McpInjectIo,
  type RecoderMcpInjectConfig,
} from './mcp-inject.adapter.js';

/** An in-memory fs + git-exclude seam (no real disk / git). */
function makeIo(seed: Record<string, string> = {}): McpInjectIo & {
  files: Map<string, string>;
  excluded: string[];
} {
  const files = new Map<string, string>(Object.entries(seed));
  const excluded: string[] = [];
  return {
    files,
    excluded,
    async readFile(path) {
      return files.has(path) ? files.get(path)! : null;
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
    async ensureGitExcluded(_worktreePath, entry) {
      excluded.push(entry);
    },
  };
}

const CONFIG: RecoderMcpInjectConfig = {
  command: 'node',
  args: ['/opt/recoder/mcp/recoder-a2a-server.js'],
  internalUrl: 'http://127.0.0.1:3100',
  agentId: 'claude_code',
};

describe('injectRecoderMcp', () => {
  it('writes the governed recoder server entry with non-secret env', async () => {
    const io = makeIo();
    const result = await injectRecoderMcp('/work/tree', CONFIG, io);

    expect(result.injected).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.path).toBe('/work/tree/.mcp.json');

    const doc = JSON.parse(io.files.get('/work/tree/.mcp.json')!);
    expect(doc.mcpServers.recoder).toEqual({
      command: 'node',
      args: ['/opt/recoder/mcp/recoder-a2a-server.js'],
      env: {
        RECODER_INTERNAL_URL: 'http://127.0.0.1:3100',
        RECODER_AGENT_ID: 'claude_code',
      },
    });
  });

  it('is SECRET-FREE — drops any secret-looking key from the written env', async () => {
    const io = makeIo();
    await injectRecoderMcp(
      '/work/tree',
      {
        ...CONFIG,
        extraEnv: {
          INTERNAL_SERVICE_KEY: 'sk_super_secret',
          RECODER_SESSION_TOKEN: 'tok_123',
          RECODER_DOCKER_URL: 'http://127.0.0.1:3100',
        },
      },
      io,
    );

    const text = io.files.get('/work/tree/.mcp.json')!;
    expect(text).not.toContain('sk_super_secret');
    expect(text).not.toContain('tok_123');
    const env = JSON.parse(text).mcpServers.recoder.env;
    expect(env.INTERNAL_SERVICE_KEY).toBeUndefined();
    expect(env.RECODER_SESSION_TOKEN).toBeUndefined();
    // A non-secret hint IS kept.
    expect(env.RECODER_DOCKER_URL).toBe('http://127.0.0.1:3100');
  });

  it('is IDEMPOTENT — a second identical injection does not rewrite', async () => {
    const io = makeIo();
    const first = await injectRecoderMcp('/work/tree', CONFIG, io);
    const before = io.files.get('/work/tree/.mcp.json');

    const second = await injectRecoderMcp('/work/tree', CONFIG, io);
    const after = io.files.get('/work/tree/.mcp.json');

    expect(first.changed).toBe(true);
    expect(second.injected).toBe(true);
    expect(second.changed).toBe(false);
    expect(after).toBe(before);
    // git-exclude is re-asserted on every run (both attempts recorded).
    expect(io.excluded).toEqual(['.mcp.json', '.mcp.json']);
  });

  it('is MERGE-SAFE — preserves other servers and unknown top-level keys', async () => {
    const io = makeIo({
      '/work/tree/.mcp.json': JSON.stringify({
        $schema: 'https://example.com/mcp.json',
        mcpServers: {
          other: { command: 'python', args: ['./other.py'] },
        },
      }),
    });

    const result = await injectRecoderMcp('/work/tree', CONFIG, io);
    expect(result.changed).toBe(true);

    const doc = JSON.parse(io.files.get('/work/tree/.mcp.json')!);
    expect(doc.$schema).toBe('https://example.com/mcp.json');
    expect(doc.mcpServers.other).toEqual({ command: 'python', args: ['./other.py'] });
    expect(doc.mcpServers.recoder.command).toBe('node');
  });

  it('upserts (replaces) a stale recoder entry without touching siblings', async () => {
    const io = makeIo({
      '/work/tree/.mcp.json': JSON.stringify({
        mcpServers: {
          recoder: { command: 'node', args: ['/old/path.js'] },
          other: { command: 'sh', args: [] },
        },
      }),
    });

    await injectRecoderMcp('/work/tree', CONFIG, io);
    const doc = JSON.parse(io.files.get('/work/tree/.mcp.json')!);
    expect(doc.mcpServers.recoder.args).toEqual(['/opt/recoder/mcp/recoder-a2a-server.js']);
    expect(doc.mcpServers.other).toEqual({ command: 'sh', args: [] });
  });

  it('leaves an UNPARSEABLE existing .mcp.json untouched (never destroys agent config)', async () => {
    const io = makeIo({ '/work/tree/.mcp.json': '{ not valid json ' });
    const result = await injectRecoderMcp('/work/tree', CONFIG, io);

    expect(result.injected).toBe(false);
    expect(result.reason).toMatch(/not valid json/i);
    expect(io.files.get('/work/tree/.mcp.json')).toBe('{ not valid json ');
  });

  it('degrades truthfully when there is no worktree path', async () => {
    const io = makeIo();
    for (const path of [undefined, null, '   ']) {
      const result = await injectRecoderMcp(path, CONFIG, io);
      expect(result.injected).toBe(false);
      expect(result.reason).toMatch(/no worktree/i);
    }
    expect(io.files.size).toBe(0);
  });

  it('omits the env block entirely when no non-secret hints are provided', async () => {
    const entry = buildRecoderServerEntry({ args: ['/x.js'] });
    expect(entry).toEqual({ command: 'node', args: ['/x.js'] });
    expect('env' in entry).toBe(false);
  });
});
