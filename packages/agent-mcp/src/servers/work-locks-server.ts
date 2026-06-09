import type { WorkLock } from '@recoder/agent-os';
import { WorkLockService } from '@recoder/agent-os';
import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

export const workLocksMcpServer: McpServerRegistration = {
  serverId: 'recoder.work_locks',
  kind: 'custom',
  displayName: 'Recoder Work Locks',
  transport: 'http',
  enabled: true,
  toolNames: ['work_locks.list', 'work_locks.acquire', 'work_locks.release'],
};

export type WorkLocksMcpState = {
  listWorkLocks(): WorkLock[];
  replaceWorkLocks(locks: WorkLock[]): WorkLock[] | void | Promise<WorkLock[] | void>;
};

export function registerWorkLocksMcpTools(
  router: McpToolRouter,
  state: WorkLocksMcpState,
  service = new WorkLockService(),
): void {
  router.register(workLocksMcpServer, 'work_locks.list', () => ({
    content: state.listWorkLocks(),
  }));

  router.register(workLocksMcpServer, 'work_locks.acquire', async (input) => {
    const result = service.acquire({
      spaceId: readRequiredString(input.args.spaceId, 'spaceId'),
      pathGlob: readRequiredString(input.args.pathGlob, 'pathGlob'),
      ownerAgentId: readString(input.args.ownerAgentId) ?? input.actor.agentId,
      taskId: readString(input.args.taskId) ?? input.task?.taskId ?? readRequiredString(input.args.taskId, 'taskId'),
      repo: readString(input.args.repo) ?? input.task?.repo,
      ttlMs: readNumber(input.args.ttlMs),
      now: readString(input.args.now),
      existingLocks: state.listWorkLocks(),
    });
    await state.replaceWorkLocks(result.locks);
    return {
      content: result.lock,
      metadata: {
        activeLockCount: result.locks.length,
      },
    };
  });

  router.register(workLocksMcpServer, 'work_locks.release', async (input) => {
    const locks = service.release(state.listWorkLocks(), {
      lockId: readRequiredString(input.args.lockId, 'lockId'),
      ownerAgentId: readString(input.args.ownerAgentId) ?? input.actor.agentId,
      taskId: readString(input.args.taskId) ?? input.task?.taskId,
    });
    await state.replaceWorkLocks(locks);
    return {
      content: locks,
      metadata: {
        activeLockCount: locks.length,
      },
    };
  });
}

function readRequiredString(value: unknown, field: string): string {
  const result = readString(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
