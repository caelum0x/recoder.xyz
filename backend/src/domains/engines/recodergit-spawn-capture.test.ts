import { describe, it, expect } from 'vitest';
import { spawnCapture } from './recodergit-service.js';

describe('spawnCapture — bounded against DoS (recoder-4ob6)', () => {
  it('kills and rejects a command that exceeds the wall-clock timeout', async () => {
    await expect(spawnCapture('sleep', ['5'], process.cwd(), { timeoutMs: 150 })).rejects.toThrow(/timed out/);
  });

  it('kills and rejects a command whose output exceeds the byte cap', async () => {
    await expect(
      spawnCapture('sh', ['-c', 'head -c 200000 /dev/zero'], process.cwd(), { maxOutputBytes: 1024 }),
    ).rejects.toThrow(/output exceeded/);
  });

  it('captures normal output within the bounds', async () => {
    const res = await spawnCapture('sh', ['-c', 'printf hello'], process.cwd(), { timeoutMs: 5000 });
    expect(res.stdout).toBe('hello');
    expect(res.code).toBe(0);
  });
});
