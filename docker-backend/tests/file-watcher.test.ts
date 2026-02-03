import { describe, it, expect, vi, afterEach } from 'vitest';
import { fileWatcher } from '../src/file-watcher';

const createWatcher = () => new (fileWatcher as any).constructor();

describe('file watcher dedup/reconnect behavior', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deduplicates rapid duplicate events (reconnect-style replay)', () => {
    vi.useFakeTimers();
    const watcher = createWatcher() as any;
    const projectId = 'project-test';
    const change = { type: 'modify', path: 'src/app.ts', timestamp: 1000 };

    vi.setSystemTime(new Date('2026-02-02T00:00:00Z'));
    const first = watcher.deduplicateEvents(projectId, [change]);
    expect(first).toHaveLength(1);

    vi.setSystemTime(new Date('2026-02-02T00:00:01Z'));
    const dup = watcher.deduplicateEvents(projectId, [change]);
    expect(dup).toHaveLength(0);

    vi.setSystemTime(new Date('2026-02-02T00:00:04Z'));
    const after = watcher.deduplicateEvents(projectId, [change]);
    expect(after).toHaveLength(1);
  });

  it('expires write exclusions after the window', () => {
    vi.useFakeTimers();
    const watcher = createWatcher() as any;
    const projectId = 'project-test';

    vi.setSystemTime(new Date('2026-02-02T00:00:00Z'));
    watcher.excludeWrittenPaths(projectId, ['src/notes.md']);
    expect(watcher.isPathExcluded(projectId, 'src/notes.md')).toBe(true);

    vi.setSystemTime(new Date('2026-02-02T00:00:06Z'));
    expect(watcher.isPathExcluded(projectId, 'src/notes.md')).toBe(false);
  });
});
