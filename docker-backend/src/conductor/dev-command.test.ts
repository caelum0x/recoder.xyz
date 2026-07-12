/**
 * dev-command — detectDevCommand picks a runnable dev command from a project's
 * files (package.json scripts + lockfile, else Python/static entrypoints).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectDevCommand } from './dev-command';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recoder-devcmd-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name: string, content: string): void {
  writeFileSync(join(dir, name), content);
}

describe('detectDevCommand', () => {
  it('uses pnpm when a pnpm lockfile is present', async () => {
    write('package.json', JSON.stringify({ scripts: { dev: 'vite' } }));
    write('pnpm-lock.yaml', '');
    expect(await detectDevCommand(dir)).toEqual({ command: 'pnpm run dev', label: 'pnpm run dev' });
  });

  it('falls back to npm run when no lockfile identifies the manager', async () => {
    write('package.json', JSON.stringify({ scripts: { start: 'node server.js' } }));
    expect(await detectDevCommand(dir)).toEqual({ command: 'npm run start', label: 'npm run start' });
  });

  it('prefers dev over start', async () => {
    write('package.json', JSON.stringify({ scripts: { start: 'x', dev: 'y' } }));
    expect((await detectDevCommand(dir))?.command).toBe('npm run dev');
  });

  it('detects a Django project via manage.py', async () => {
    write('manage.py', '# django');
    expect((await detectDevCommand(dir))?.command).toBe('python manage.py runserver');
  });

  it('detects a static site via index.html', async () => {
    write('index.html', '<html></html>');
    expect((await detectDevCommand(dir))?.command).toContain('http.server');
  });

  it('returns null for an unrecognized project (never guesses a failing command)', async () => {
    write('notes.txt', 'hello');
    expect(await detectDevCommand(dir)).toBeNull();
  });

  it('degrades to the other detectors when package.json is malformed', async () => {
    write('package.json', '{ not json');
    write('main.py', 'print(1)');
    expect((await detectDevCommand(dir))?.command).toBe('python main.py');
  });
});
