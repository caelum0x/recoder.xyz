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

function createJsonCommandProcess(payload: unknown): ChildProcess {
  const proc = createMockChildProcess({ emitSpawn: false });
  process.nextTick(() => {
    proc.stdout!.emit('data', Buffer.from(JSON.stringify(payload)));
    process.nextTick(() => proc.emit('exit', 0, null));
  });
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

    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'share' && args[1] === 'public') {
        return shareProc;
      }

      if (args[0] === 'list' && args[1] === 'shares' && args[2] === '--json') {
        return createJsonCommandProcess({
          shares: [{
            envZId: 'ENV123',
            frontendEndpoints: ['abc123.preview.recoder.xyz'],
            shareToken: 'abc123',
            target: 'http://sandbox-host:5173',
            updatedAt: Date.now(),
          }],
        });
      }

      if (args[0] === 'delete' && args[1] === 'share') {
        return createJsonCommandProcess({});
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

  it('creates and destroys a persistent published share using a reserved public name', async () => {
    const shareProc = createMockChildProcess();

    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'list' && args[1] === 'names' && args[2] === '-n' && args[3] === 'public' && args[4] === '--json') {
        return createJsonCommandProcess([]);
      }

      if (args[0] === 'share' && args[1] === 'public') {
        return shareProc;
      }

      if (args[0] === 'create' && args[1] === 'name') {
        return createJsonCommandProcess({});
      }

      if (args[0] === 'list' && args[1] === 'shares' && args[2] === '--json') {
        return createJsonCommandProcess({
          shares: [{
            envZId: 'ENV123',
            frontendEndpoints: ['project-2.preview.recoder.xyz'],
            shareToken: 'shr999',
            target: '/tmp/published/project-2',
            updatedAt: Date.now(),
          }],
        });
      }

      if (args[0] === 'delete' && args[1] === 'share') {
        return createJsonCommandProcess({});
      }

      if (args[0] === 'delete' && args[1] === 'name') {
        return createJsonCommandProcess({});
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`);
    });

    const mod = await import('../zrok-preview.js');
    const created = await mod.ensurePublishedShare({
      projectId: 'project-2',
      publishedPath: '/tmp/published/project-2',
    });

    expect(created).toEqual({
      previewUrl: 'https://preview-project-2.recoder.xyz',
      shareToken: 'shr999',
    });
    expect(mod.getPublishedShareUrl('project-2')).toBe('https://preview-project-2.recoder.xyz');

    await mod.destroyPublishedShare('project-2', { deleteName: true });

    const spawnCalls = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1]);

    expect(spawnCalls).toContainEqual([
      'create',
      'name',
      '-n',
      'public',
      'project-2',
    ]);
    expect(spawnCalls).toContainEqual([
      'share',
      'public',
      '/tmp/published/project-2',
      '--backend-mode',
      'web',
      '--headless',
      '--force-local',
      '--open',
      '-n',
      'public:project-2',
    ]);
    expect(spawnCalls).toContainEqual([
      'delete',
      'share',
      'shr999',
      '--envzid',
      'ENV123',
    ]);
    expect(spawnCalls).toContainEqual([
      'delete',
      'name',
      '-n',
      'public',
      'project-2',
    ]);
    expect(shareProc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(mod.getPublishedShareUrl('project-2')).toBeNull();
  });

  it('normalizes zrok-native frontend endpoints to the public single-label preview hostname', async () => {
    const shareProc = createMockChildProcess();

    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'share' && args[1] === 'public') {
        return shareProc;
      }

      if (args[0] === 'list' && args[1] === 'shares' && args[2] === '--json') {
        return createJsonCommandProcess({
          shares: [{
            envZId: 'ENV123',
            frontendEndpoints: ['list123.preview.recoder.xyz'],
            shareToken: 'list123',
            target: 'http://sandbox-3:5173',
            updatedAt: Date.now(),
          }],
        });
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
