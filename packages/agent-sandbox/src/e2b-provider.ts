import { createDetachedSandboxSession, type SandboxProvider } from './provider';

export function createE2BProvider(apiKey?: string): SandboxProvider {
  return {
    id: 'e2b',
    async health() {
      return apiKey
        ? { status: 'unknown', message: 'E2B API key configured; live health not executed.' }
        : { status: 'offline', message: 'E2B_API_KEY is not configured.' };
    },
    async create(input) {
      return createDetachedSandboxSession({
        provider: 'e2b',
        taskId: input.task.taskId,
        status: apiKey ? 'creating' : 'failed',
      });
    },
    async stop() {
      return;
    },
  };
}
