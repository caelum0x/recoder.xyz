import { createArtifactCapture, type AgentHookArtifact } from './artifact-capture';
import { extractMemoryCandidates, type HookMemoryCandidate } from './memory-candidate';
import { scanSecrets } from './secret-scan';

export type AgentHookAction =
  | 'file.read'
  | 'file.write'
  | 'command.run'
  | 'tool.call'
  | 'memory.write'
  | 'artifact.publish'
  | 'deploy.preview';

export type AgentHookInput = {
  action?: AgentHookAction | string;
  taskId?: string;
  runId?: string;
  artifactId?: string;
  actor?: {
    agentId?: string;
    runtime?: string;
  };
  target?: {
    path?: string;
    paths?: string[];
    command?: string;
    toolName?: string;
    content?: string;
  };
  policy?: {
    forbiddenPaths?: string[];
    forbiddenActions?: string[];
    requireWorkLockForWrites?: boolean;
    approvalRequiredActions?: string[];
  };
  instructionBundle?: {
    forbidden_actions?: string[];
    approval_gates?: Array<{ action?: string; reason?: string }>;
  };
  workLock?: {
    held?: boolean;
    owner?: string;
  };
  runState?: Record<string, unknown>;
  subagent?: {
    id?: string;
    role?: string;
    summary?: string;
    output?: unknown;
  };
};

export type AgentHookDecision = {
  decision: 'allow' | 'block' | 'needs_approval';
  reason: string;
  findings?: Array<Record<string, unknown>>;
  artifacts?: AgentHookArtifact[];
  runtimeEvidence?: AgentHookRuntimeEvidence[];
  memoryCandidates?: HookMemoryCandidate[];
};

export type AgentHookRuntimeEvidence = {
  kind:
    | 'stdout'
    | 'stderr'
    | 'file_mutation'
    | 'verification'
    | 'browser_check'
    | 'preview_link'
    | 'desktop'
    | 'custom';
  status: 'observed' | 'passed' | 'failed' | 'warning';
  title: string;
  taskId?: string;
  runId?: string;
  source?: {
    runtimeId?: string;
    adapterId?: string;
    command?: string;
    url?: string;
  };
  artifactKeys?: string[];
  metadata?: Record<string, unknown>;
};

const DEFAULT_FORBIDDEN_PATHS = [
  '.env',
  '.env.*',
  '**/.env',
  '**/.env.*',
  'secrets/**',
  '**/secrets/**',
  '**/*.pem',
  '**/*.key',
];

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+\/(?:\s|$)/,
  /\bgit\s+push\b/,
  /\bchmod\s+777\b/,
  /\bcurl\b.*\|\s*(?:bash|sh)\b/,
  /\bwget\b.*\|\s*(?:bash|sh)\b/,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/');
  const source = normalized
    .split('**')
    .map((part) => part.split('*').map(escapeRegExp).join('[^/]*'))
    .join('.*');
  return new RegExp(`^${source}$`);
}

function matchesPath(path: string, glob: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const normalizedGlob = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  return globToRegExp(normalizedGlob).test(normalized);
}

function collectPaths(input: AgentHookInput): string[] {
  return [
    ...(input.target?.path ? [input.target.path] : []),
    ...(input.target?.paths ?? []),
  ].filter(Boolean);
}

function isWriteAction(action: string): boolean {
  return action === 'file.write' || action === 'artifact.publish' || action === 'deploy.preview';
}

export function evaluatePreToolUse(input: AgentHookInput): AgentHookDecision {
  const action = input.action || 'tool.call';
  const forbiddenActions = [
    ...(input.policy?.forbiddenActions ?? []),
    ...(input.instructionBundle?.forbidden_actions ?? []),
  ];

  if (forbiddenActions.includes(action)) {
    return { decision: 'block', reason: `Action is forbidden by policy: ${action}` };
  }

  if (action === 'memory.write') {
    return {
      decision: 'block',
      reason: 'Direct memory writes are blocked; produce a reviewed memory candidate artifact instead.',
    };
  }

  const paths = collectPaths(input);
  const forbiddenPaths = [...DEFAULT_FORBIDDEN_PATHS, ...(input.policy?.forbiddenPaths ?? [])];
  const blockedPath = paths.find((candidate) => forbiddenPaths.some((glob) => matchesPath(candidate, glob)));
  if (blockedPath) {
    return {
      decision: 'block',
      reason: `Path is forbidden by policy: ${blockedPath}`,
      findings: [{ path: blockedPath }],
    };
  }

  if (isWriteAction(action) && input.policy?.requireWorkLockForWrites !== false && input.workLock?.held !== true) {
    return {
      decision: 'needs_approval',
      reason: 'Write action requires a Recoder work lock or explicit approval.',
    };
  }

  const command = input.target?.command || '';
  if (action === 'command.run' && DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
    return {
      decision: 'needs_approval',
      reason: 'Command requires approval under Agent OS policy.',
      findings: [{ command }],
    };
  }

  const content = [input.target?.content, command].filter(Boolean).join('\n');
  const secrets = scanSecrets(content);
  if (secrets.length > 0) {
    return {
      decision: 'block',
      reason: 'Potential secret material detected in tool input.',
      findings: secrets,
    };
  }

  if (input.policy?.approvalRequiredActions?.includes(action)) {
    return { decision: 'needs_approval', reason: `Action requires approval: ${action}` };
  }

  return { decision: 'allow', reason: 'Allowed by Agent OS hook policy.' };
}

