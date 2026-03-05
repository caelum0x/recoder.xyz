export type SubagentLaneId =
  | 'A1'
  | 'A2'
  | 'A3'
  | 'A4'
  | 'A5'
  | 'A6'
  | 'A7'
  | 'A8'
  | 'A9'
  | 'A10'
  | 'A11'
  | 'A12';

export type SubagentLane = {
  laneId: SubagentLaneId;
  title: string;
  paths: string[];
  validationCommands: string[];
  delegatesTo?: string;
  dependsOn?: SubagentLaneId[];
  externalDependsOn?: SubagentLaneId[];
  retryBudget?: {
    maxRetries: number;
    backoffMs: number;
  };
  visibility?: string[];
};

export type SubagentWorkflowOrchestration = {
  executionWaves: SubagentLaneId[][];
  unresolvedLanes: SubagentLaneId[];
  delegatedAgents: Record<string, string>;
  totalRetryBudget: {
    maxRetries: number;
    maxBackoffMs: number;
  };
  visibilitySignals: string[];
};

export type SubagentWorkflowPlan = {
  mode: 'continuous' | 'single-task';
  summary: string;
  lanes: SubagentLane[];
  orchestration: SubagentWorkflowOrchestration;
  nextActions: string[];
};

export type SubagentWorkflowRequest = {
  requestContract?: string;
  task?: string;
  paths?: string[];
  lanes?: string[];
  continuous?: boolean;
  retryMax?: number;
  retryBackoffMs?: number;
};

export type ParsedSubagentWorkflowRequest = {
  requestContract?: string;
  task: string;
  paths?: string[];
  lanes?: SubagentLaneId[];
  continuous: boolean;
  retryMax?: number;
  retryBackoffMs?: number;
};

export type SubagentLaneRuntimeStatus = 'running' | 'completed' | 'failed';

export type SubagentLaneStatusEntry = {
  status: SubagentLaneRuntimeStatus;
  attempts?: number;
  duration?: number;
  errors?: string[];
  updatedAt: string;
};

export type ParsedSubagentLaneStatusUpdate = {
  status: SubagentLaneRuntimeStatus;
  attempts?: number;
  duration?: number;
  errors?: string[];
};

export type SubagentWorkflowHealthSummary = {
  contract: 'public-agent-workflow-health-v1';
  taxonomyVersion: 'workflow-lane-health-v1';
  state: 'healthy' | 'degraded' | 'blocked';
  ok: boolean;
  laneCount: number;
  completed: number;
  failed: number;
  running: number;
  blockers: string[];
  warnings: string[];
  nextActions: string[];
  lanesByState: {
    running: SubagentLaneId[];
    completed: SubagentLaneId[];
    failed: SubagentLaneId[];
  };
  lanes: Record<string, SubagentLaneStatusEntry>;
};

export const INTERNAL_WORKFLOW_CONTRACT = 'internal-agent-workflow-v1' as const;
export const PUBLIC_WORKFLOW_CONTRACT = 'public-agent-workflow-v1' as const;
export const PUBLIC_WORKFLOW_HEALTH_CONTRACT = 'public-agent-workflow-health-v1' as const;
export const WORKFLOW_REQUEST_CONTRACT_ERROR_CODE = 'INVALID_WORKFLOW_REQUEST_CONTRACT' as const;
export const WORKFLOW_REQUEST_CONTRACT_ERROR_SCHEMA = 'agent-workflow-contract-error-v1' as const;
export const WORKFLOW_CONTRACT_VERSION = INTERNAL_WORKFLOW_CONTRACT;
export const PUBLIC_WORKFLOW_CONTRACT_VERSION = PUBLIC_WORKFLOW_CONTRACT;

const UI_RECODER_WORKSPACE_PATH =
  process.env.UI_RECODER_WORKSPACE_PATH ||
  '/Users/arhansubasi/recoder.xyz/apps/ui.giselles.ai';

