import { createDetachedSandboxSession, type SandboxProvider } from './provider';

export function createDaytonaProvider(endpoint?: string): SandboxProvider {
  return {
    id: 'daytona',
    async health() {
      return endpoint
        ? { status: 'unknown', message: `Daytona endpoint configured: ${endpoint}` }
        : { status: 'offline', message: 'RECODER_DAYTONA_URL is not configured.' };
    },
    async create(input) {
      return createDetachedSandboxSession({
        provider: 'daytona',
        taskId: input.task.taskId,
        status: endpoint ? 'creating' : 'failed',
      });
    },
    async stop() {
      return;
    },
  };
}
