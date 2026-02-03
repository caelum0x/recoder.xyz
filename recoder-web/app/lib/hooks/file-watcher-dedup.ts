export interface FileChange {
  type: 'create' | 'modify' | 'delete';
  path: string;
  timestamp: number;
}

export class FileEventDeduper {
  private readonly windowMs: number;
  private readonly events = new Map<string, number>();

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  deduplicate(changes: FileChange[], now: number = Date.now(), onSkip?: (key: string) => void): FileChange[] {
    const unique: FileChange[] = [];
    for (const change of changes) {
      const key = `${change.type}:${change.path}`;
      const lastSeen = this.events.get(key);
      if (lastSeen && now - lastSeen < this.windowMs) {
        onSkip?.(key);
        continue;
      }
      this.events.set(key, now);
      unique.push(change);
    }
    return unique;
  }

  cleanup(now: number = Date.now(), maxAgeMs: number = this.windowMs * 2): void {
    for (const [key, timestamp] of this.events) {
      if (now - timestamp > maxAgeMs) {
        this.events.delete(key);
      }
    }
  }

  clear(): void {
    this.events.clear();
  }
}
