export type ContainerCreationEntry<T> = {
  promise: Promise<T>;
  startedAt: number;
  timeoutId?: NodeJS.Timeout;
};

export function isCreationStale(
  entry: ContainerCreationEntry<unknown>,
  timeoutMs: number,
  now: number = Date.now()
): boolean {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return false;
  return now - entry.startedAt > timeoutMs;
}

export function withCreationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(new Error('Container creation timed out'));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}
