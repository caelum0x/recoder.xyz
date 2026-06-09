import { createDetachedSandboxSession, type SandboxProvider } from './provider';

export function createLocalContainerProvider(): SandboxProvider {
  return {
    id: 'local_container',
    async health() {
      return { status: 'unknown', message: 'Local container provider is descriptor-only until wired.' };
    },
    async create(input) {
      return createDetachedSandboxSession({
        provider: 'local_container',
        taskId: input.task.taskId,
        status: 'creating',
      });
    },
    async stop() {
      return;
    },
  };
}