export function evaluatePostToolUse(input: AgentHookInput & { changedFiles?: string[]; output?: string; exitCode?: number }): AgentHookDecision {
  const artifact = createArtifactCapture({
    taskId: input.taskId,
    runId: input.runId,
    hook: 'post-tool-use',
    changedFiles: input.changedFiles ?? collectPaths(input),
    command: input.target?.command,
    exitCode: input.exitCode,
    output: input.output,
  });
  const changedFiles = input.changedFiles ?? collectPaths(input);

  return {
    decision: 'allow',
    reason: 'Captured post-tool-use artifact metadata.',
    artifacts: [artifact],
    runtimeEvidence: [
      {
        kind: changedFiles.length > 0 ? 'file_mutation' : input.exitCode === undefined ? 'custom' : input.exitCode === 0 ? 'stdout' : 'stderr',
        status: input.exitCode === undefined ? 'observed' : input.exitCode === 0 ? 'passed' : 'failed',
        title: 'Post-tool-use runtime evidence',
        taskId: input.taskId,
        runId: input.runId,
        source: {
          runtimeId: input.actor?.runtime,
          adapterId: input.actor?.agentId,
          command: input.target?.command,
        },
        artifactKeys: [artifact.key],
        metadata: {
          changedFiles,
          exitCode: input.exitCode,
          hook: 'post-tool-use',
        },
      },
    ],
  };
}

export function evaluateStop(input: AgentHookInput & { result?: unknown; taskId?: string; artifactId?: string }): AgentHookDecision {
  const memoryCandidates = extractMemoryCandidates(input.result, input.taskId, input.artifactId);

  return {
    decision: 'allow',
    reason: memoryCandidates.length > 0
      ? 'Proposed reviewed memory candidates from run result.'
      : 'No reviewed memory candidates proposed.',
    memoryCandidates,
  };
}

export function evaluateBeforeCompact(input: AgentHookInput): AgentHookDecision {
  const artifact = createArtifactCapture({
    taskId: input.taskId,
    runId: input.runId,
    hook: 'before-compact',
    output: JSON.stringify({
      runState: input.runState ?? {},
      actor: input.actor,
      target: input.target,
      capturedAt: new Date().toISOString(),
    }, null, 2),
  });

  return {
    decision: 'allow',
    reason: 'Captured run state before context compaction.',
    artifacts: [artifact],
    runtimeEvidence: [
      {
        kind: 'custom',
        status: 'observed',
        title: 'Run state captured before compaction',
        taskId: input.taskId,
        runId: input.runId,
        source: {
          runtimeId: input.actor?.runtime,
          adapterId: input.actor?.agentId,
        },
        artifactKeys: [artifact.key],
        metadata: {
          hook: 'before-compact',
        },
      },
    ],
  };
}

export function evaluateSubagentStop(input: AgentHookInput): AgentHookDecision {
  const artifact = createArtifactCapture({
    taskId: input.taskId,
    runId: input.runId,
    hook: 'subagent-stop',
    output: JSON.stringify({
      subagent: input.subagent ?? {},
      actor: input.actor,
      capturedAt: new Date().toISOString(),
    }, null, 2),
  });

  return {
    decision: 'allow',
    reason: 'Captured subagent summary for parent run attachment.',
    artifacts: [artifact],
    runtimeEvidence: [
      {
        kind: 'custom',
        status: 'observed',
        title: 'Subagent summary captured',
        taskId: input.taskId,
        runId: input.runId,
        source: {
          runtimeId: input.actor?.runtime,
          adapterId: input.actor?.agentId,
        },
        artifactKeys: [artifact.key],
        metadata: {
          hook: 'subagent-stop',
          subagentId: input.subagent?.id,
          subagentRole: input.subagent?.role,
        },
      },
    ],
  };
}

async function readStdin(): Promise<string> {
  return await new Promise((resolve) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { buffer += chunk; });
    process.stdin.on('end', () => resolve(buffer));
    if (process.stdin.isTTY) resolve('');
  });
}

export async function runHookCli(kind: 'pre-tool-use' | 'post-tool-use' | 'before-compact' | 'subagent-stop' | 'stop' | 'memory-candidate'): Promise<void> {
  try {
    const raw = await readStdin();
    const input = raw.trim() ? JSON.parse(raw) : {};
    const decision =
      kind === 'pre-tool-use'
        ? evaluatePreToolUse(input)
        : kind === 'post-tool-use'
          ? evaluatePostToolUse(input)
          : kind === 'before-compact'
            ? evaluateBeforeCompact(input)
            : kind === 'subagent-stop'
              ? evaluateSubagentStop(input)
              : evaluateStop(input);
    process.stdout.write(`${JSON.stringify(decision)}\n`);
    process.exitCode = decision.decision === 'block' ? 2 : 0;
  } catch (error) {
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: error instanceof Error ? error.message : 'Agent hook failed',
    }) + '\n');
    process.exitCode = 2;
  }
}

export { createArtifactCapture } from './artifact-capture';
export { extractMemoryCandidates } from './memory-candidate';
export { scanSecrets } from './secret-scan';
