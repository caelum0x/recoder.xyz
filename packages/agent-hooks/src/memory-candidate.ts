export type HookMemoryCandidate = {
  scope: 'space' | 'repo' | 'user' | 'org';
  title: string;
  body: string;
  evidence: {
    task_id: string;
    artifact_id: string;
  };
  expires_at?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCandidate(value: unknown, taskId?: string, artifactId?: string): HookMemoryCandidate | null {
  if (!isRecord(value)) return null;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const body = typeof value.body === 'string' ? value.body.trim() : '';
  if (!title || !body) return null;
  const rawScope = typeof value.scope === 'string' ? value.scope : 'repo';
  const scope = rawScope === 'space' || rawScope === 'user' || rawScope === 'org' ? rawScope : 'repo';
  const evidence = isRecord(value.evidence) ? value.evidence : {};
  const evidenceTaskId = typeof evidence.task_id === 'string' ? evidence.task_id : taskId;
  const evidenceArtifactId = typeof evidence.artifact_id === 'string' ? evidence.artifact_id : artifactId;
  if (!evidenceTaskId || !evidenceArtifactId) return null;

  return {
    scope,
    title,
    body,
    evidence: {
      task_id: evidenceTaskId,
      artifact_id: evidenceArtifactId,
    },
    expires_at: typeof value.expires_at === 'string' ? value.expires_at : null,
  };
}

export function extractMemoryCandidates(input: unknown, taskId?: string, artifactId?: string): HookMemoryCandidate[] {
  const source = isRecord(input) && isRecord(input.data) ? input.data : input;
  const values: unknown[] = [];

  if (isRecord(source)) {
    if (Array.isArray(source.memoryCandidates)) values.push(...source.memoryCandidates);
    if (source.memoryCandidate) values.push(source.memoryCandidate);
  }

  return values
    .map((value) => readCandidate(value, taskId, artifactId))
    .filter((candidate): candidate is HookMemoryCandidate => candidate !== null);
}
