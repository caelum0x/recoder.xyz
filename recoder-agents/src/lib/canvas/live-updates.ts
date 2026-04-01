const STALE_EVENT_TTL_MS = 10_000;

export function normalizeCanvasWorkspacePath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;

  const normalized = filePath.trim().replace(/[?#].*$/, '').replace(/^\/+/, '');
  if (!normalized) return null;

  if (normalized.startsWith('workspace/')) {
    return `/${normalized}`;
  }

  return `/workspace/${normalized}`;
}

export function doesCanvasRefreshMatchFilePath(
  filePath: string | null | undefined,
  eventPath: string | null | undefined,
): boolean {
  const normalizedFilePath = normalizeCanvasWorkspacePath(filePath);
  const normalizedEventPath = normalizeCanvasWorkspacePath(eventPath);

  return normalizedFilePath !== null && normalizedFilePath === normalizedEventPath;
}

export function consumePendingCanvasRefreshEvent(
  filePath: string | null | undefined,
  pendingEvents?: Map<string, number>,
  now = Date.now(),
): boolean {
  if (!pendingEvents) return false;

  for (const [eventPath, timestamp] of pendingEvents.entries()) {
    if (now - timestamp >= STALE_EVENT_TTL_MS) {
      pendingEvents.delete(eventPath);
      continue;
    }

    if (doesCanvasRefreshMatchFilePath(filePath, eventPath)) {
      pendingEvents.delete(eventPath);
      return true;
    }
  }

  return false;
}
