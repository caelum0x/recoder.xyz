export type WorkLock = {
  lockId: string;
  spaceId: string;
  repo?: string;
  pathGlob: string;
  ownerAgentId: string;
  taskId: string;
  acquiredAt: string;
  expiresAt: string;
};

export function lockCoversPath(lock: WorkLock, path: string): boolean {
  const doubleStarToken = '___RECODER_DOUBLE_STAR___';
  const escaped = lock.pathGlob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, doubleStarToken)
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped.replaceAll(doubleStarToken, '.*')}$`).test(path.replace(/\\/g, '/'));
}