const DEFAULT_REPO_PATHS = [
  '/Users/arhansubasi/recoder.xyz/app',
  '/Users/arhansubasi/recoder.xyz/apps/desktop',
  '/Users/arhansubasi/recoder.xyz/apps/frontend',
  '/Users/arhansubasi/recoder.xyz/apps/mobile',
  '/Users/arhansubasi/recoder.xyz/recoder-studio',
  UI_RECODER_WORKSPACE_PATH,
  '/Users/arhansubasi/recoder.xyz/backend',
  '/Users/arhansubasi/recoder.xyz/docker-backend',
  '/Users/arhansubasi/recoder.xyz/openclaw',
  '/Users/arhansubasi/recoder.xyz/packages',
  '/Users/arhansubasi/recoder.xyz/recoder-agency',
  '/Users/arhansubasi/recoder.xyz/recoder-pm',
  '/Users/arhansubasi/recoder.xyz/recoder-skill',
  '/Users/arhansubasi/recoder.xyz/recoder-web',
  '/Users/arhansubasi/recoder.xyz/tools',
] as const;

const LANE_CATALOG: Array<Pick<SubagentLane, 'laneId' | 'title' | 'paths' | 'validationCommands'>> = [
  {
    laneId: 'A1',
    title: 'Core app and web runtime',
    paths: ['/Users/arhansubasi/recoder.xyz/app', '/Users/arhansubasi/recoder.xyz/recoder-web'],
    validationCommands: [
      'pnpm -C /Users/arhansubasi/recoder.xyz/recoder-web test',
      'pnpm -C /Users/arhansubasi/recoder.xyz/recoder-web run typecheck',
    ],
  },
  {
    laneId: 'A2',
    title: 'Desktop productization',
    paths: ['/Users/arhansubasi/recoder.xyz/apps/desktop'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/apps/desktop run smoke:prod'],
  },
  {
    laneId: 'A3',
    title: 'Frontend and mobile',
    paths: [
      '/Users/arhansubasi/recoder.xyz/apps/frontend',
      '/Users/arhansubasi/recoder.xyz/apps/mobile',
    ],
    validationCommands: [
      'pnpm -C /Users/arhansubasi/recoder.xyz/apps/frontend run typecheck',
      'pnpm -C /Users/arhansubasi/recoder.xyz/apps/mobile run typecheck',
    ],
  },
  {
    laneId: 'A4',
    title: 'Studio and ui.recoder.xyz',
    paths: [
      '/Users/arhansubasi/recoder.xyz/recoder-studio',
      UI_RECODER_WORKSPACE_PATH,
    ],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/recoder-studio test'],
  },
  {
    laneId: 'A5',
    title: 'Python backend',
    paths: ['/Users/arhansubasi/recoder.xyz/backend'],
    validationCommands: [
      'python3 /Users/arhansubasi/recoder.xyz/backend/core/utils/scripts/check_no_supabase_imports.py',
      'python3 /Users/arhansubasi/recoder.xyz/backend/core/utils/scripts/check_no_dbconnection_usage.py',
    ],
  },
  {
    laneId: 'A6',
    title: 'Docker backend',
    paths: ['/Users/arhansubasi/recoder.xyz/docker-backend'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/docker-backend test -- --runInBand'],
  },
  {
    laneId: 'A7',
    title: 'OpenClaw ecosystem',
    paths: ['/Users/arhansubasi/recoder.xyz/openclaw'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/openclaw test'],
  },
  {
    laneId: 'A8',
    title: 'Shared packages',
    paths: ['/Users/arhansubasi/recoder.xyz/packages'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz run typecheck'],
  },
  {
    laneId: 'A9',
    title: 'Agency product',
    paths: ['/Users/arhansubasi/recoder.xyz/recoder-agency'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/recoder-agency check'],
  },
  {
    laneId: 'A10',
    title: 'PM product',
    paths: ['/Users/arhansubasi/recoder.xyz/recoder-pm'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/recoder-pm check'],
  },
  {
    laneId: 'A11',
    title: 'Skill system',
    paths: ['/Users/arhansubasi/recoder.xyz/recoder-skill'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/recoder-skill run test'],
  },
  {
    laneId: 'A12',
    title: 'Tools and evals',
    paths: ['/Users/arhansubasi/recoder.xyz/tools'],
    validationCommands: [
      'pnpm -C /Users/arhansubasi/recoder.xyz run check:eval-gate',
      'pnpm -C /Users/arhansubasi/recoder.xyz run eval:harness',
    ],
  },
];

const LANE_DELEGATION: Record<SubagentLaneId, string> = {
  A1: 'web-runtime-agent',
  A2: 'desktop-agent',
  A3: 'frontend-mobile-agent',
  A4: 'studio-ui-agent',
  A5: 'python-backend-agent',
  A6: 'docker-backend-agent',
  A7: 'openclaw-agent',
  A8: 'packages-agent',
  A9: 'agency-agent',
  A10: 'pm-agent',
  A11: 'skills-agent',
  A12: 'tools-evals-agent',
};

const LANE_DEPENDENCIES: Record<SubagentLaneId, SubagentLaneId[]> = {
  A1: ['A6'],
  A2: ['A7', 'A6'],
  A3: ['A1'],
  A4: ['A1'],
  A5: ['A6'],
  A6: [],
  A7: ['A6'],
  A8: ['A1', 'A6', 'A7'],
  A9: ['A8'],
  A10: ['A8'],
  A11: ['A8'],
  A12: ['A8'],
};

const DEFAULT_RETRY = {
  maxRetries: 2,
  backoffMs: 250,
} as const;

const DEFAULT_VISIBILITY = ['attempts', 'warnings', 'validation', 'fallback-path'] as const;

const ALL_LANE_IDS = new Set(LANE_CATALOG.map((lane) => lane.laneId));

function normalizePath(pathValue: string): string {
  return pathValue.trim().replace(/\/+$/, '');
}

function normalizeLaneId(laneId: string): string {
  return laneId.trim().toUpperCase();
}

function includesPath(pathValue: string, requestedPaths: string[]): boolean {
  return requestedPaths.some((requested) => pathValue === requested || pathValue.startsWith(`${requested}/`));
}

function isLaneId(value: string): value is SubagentLaneId {
  return ALL_LANE_IDS.has(value as SubagentLaneId);
}

export function isKnownSubagentLaneId(value: string): value is SubagentLaneId {
  return isLaneId(value);
}

function parseNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

export function parseSubagentLaneStatusUpdate(body: unknown): ParsedSubagentLaneStatusUpdate | null {
  const input = (body || {}) as {
    status?: unknown;
    attempts?: unknown;
    duration?: unknown;
    errors?: unknown;
  };
  if (input.status !== 'running' && input.status !== 'completed' && input.status !== 'failed') {
    return null;
  }
  const attempts = parseNonNegativeInt(input.attempts);
  const duration = parseNonNegativeInt(input.duration);
  const errors = Array.isArray(input.errors)
    ? input.errors.map((entry) => String(entry)).filter((entry) => entry.trim().length > 0)
    : undefined;
  return {
    status: input.status,
    ...(attempts !== undefined ? { attempts } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(errors && errors.length > 0 ? { errors } : {}),
  };
}

function buildWorkflowOrchestration(lanes: SubagentLane[]): SubagentWorkflowOrchestration {
  const laneById = new Map(lanes.map((lane) => [lane.laneId, lane]));
  const pending = new Set(lanes.map((lane) => lane.laneId));
  const executionWaves: SubagentLaneId[][] = [];

  while (pending.size > 0) {
    const ready = Array.from(pending)
      .filter((laneId) => {
        const deps = laneById.get(laneId)?.dependsOn ?? [];
        return deps.every((depId) => !pending.has(depId));
      })
      .sort() as SubagentLaneId[];
    if (ready.length === 0) {
      break;
    }
    executionWaves.push(ready);
    for (const laneId of ready) {
      pending.delete(laneId);
    }
  }

  const unresolvedLanes = Array.from(pending).sort() as SubagentLaneId[];
  const delegatedAgents = Object.fromEntries(
    lanes.map((lane) => [lane.laneId, lane.delegatesTo || 'generalist-agent']),
  );
  const totalRetryBudget = lanes.reduce(
    (acc, lane) => {
      acc.maxRetries += lane.retryBudget?.maxRetries ?? 0;
      acc.maxBackoffMs = Math.max(acc.maxBackoffMs, lane.retryBudget?.backoffMs ?? 0);
      return acc;
    },
    { maxRetries: 0, maxBackoffMs: 0 },
  );
  const visibilitySignals = Array.from(new Set(lanes.flatMap((lane) => lane.visibility ?? []))).sort();

  return {
    executionWaves,
    unresolvedLanes,
    delegatedAgents,
    totalRetryBudget,
    visibilitySignals,
  };
}

export function parseSubagentWorkflowRequest(body: unknown): ParsedSubagentWorkflowRequest {
  const input = (body || {}) as SubagentWorkflowRequest;
  const requestContract =
    typeof input.requestContract === 'string' && input.requestContract.trim().length > 0
      ? input.requestContract.trim()
      : undefined;
  const task = typeof input.task === 'string' ? input.task.trim() : '';
  const paths = Array.isArray(input.paths)
    ? input.paths.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : undefined;
  const lanes = Array.isArray(input.lanes)
    ? input.lanes
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map(normalizeLaneId)
        .filter((value): value is SubagentLaneId => isLaneId(value))
    : undefined;

  return {
    ...(requestContract ? { requestContract } : {}),
    task: task || 'continuous subagent workflow',
    paths,
    lanes,
    continuous: input.continuous !== false,
    retryMax: parseNonNegativeInt(input.retryMax),
    retryBackoffMs: parseNonNegativeInt(input.retryBackoffMs),
  };
}

export function buildSubagentWorkflowPlan(input: {
  task: string;
  requestedPaths?: string[];
  requestedLanes?: SubagentLaneId[];
  continuous?: boolean;
  retryMax?: number;
  retryBackoffMs?: number;
}): SubagentWorkflowPlan {
  const requestedPaths = (input.requestedPaths?.length ? input.requestedPaths : [...DEFAULT_REPO_PATHS]).map(
    normalizePath,
  );
  const pathScopedLanes = LANE_CATALOG.filter((lane) =>
    lane.paths.some((lanePath) => includesPath(normalizePath(lanePath), requestedPaths)),
  );
  const requestedLaneSet = input.requestedLanes?.length ? new Set(input.requestedLanes) : null;
  const selectedBaseLanes = requestedLaneSet
    ? pathScopedLanes.filter((lane) => requestedLaneSet.has(lane.laneId))
    : pathScopedLanes;

  const retryBudget = {
    maxRetries: parseNonNegativeInt(input.retryMax) ?? DEFAULT_RETRY.maxRetries,
    backoffMs: parseNonNegativeInt(input.retryBackoffMs) ?? DEFAULT_RETRY.backoffMs,
  };

  const selectedLaneIds = new Set(selectedBaseLanes.map((lane) => lane.laneId));
  const selectedLanes: SubagentLane[] = selectedBaseLanes.map((lane) => {
    const dependencies = LANE_DEPENDENCIES[lane.laneId] ?? [];
    return {
      ...lane,
      delegatesTo: LANE_DELEGATION[lane.laneId],
      dependsOn: dependencies.filter((id) => selectedLaneIds.has(id)),
      externalDependsOn: dependencies.filter((id) => !selectedLaneIds.has(id)),
      retryBudget,
      visibility: [...DEFAULT_VISIBILITY],
    };
  });

  const mode: SubagentWorkflowPlan['mode'] = input.continuous === false ? 'single-task' : 'continuous';
  const taskLine = `Task: ${input.task.trim() || 'continuous development cycle'}`;
  const scopeLine = `Scope: ${requestedPaths.length} repos | Active lanes: ${selectedLanes.length}`;
  const orchestration = buildWorkflowOrchestration(selectedLanes);

  const nextActions = [
    'Run lane tasks in parallel with strict path ownership.',
    'Run lane validation commands after implementation batches.',
    'Append cycle evidence and blockers to plan.md.',
  ];
  if (selectedLanes.some((lane) => (lane.externalDependsOn?.length ?? 0) > 0)) {
    nextActions.push(
      'Selected scope excludes some lane dependencies; run full workflow or include dependency lanes for complete validation.',
    );
  }

  return {
    mode,
    summary: `${taskLine} | ${scopeLine}`,
    lanes: selectedLanes,
    orchestration,
    nextActions,
  };
}

export function validateSubagentWorkflowRequestContract(
  requestContract: string | undefined,
  expectedContract: typeof INTERNAL_WORKFLOW_CONTRACT | typeof PUBLIC_WORKFLOW_CONTRACT,
): {
  ok: true;
} | {
  ok: false;
  error: {
    ok: false;
    error: string;
    code: typeof WORKFLOW_REQUEST_CONTRACT_ERROR_CODE;
    schemaVersion: typeof WORKFLOW_REQUEST_CONTRACT_ERROR_SCHEMA;
    expectedContract: typeof INTERNAL_WORKFLOW_CONTRACT | typeof PUBLIC_WORKFLOW_CONTRACT;
    requestContract: string;
    issues: Array<{ path: string; message: string }>;
  };
} {
  if (!requestContract || requestContract === expectedContract) {
    return { ok: true };
  }
  return {
    ok: false,
    error: {
      ok: false,
      error: `Workflow request contract mismatch: expected ${expectedContract}, got ${requestContract}`,
      code: WORKFLOW_REQUEST_CONTRACT_ERROR_CODE,
      schemaVersion: WORKFLOW_REQUEST_CONTRACT_ERROR_SCHEMA,
      expectedContract,
      requestContract,
      issues: [
        {
          path: 'body.requestContract',
          message: `Expected ${expectedContract}`,
        },
      ],
    },
  };
}

export function buildInternalWorkflowResponse(params: {
  workflow: SubagentWorkflowPlan;
  projectId?: string;
  requestContract?: string;
}) {
  return {
    success: true as const,
    message: 'Subagent workflow plan generated',
    contract: INTERNAL_WORKFLOW_CONTRACT,
    responseContract: INTERNAL_WORKFLOW_CONTRACT,
    ...(params.requestContract ? { requestContract: params.requestContract } : {}),
    ...(params.projectId ? { projectId: params.projectId } : {}),
    workflow: params.workflow,
  };
}

export function buildPublicWorkflowResponseData(params: {
  workflow: SubagentWorkflowPlan;
  requestContract?: string;
}) {
  return {
    message: 'Subagent workflow plan generated',
    contract: PUBLIC_WORKFLOW_CONTRACT,
    responseContract: PUBLIC_WORKFLOW_CONTRACT,
    ...(params.requestContract ? { requestContract: params.requestContract } : {}),
    workflow: params.workflow,
  };
}

export function buildSubagentWorkflowHealthSummary(input: {
  statuses: Record<string, SubagentLaneStatusEntry>;
}): SubagentWorkflowHealthSummary {
  const completed: SubagentLaneId[] = [];
  const running: SubagentLaneId[] = [];
  const failed: SubagentLaneId[] = [];
  const lanes: Record<string, SubagentLaneStatusEntry> = {};

  for (const [laneId, entry] of Object.entries(input.statuses)) {
    if (!isKnownSubagentLaneId(laneId)) {
      continue;
    }
    lanes[laneId] = entry;
    if (entry.status === 'completed') {
      completed.push(laneId);
    } else if (entry.status === 'running') {
      running.push(laneId);
    } else if (entry.status === 'failed') {
      failed.push(laneId);
    }
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];
  if (failed.length > 0) {
    blockers.push(`Failed lanes detected: ${failed.join(', ')}.`);
    nextActions.push('Inspect failed lanes, fix root causes, and post updated lane status after retry.');
  }
  if (running.length > 0) {
    warnings.push(`Lanes still running: ${running.join(', ')}.`);
    nextActions.push('Continue polling workflow health until running lanes reach completed/failed.');
  }
  if (Object.keys(lanes).length === 0) {
    warnings.push('No lane status telemetry has been posted yet.');
    nextActions.push('Post lane status updates via `/api/v1/agent/workflow/:laneId/status` during execution.');
  }

  const state: SubagentWorkflowHealthSummary['state'] =
    blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'degraded' : 'healthy';

  return {
    contract: PUBLIC_WORKFLOW_HEALTH_CONTRACT,
    taxonomyVersion: 'workflow-lane-health-v1',
    state,
    ok: state === 'healthy',
    laneCount: Object.keys(lanes).length,
    completed: completed.length,
    failed: failed.length,
    running: running.length,
    blockers,
    warnings,
    nextActions,
    lanesByState: {
      running: running.sort(),
      completed: completed.sort(),
      failed: failed.sort(),
    },
    lanes,
  };
}
