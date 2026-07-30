/**
 * Committed `.recoder/settings.json` parser + reader.
 *
 * Proves: valid config parses; every malformed/absent field falls back to its
 * default (scripts trimmed, ports positive-int guarded); a non-object payload
 * yields the full default; and the reader maps an absent / unreadable / invalid
 * -JSON file onto the defaults WITHOUT throwing (a broken config never fails a
 * launch).
 */
import { describe, it, expect } from 'vitest';
import {
  parseRepoConfigFile,
  readRepoConfigFile,
  defaultRepoConfigFile,
  REPO_CONFIG_FILENAME,
  type RepoConfigFs,
} from './repo-config-file.js';
import { DEFAULT_PORT_BASE, DEFAULT_PORT_SPAN } from './workspace-port.js';

describe('parseRepoConfigFile', () => {
  it('parses a full valid config, trimming scripts', () => {
    expect(
      parseRepoConfigFile({
        scripts: { setup: '  pnpm install  ', run: 'pnpm dev -p $RECODER_PORT' },
        port: { base: 5000, span: 50 },
      }),
    ).toEqual({
      scripts: { setup: 'pnpm install', run: 'pnpm dev -p $RECODER_PORT' },
      port: { base: 5000, span: 50 },
    });
  });

  it('falls back to defaults for a non-object payload', () => {
    expect(parseRepoConfigFile(null)).toEqual(defaultRepoConfigFile());
    expect(parseRepoConfigFile('nope')).toEqual(defaultRepoConfigFile());
    expect(parseRepoConfigFile(42)).toEqual(defaultRepoConfigFile());
  });

  it('coerces malformed fields to their defaults', () => {
    const parsed = parseRepoConfigFile({
      scripts: { setup: 7, run: null },
      port: { base: -1, span: 1.5 },
    });
    expect(parsed).toEqual({
      scripts: { setup: '', run: '' },
      port: { base: DEFAULT_PORT_BASE, span: DEFAULT_PORT_SPAN },
    });
  });

  it('tolerates a partial config (missing sections)', () => {
    expect(parseRepoConfigFile({ scripts: { run: 'make dev' } })).toEqual({
      scripts: { setup: '', run: 'make dev' },
      port: { base: DEFAULT_PORT_BASE, span: DEFAULT_PORT_SPAN },
    });
  });
});

describe('readRepoConfigFile', () => {
  function fsReturning(content: string | Error): RepoConfigFs {
    return {
      readFile: async (path: string) => {
        expect(path.endsWith(REPO_CONFIG_FILENAME)).toBe(true);
        if (content instanceof Error) throw content;
        return content;
      },
    };
  }

  it('reads and parses a valid committed config', async () => {
    const cfg = await readRepoConfigFile(
      '/wt/ws_1',
      fsReturning(JSON.stringify({ scripts: { run: 'pnpm dev' }, port: { base: 6000, span: 10 } })),
    );
    expect(cfg.scripts.run).toBe('pnpm dev');
    expect(cfg.port).toEqual({ base: 6000, span: 10 });
  });

  it('degrades to defaults when the file is absent/unreadable', async () => {
    const cfg = await readRepoConfigFile('/wt/ws_1', fsReturning(new Error('ENOENT')));
    expect(cfg).toEqual(defaultRepoConfigFile());
  });

  it('degrades to defaults on invalid JSON (never throws)', async () => {
    const cfg = await readRepoConfigFile('/wt/ws_1', fsReturning('{ not: valid json'));
    expect(cfg).toEqual(defaultRepoConfigFile());
  });
});
