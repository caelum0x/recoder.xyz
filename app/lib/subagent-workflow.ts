export type SubagentLane = {
  laneId: string;
  title: string;
  paths: string[];
  validationCommands: string[];
};

export type SubagentWorkflowPlan = {
  mode: 'continuous' | 'single-task';
  summary: string;
  lanes: SubagentLane[];
  nextActions: string[];
};

const UI_RECODER_WORKSPACE_PATH =
  process.env.UI_RECODER_WORKSPACE_PATH ||
  '/Users/arhansubasi/recoder.xyz/recoder-agency';

const DEFAULT_PATHS = [
  '/Users/arhansubasi/recoder.xyz/app',
  '/Users/arhansubasi/recoder.xyz/apps/desktop',
  '/Users/arhansubasi/recoder.xyz/apps/frontend',
  '/Users/arhansubasi/recoder.xyz/apps/mobile',
  '/Users/arhansubasi/recoder.xyz/recoder-studio',
  UI_RECODER_WORKSPACE_PATH,
  '/Users/arhansubasi/recoder.xyz/backend',
  '/Users/arhansubasi/recoder.xyz/docker-backend',
  '/Users/arhansubasi/recoder.xyz/packages',
  '/Users/arhansubasi/recoder.xyz/recoder-agency',
  '/Users/arhansubasi/recoder.xyz/recoder-pm',
  '/Users/arhansubasi/recoder.xyz/recoder-skill',
  '/Users/arhansubasi/recoder.xyz/tools',
] as const;

const LANE_CATALOG: SubagentLane[] = [
  {
    laneId: 'E1',
    title: 'Ecosystem app chain (mobile -> studio -> frontend -> app)',
    paths: [
      '/Users/arhansubasi/recoder.xyz/apps/mobile',
      '/Users/arhansubasi/recoder.xyz/recoder-studio',
      '/Users/arhansubasi/recoder.xyz/apps/frontend',
      '/Users/arhansubasi/recoder.xyz/app',
    ],
    validationCommands: [
      'pnpm -C /Users/arhansubasi/recoder.xyz/apps/mobile run typecheck',
      'pnpm -C /Users/arhansubasi/recoder.xyz/recoder-studio run typecheck',
      'pnpm -C /Users/arhansubasi/recoder.xyz/apps/frontend run typecheck',
      'pnpm -C /Users/arhansubasi/recoder.xyz/app run typecheck',
    ],
  },
  {
    laneId: 'A1',
    title: 'Core app and Spaces dashboard',
    paths: ['/Users/arhansubasi/recoder.xyz/app'],
    validationCommands: [
      'pnpm -C /Users/arhansubasi/recoder.xyz/app test',
      'pnpm -C /Users/arhansubasi/recoder.xyz/app run typecheck',
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
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/recoder-studio run check'],
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
    title: 'Shared packages',
    paths: ['/Users/arhansubasi/recoder.xyz/packages'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz run typecheck'],
  },
  {
    laneId: 'A8',
    title: 'Agency product',
    paths: ['/Users/arhansubasi/recoder.xyz/recoder-agency'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/recoder-agency check'],
  },
  {
    laneId: 'A9',
    title: 'PM product',
    paths: ['/Users/arhansubasi/recoder.xyz/recoder-pm'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/recoder-pm check'],
  },
  {
    laneId: 'A10',
    title: 'Skill system',
    paths: ['/Users/arhansubasi/recoder.xyz/recoder-skill'],
    validationCommands: ['pnpm -C /Users/arhansubasi/recoder.xyz/recoder-skill run test'],
  },
  {
    laneId: 'A11',
    title: 'Tools and evals',
    paths: ['/Users/arhansubasi/recoder.xyz/tools'],
    validationCommands: [
      'pnpm -C /Users/arhansubasi/recoder.xyz run check:eval-gate',
      'pnpm -C /Users/arhansubasi/recoder.xyz run eval:harness',
    ],
  },
];

function normalizePath(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function pathMatches(path: string, requested: string[]): boolean {
  return requested.some((candidate) => path === candidate || path.startsWith(`${candidate}/`));
}

export function createSubagentWorkflowPlan(input: {
  task: string;
  requestedPaths?: string[];
  continuous?: boolean;
}): SubagentWorkflowPlan {
  const requested = (input.requestedPaths?.length ? input.requestedPaths : [...DEFAULT_PATHS]).map(
    normalizePath,
  );
  const lanes = LANE_CATALOG.filter((lane) =>
    lane.paths.some((lanePath) => pathMatches(normalizePath(lanePath), requested)),
  );

  return {
    mode: input.continuous === false ? 'single-task' : 'continuous',
    summary: `Task: ${input.task || 'continuous subagent development'} | Scope: ${requested.length} repos | Active lanes: ${lanes.length}`,
    lanes,
    nextActions: [
      'Execute lane tasks in parallel with strict path ownership.',
      'Run lane validation commands after each implementation batch.',
      'Record evidence and blockers in plan.md every cycle.',
    ],
  };
}
