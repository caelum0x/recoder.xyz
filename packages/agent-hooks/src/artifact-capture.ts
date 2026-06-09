export type AgentHookArtifact = {
  key: string;
  artifact_type: 'log' | 'diff' | 'test_result' | 'summary' | 'custom';
  mime_type: string;
  content: string;
  path?: string;
  metadata: Record<string, unknown>;
};

export type ArtifactCaptureInput = {
  taskId?: string;
  runId?: string;
  hook?: string;
  changedFiles?: string[];
  command?: string;
  exitCode?: number;
  output?: string;
  verification?: {
    command?: string;
    status?: 'passed' | 'failed' | 'skipped';
  };
};

export function createArtifactCapture(input: ArtifactCaptureInput): AgentHookArtifact {
  const taskId = input.taskId || 'unknown-task';
  const hook = input.hook || 'agent-hook';
  const key = `${hook}:${taskId}:${Date.now()}`;
  const content = JSON.stringify({
    taskId: input.taskId,
    runId: input.runId,
    hook,
    changedFiles: input.changedFiles ?? [],
    command: input.command,
    exitCode: input.exitCode,
    output: input.output,
    verification: input.verification,
    capturedAt: new Date().toISOString(),
  }, null, 2);

  return {
    key,
    artifact_type: input.verification ? 'test_result' : 'custom',
    mime_type: 'application/json',
    path: `.recoder/artifacts/${key.replace(/[^A-Za-z0-9._:-]/g, '_')}.json`,
    content,
    metadata: {
      type: 'agent_hook_artifact',
      hook,
      changedFileCount: input.changedFiles?.length ?? 0,
      verificationStatus: input.verification?.status,
    },
  };
}
