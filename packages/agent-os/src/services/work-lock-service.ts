import type { WorkLock } from '../domain';
import { lockCoversPath } from '../domain';

export type AcquireWorkLockInput = {
  existingLocks?: WorkLock[];
  lockId?: string;
  spaceId: string;
  repo?: string;
  pathGlob: string;
  ownerAgentId: string;
  taskId: string;
  ttlMs?: number;
  now?: string;
};

export type AcquireWorkLockResult = {
  lock: WorkLock;
  locks: WorkLock[];
};

export type ReleaseWorkLockInput = {
  lockId: string;
  ownerAgentId?: string;
  taskId?: string;
};

export type FindCoveringWorkLockInput = {
  locks: WorkLock[];
  spaceId: string;
  repo?: string;
  path: string;
  ownerAgentId: string;
  taskId: string;
  now?: string;
};

export class WorkLockConflictError extends Error {
  readonly conflicts: WorkLock[];

  constructor(conflicts: WorkLock[]) {
    super(`Work lock conflicts with ${conflicts.length} active lock(s).`);
    this.name = 'WorkLockConflictError';
    this.conflicts = conflicts;
  }
}

export class WorkLockService {
  listActive(locks: WorkLock[], now = new Date().toISOString()): WorkLock[] {
    const nowMs = Date.parse(now);
    return locks.filter((lock) => Date.parse(lock.expiresAt) > nowMs);
  }

  acquire(input: AcquireWorkLockInput): AcquireWorkLockResult {
    const now = input.now ?? new Date().toISOString();
    const activeLocks = this.listActive(input.existingLocks ?? [], now);
    const conflicts = this.findConflicts(activeLocks, input);

    if (conflicts.length > 0) {
      throw new WorkLockConflictError(conflicts);
    }

    const lock: WorkLock = {
      lockId: input.lockId ?? createWorkLockId(input, now),
      spaceId: input.spaceId,
      repo: input.repo,
      pathGlob: input.pathGlob,
      ownerAgentId: input.ownerAgentId,
      taskId: input.taskId,
      acquiredAt: now,
      expiresAt: new Date(Date.parse(now) + (input.ttlMs ?? 30 * 60 * 1000)).toISOString(),
    };

    return {
      lock,
      locks: [...activeLocks, lock],
    };
  }

  release(locks: WorkLock[], input: ReleaseWorkLockInput): WorkLock[] {
    return locks.filter((lock) => {
      if (lock.lockId !== input.lockId) {
        return true;
      }
      if (input.ownerAgentId && lock.ownerAgentId !== input.ownerAgentId) {
        return true;
      }
      if (input.taskId && lock.taskId !== input.taskId) {
        return true;
      }
      return false;
    });
  }

  findCoveringLock(input: FindCoveringWorkLockInput): WorkLock | undefined {
    return this.listActive(input.locks, input.now).find((lock) => {
      return lock.spaceId === input.spaceId
        && sameRepo(lock.repo, input.repo)
        && lock.ownerAgentId === input.ownerAgentId
        && lock.taskId === input.taskId
        && lockCoversPath(lock, input.path);
    });
  }

  hasCoveringLock(input: FindCoveringWorkLockInput): boolean {
    return this.findCoveringLock(input) !== undefined;
  }

  findConflicts(locks: WorkLock[], input: Pick<AcquireWorkLockInput, 'spaceId' | 'repo' | 'pathGlob' | 'ownerAgentId' | 'taskId'>): WorkLock[] {
    return locks.filter((lock) => {
      if (lock.spaceId !== input.spaceId || !sameRepo(lock.repo, input.repo)) {
        return false;
      }
      if (lock.ownerAgentId === input.ownerAgentId && lock.taskId === input.taskId) {
        return false;
      }
      return globsOverlap(lock.pathGlob, input.pathGlob);
    });
  }
}

function createWorkLockId(input: AcquireWorkLockInput, now: string): string {
  const base = [
    input.spaceId,
    input.repo ?? 'repo',
    input.pathGlob,
    input.ownerAgentId,
    input.taskId,
    now,
  ].join(':');

  return `work_lock_${Date.now()}_${Math.abs(hashString(base)).toString(16)}`;
}

function sameRepo(left?: string, right?: string): boolean {
  return (left ?? '') === (right ?? '');
}

function globsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeGlob(left);
  const normalizedRight = normalizeGlob(right);
  const leftRoot = globRoot(normalizedLeft);
  const rightRoot = globRoot(normalizedRight);

  return normalizedLeft === normalizedRight
    || normalizedLeft === '**/*'
    || normalizedRight === '**/*'
    || rootContains(leftRoot, rightRoot)
    || rootContains(rightRoot, leftRoot);
}

function normalizeGlob(glob: string): string {
  return glob.replace(/\\/g, '/').replace(/^\.\//, '');
}

function globRoot(glob: string): string {
  return glob
    .replace(/\/\*\*.*$/, '')
    .replace(/\/\*.*$/, '')
    .replace(/\*.*$/, '')
    .replace(/\/$/, '');
}

function rootContains(parent: string, child: string): boolean {
  if (!parent) {
    return true;
  }
  return child === parent || child.startsWith(`${parent}/`);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}
