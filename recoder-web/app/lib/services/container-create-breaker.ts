const DEFAULT_CONTAINER_CREATE_COOLDOWN_MS = 30_000;

interface ContainerCreateFailureEntry {
  message: string;
  retryAt: number;
}

export interface ContainerCreateCooldownState {
  message: string;
  retryAfterMs: number;
  retryAt: number;
}

const containerCreateFailures = new Map<string, ContainerCreateFailureEntry>();

export function getContainerCreateCooldown(
  projectId: string,
  now: number = Date.now()
): ContainerCreateCooldownState | null {
  const entry = containerCreateFailures.get(projectId);

  if (!entry) {
    return null;
  }

  const retryAfterMs = entry.retryAt - now;

  if (retryAfterMs <= 0) {
    containerCreateFailures.delete(projectId);
    return null;
  }

  return {
    message: entry.message,
    retryAfterMs,
    retryAt: entry.retryAt,
  };
}

export function shouldAttemptContainerCreate(
  projectId: string,
  options?: {
    now?: number;
    bypassCooldown?: boolean;
  }
): { allowed: true } | ({ allowed: false } & ContainerCreateCooldownState) {
  if (options?.bypassCooldown) {
    return { allowed: true };
  }

  const activeCooldown = getContainerCreateCooldown(projectId, options?.now);

  if (!activeCooldown) {
    return { allowed: true };
  }

  return {
    allowed: false,
    ...activeCooldown,
  };
}

export function noteContainerCreateFailure(
  projectId: string,
  message: string,
  options?: {
    now?: number;
    cooldownMs?: number;
  }
): ContainerCreateCooldownState {
  const now = options?.now ?? Date.now();
  const retryAt = now + (options?.cooldownMs ?? DEFAULT_CONTAINER_CREATE_COOLDOWN_MS);
  const normalizedMessage = message.trim() || 'Container creation failed.';

  containerCreateFailures.set(projectId, {
    message: normalizedMessage,
    retryAt,
  });

  return {
    message: normalizedMessage,
    retryAfterMs: retryAt - now,
    retryAt,
  };
}

export function clearContainerCreateFailure(projectId?: string) {
  if (projectId) {
    containerCreateFailures.delete(projectId);
    return;
  }

  containerCreateFailures.clear();
}

export function resetContainerCreateBreakerForTests() {
  containerCreateFailures.clear();
}

