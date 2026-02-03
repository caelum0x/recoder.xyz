import { describe, it, expect } from 'vitest';
import { FileEventDeduper, type FileChange } from '~/lib/hooks/file-watcher-dedup';

describe('FileEventDeduper', () => {
  it('filters duplicates inside window and allows after window', () => {
    const deduper = new FileEventDeduper(3000);
    const base: FileChange = { type: 'modify', path: 'src/a.ts', timestamp: 0 };

    const first = deduper.deduplicate([base], 1000);
    expect(first.length).toBe(1);

    const dup = deduper.deduplicate([base], 2000);
    expect(dup.length).toBe(0);

    const after = deduper.deduplicate([base], 5000);
    expect(after.length).toBe(1);
  });

  it('cleans up stale entries', () => {
    const deduper = new FileEventDeduper(3000);
    const change: FileChange = { type: 'create', path: 'src/b.ts', timestamp: 0 };

    deduper.deduplicate([change], 1000);
    deduper.cleanup(10000, 2000);

    const again = deduper.deduplicate([change], 10001);
    expect(again.length).toBe(1);
  });
});
