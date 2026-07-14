function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectFragments(value: unknown, seen: Set<string>): void {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized) seen.add(normalized);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectFragments(item, seen);
    return;
  }

  if (!isRecord(value)) return;

  for (const key of ['chunk', 'delta', 'text', 'content', 'output', 'message', 'result']) {
    collectFragments(value[key], seen);
  }

  if (Array.isArray(value.parts)) {
    for (const part of value.parts) collectFragments(part, seen);
  }
}

export function extractTaskStreamChunk(value: unknown): string {
  const seen = new Set<string>();
  collectFragments(value, seen);
  return Array.from(seen).join('\n').trim();
}

export function isTerminalTaskState(state: unknown): boolean {
  if (typeof state !== 'string') return false;
  return new Set([
    'completed',
    'complete',
    'failed',
    'cancelled',
    'canceled',
    'stopped',
    'done',
    'success',
    'succeeded',
  ]).has(state.toLowerCase());
}
