export type BeadsIssueType = 'bug' | 'feature' | 'task' | 'epic' | 'chore' | string;

export type BeadsIssue = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: number;
  issue_type?: BeadsIssueType;
  assignee?: string;
  owner?: string;
  labels?: string[];
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
};

export type BeadsTaskMetadata = {
  intent?: string;
  runtimeHint?: string;
  reviewRuntime?: string;
  risk?: 'low' | 'medium' | 'high' | string;
  targetPaths: string[];
  forbiddenPaths: string[];
  verify: string[];
  requiredArtifacts: string[];
  approvalRequired: string[];
  dependsOn: string[];
};

function parseList(description: string, key: string): string[] {
  const line = description
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().toLowerCase().startsWith(`${key.toLowerCase()}:`));
  if (!line) {
    return [];
  }

  return line
    .slice(line.indexOf(':') + 1)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseScalar(description: string, key: string): string | undefined {
  const line = description
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().toLowerCase().startsWith(`${key.toLowerCase()}:`));
  return line?.slice(line.indexOf(':') + 1).trim() || undefined;
}

export function parseBeadsTaskMetadata(issue: Pick<BeadsIssue, 'description'>): BeadsTaskMetadata {
  const description = issue.description ?? '';
  return {
    intent: parseScalar(description, 'intent'),
    runtimeHint: parseScalar(description, 'runtime_hint'),
    reviewRuntime: parseScalar(description, 'review_runtime'),
    risk: parseScalar(description, 'risk'),
    targetPaths: parseList(description, 'target_paths'),
    forbiddenPaths: parseList(description, 'forbidden_paths'),
    verify: parseList(description, 'verify'),
    requiredArtifacts: parseList(description, 'artifacts'),
    approvalRequired: parseList(description, 'approval_required'),
    dependsOn: parseList(description, 'depends_on'),
  };
}
