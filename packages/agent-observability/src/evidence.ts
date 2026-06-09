import type { Artifact, RunEvent } from '@recoder/agent-os';

export type RunEvidencePack = {
  taskId: string;
  runId: string;
  artifacts: Artifact[];
  events: RunEvent[];
  generatedAt: string;
};

export function createRunEvidencePack(input: Omit<RunEvidencePack, 'generatedAt'>): RunEvidencePack {
  return {
    ...input,
    generatedAt: new Date().toISOString(),
  };
}
