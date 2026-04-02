import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter, Readable, Writable } from 'stream';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ChildProcess } from 'child_process';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { spawn } from 'child_process';

function createMockChildProcess({
  emitSpawn = true,
  exitCode = null as number | null,
}: {
  emitSpawn?: boolean;
  exitCode?: number | null;
} = {}): ChildProcess {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });

  const proc = Object.assign(new EventEmitter(), {
    pid: 12345,
    stdin,
    stdout,
    stderr,
    stdio: [stdin, stdout, stderr, null, null] as ChildProcess['stdio'],
    killed: false,
    kill: vi.fn(() => {
      (proc as any).killed = true;
      (proc as any).exitCode = 0;
      proc.emit('exit', 0, null);
      return true;
    }),
    send: vi.fn(),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
    exitCode,
    signalCode: null as NodeJS.Signals | null,
    spawnargs: [] as string[],
    spawnfile: '',
    connected: false,
    channel: undefined,
    [Symbol.dispose]: vi.fn(),
  }) as unknown as ChildProcess;

  if (emitSpawn) {
    process.nextTick(() => proc.emit('spawn'));
  }

  return proc;
}

describe('zrok-preview', () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = path.join(os.tmpdir(), `zrok-preview-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(path.join(tempDir, '.zrok2'), { recursive: true });
    process.env.ZROK_TOKEN = 'enable-token';
    process.env.ZROK_FRONTEND = 'preview.recoder.xyz';
    process.env.ZROK_PUBLIC_BASE_DOMAIN = 'recoder.xyz';
    process.env.ZROK_STATE_DIR = tempDir;
    process.env.ZROK2_API_ENDPOINT = 'http://127.0.0.1:18080';
    writeFileSync(path.join(tempDir, '.zrok2', 'environment.json'), JSON.stringify({
      zrok_token: 'enable-token',
      ziti_identity: 'ENV123',
      api_endpoint: 'http://127.0.0.1:18080',
    }));
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    rmSync(tempDir, { force: true, recursive: true });
    const mod = await import('../zrok-preview.js');
    mod.__resetZrokPreviewStateForTests();
  });

  it('creates and destroys a zrok2 preview share with the share subprocess lifecycle', async () => {
    const shareProc = createMockChildProcess();
    const deleteProc = createMockChildProcess({ emitSpawn: false });

    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'share' && args[1] === 'public') {
        process.nextTick(() => {
          shareProc.stderr!.push('access your zrok share at the following endpoints:\n');
          shareProc.stderr!.push('  abc123.preview.recoder.xyz\n');
        });
        return shareProc;
      }

      if (args[0] === 'delete' && args[1] === 'share') {
        process.nextTick(() => deleteProc.emit('exit', 0, null));
        return deleteProc;
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`);
    });

    const mod = await import('../zrok-preview.js');

    const created = await mod.createPreviewShare({
      projectId: 'project-1',
      sandboxId: 'sandbox-1',
      sandboxHost: 'sandbox-host',
      targetPort: 5173,
    });

    expect(created).toEqual({
      previewUrl: 'https://preview-abc123.recoder.xyz',
      shareToken: 'abc123',
    });
    expect(mod.getPreviewUrl('project-1')).toBe('https://preview-abc123.recoder.xyz');

    await mod.destroyPreviewShare('project-1');

    const spawnCalls = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1]);

    expect(spawnCalls[0]).toEqual([
      'share',
      'public',
      'http://sandbox-host:5173',
      '--headless',
      '--force-local',
      '--open',
      '-n',
      'public',
    ]);
    expect(spawnCalls).toContainEqual([
      'delete',
      'share',
      'abc123',
      '--envzid',
      'ENV123',
    ]);
    expect(shareProc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(mod.getPreviewUrl('project-1')).toBeNull();
  });

  it('does not expose a fake permanent publish URL for zrok2', async () => {
    const shareProc = createMockChildProcess();

    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'share' && args[1] === 'public') {
        process.nextTick(() => {
          shareProc.stdout!.push('share available at xyz789.preview.recoder.xyz\n');
        });
        return shareProc;
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`);
    });

    const mod = await import('../zrok-preview.js');
    await mod.createPreviewShare({
      projectId: 'project-2',
      sandboxId: 'sandbox-2',
      targetPort: 5173,
    });

    await expect(mod.reservePreviewShare('project-2')).resolves.toBeNull();
  });

  it('normalizes zrok-native frontend endpoints to the public single-label preview hostname', async () => {
    const shareProc = createMockChildProcess();
    const listProc = createMockChildProcess({ emitSpawn: false });

    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'share' && args[1] === 'public') {
        return shareProc;
      }

      if (args[0] === 'list' && args[1] === 'shares' && args[2] === '--json') {
        process.nextTick(() => {
          listProc.stdout!.push(JSON.stringify({
            shares: [{
              envZId: 'ENV123',
              frontendEndpoints: ['list123.preview.recoder.xyz'],
              shareToken: 'list123',
              target: 'http://sandbox-3:5173',
              updatedAt: Date.now(),
            }],
          }));
          listProc.emit('exit', 0, null);
        });
        return listProc;
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`);
    });

    const mod = await import('../zrok-preview.js');
    const created = await mod.createPreviewShare({
      projectId: 'project-3',
      sandboxId: 'sandbox-3',
      targetPort: 5173,
    });

    expect(created).toEqual({
      previewUrl: 'https://preview-list123.recoder.xyz',
      shareToken: 'list123',
    });
    expect(mod.getPreviewUrl('project-3')).toBe('https://preview-list123.recoder.xyz');
  });
});
