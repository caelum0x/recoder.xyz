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

// Keep the legacy workspace path until the app is physically moved, but expose the
// current product identity in user-facing workflow labels.
const UI_RECODER_WORKSPACE_PATH = '/Users/arhansubasi/recoder.xyz/apps/ui.giselles.ai';

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

const LANE_CATALOG: SubagentLane[] = [
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
    validationCommands: [
      'pnpm -C /Users/arhansubasi/recoder.xyz/apps/desktop run smoke:prod',
      'pnpm -C /Users/arhansubasi/recoder.xyz/apps/desktop test',
    ],
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
    validationCommands: [
      'pnpm -C /Users/arhansubasi/recoder.xyz/recoder-studio test',
      `pnpm -C ${UI_RECODER_WORKSPACE_PATH} run typecheck`,
    ],
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
    validationCommands: [
      'pnpm -C /Users/arhansubasi/recoder.xyz/openclaw test',
      'pnpm -C /Users/arhansubasi/recoder.xyz/openclaw run release:preflight -- --strict',
    ],
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

function normalizePath(path: string): string {
  return path.replace(/\/+$/, '');
}

function includesPath(path: string, requestedPaths: string[]): boolean {
  return requestedPaths.some((requested) => path === requested || path.startsWith(`${requested}/`));
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

export function buildSubagentWorkflowPlan(input: {
  task: string;
  agentType?: string;
  requestedPaths?: string[];
  continuous?: boolean;
  retryMax?: number;
  retryBackoffMs?: number;
}): SubagentWorkflowPlan {
  const requested = (input.requestedPaths?.length ? input.requestedPaths : [...DEFAULT_REPO_PATHS]).map(
    normalizePath,
  );
  const baseLanes = LANE_CATALOG.filter((lane) =>
    lane.paths.some((lanePath) => includesPath(normalizePath(lanePath), requested)),
  );

  const retryBudget = {
    maxRetries: input.retryMax ?? DEFAULT_RETRY.maxRetries,
    backoffMs: input.retryBackoffMs ?? DEFAULT_RETRY.backoffMs,
  };

  const selectedLaneIds = new Set(baseLanes.map((lane) => lane.laneId));
  const selectedLanes: SubagentLane[] = baseLanes.map((lane) => {
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
  const scopeLine = `Scope: ${requested.length} repos | Active lanes: ${selectedLanes.length}`;
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

export const __internal = {
  DEFAULT_REPO_PATHS,
  LANE_CATALOG,
};
