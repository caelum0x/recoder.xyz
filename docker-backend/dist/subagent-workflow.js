"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLIC_WORKFLOW_CONTRACT_VERSION = exports.WORKFLOW_CONTRACT_VERSION = exports.WORKFLOW_REQUEST_CONTRACT_ERROR_SCHEMA = exports.WORKFLOW_REQUEST_CONTRACT_ERROR_CODE = exports.PUBLIC_WORKFLOW_HEALTH_CONTRACT = exports.PUBLIC_WORKFLOW_CONTRACT = exports.INTERNAL_WORKFLOW_CONTRACT = void 0;
exports.isKnownSubagentLaneId = isKnownSubagentLaneId;
exports.parseSubagentLaneStatusUpdate = parseSubagentLaneStatusUpdate;
exports.parseSubagentWorkflowRequest = parseSubagentWorkflowRequest;
exports.buildSubagentWorkflowPlan = buildSubagentWorkflowPlan;
exports.validateSubagentWorkflowRequestContract = validateSubagentWorkflowRequestContract;
exports.buildInternalWorkflowResponse = buildInternalWorkflowResponse;
exports.buildPublicWorkflowResponseData = buildPublicWorkflowResponseData;
exports.buildSubagentWorkflowHealthSummary = buildSubagentWorkflowHealthSummary;
exports.INTERNAL_WORKFLOW_CONTRACT = 'internal-agent-workflow-v1';
exports.PUBLIC_WORKFLOW_CONTRACT = 'public-agent-workflow-v1';
exports.PUBLIC_WORKFLOW_HEALTH_CONTRACT = 'public-agent-workflow-health-v1';
exports.WORKFLOW_REQUEST_CONTRACT_ERROR_CODE = 'INVALID_WORKFLOW_REQUEST_CONTRACT';
exports.WORKFLOW_REQUEST_CONTRACT_ERROR_SCHEMA = 'agent-workflow-contract-error-v1';
exports.WORKFLOW_CONTRACT_VERSION = exports.INTERNAL_WORKFLOW_CONTRACT;
exports.PUBLIC_WORKFLOW_CONTRACT_VERSION = exports.PUBLIC_WORKFLOW_CONTRACT;
const UI_RECODER_WORKSPACE_PATH = process.env.UI_RECODER_WORKSPACE_PATH ||
    '/Users/arhansubasi/recoder.xyz/recoder-agency';
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
];
const LANE_CATALOG = [
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
const LANE_DELEGATION = {
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
const LANE_DEPENDENCIES = {
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
};
const DEFAULT_VISIBILITY = ['attempts', 'warnings', 'validation', 'fallback-path'];
const ALL_LANE_IDS = new Set(LANE_CATALOG.map((lane) => lane.laneId));
function normalizePath(pathValue) {
    return pathValue.trim().replace(/\/+$/, '');
}
function normalizeLaneId(laneId) {
    return laneId.trim().toUpperCase();
}
function includesPath(pathValue, requestedPaths) {
    return requestedPaths.some((requested) => pathValue === requested || pathValue.startsWith(`${requested}/`));
}
function isLaneId(value) {
    return ALL_LANE_IDS.has(value);
}
function isKnownSubagentLaneId(value) {
    return isLaneId(value);
}
function parseNonNegativeInt(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return undefined;
    }
    return Math.floor(value);
}
function parseSubagentLaneStatusUpdate(body) {
    const input = (body || {});
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
function buildWorkflowOrchestration(lanes) {
    const laneById = new Map(lanes.map((lane) => [lane.laneId, lane]));
    const pending = new Set(lanes.map((lane) => lane.laneId));
    const executionWaves = [];
    while (pending.size > 0) {
        const ready = Array.from(pending)
            .filter((laneId) => {
            const deps = laneById.get(laneId)?.dependsOn ?? [];
            return deps.every((depId) => !pending.has(depId));
        })
            .sort();
        if (ready.length === 0) {
            break;
        }
        executionWaves.push(ready);
        for (const laneId of ready) {
            pending.delete(laneId);
        }
    }
    const unresolvedLanes = Array.from(pending).sort();
    const delegatedAgents = Object.fromEntries(lanes.map((lane) => [lane.laneId, lane.delegatesTo || 'generalist-agent']));
    const totalRetryBudget = lanes.reduce((acc, lane) => {
        acc.maxRetries += lane.retryBudget?.maxRetries ?? 0;
        acc.maxBackoffMs = Math.max(acc.maxBackoffMs, lane.retryBudget?.backoffMs ?? 0);
        return acc;
    }, { maxRetries: 0, maxBackoffMs: 0 });
    const visibilitySignals = Array.from(new Set(lanes.flatMap((lane) => lane.visibility ?? []))).sort();
    return {
        executionWaves,
        unresolvedLanes,
        delegatedAgents,
        totalRetryBudget,
        visibilitySignals,
    };
}
function parseSubagentWorkflowRequest(body) {
    const input = (body || {});
    const requestContract = typeof input.requestContract === 'string' && input.requestContract.trim().length > 0
        ? input.requestContract.trim()
        : undefined;
    const task = typeof input.task === 'string' ? input.task.trim() : '';
    const paths = Array.isArray(input.paths)
        ? input.paths.filter((value) => typeof value === 'string' && value.trim().length > 0)
        : undefined;
    const lanes = Array.isArray(input.lanes)
        ? input.lanes
            .filter((value) => typeof value === 'string' && value.trim().length > 0)
            .map(normalizeLaneId)
            .filter((value) => isLaneId(value))
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
function buildSubagentWorkflowPlan(input) {
    const requestedPaths = (input.requestedPaths?.length ? input.requestedPaths : [...DEFAULT_REPO_PATHS]).map(normalizePath);
    const pathScopedLanes = LANE_CATALOG.filter((lane) => lane.paths.some((lanePath) => includesPath(normalizePath(lanePath), requestedPaths)));
    const requestedLaneSet = input.requestedLanes?.length ? new Set(input.requestedLanes) : null;
    const selectedBaseLanes = requestedLaneSet
        ? pathScopedLanes.filter((lane) => requestedLaneSet.has(lane.laneId))
        : pathScopedLanes;
    const retryBudget = {
        maxRetries: parseNonNegativeInt(input.retryMax) ?? DEFAULT_RETRY.maxRetries,
        backoffMs: parseNonNegativeInt(input.retryBackoffMs) ?? DEFAULT_RETRY.backoffMs,
    };
    const selectedLaneIds = new Set(selectedBaseLanes.map((lane) => lane.laneId));
    const selectedLanes = selectedBaseLanes.map((lane) => {
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
    const mode = input.continuous === false ? 'single-task' : 'continuous';
    const taskLine = `Task: ${input.task.trim() || 'continuous development cycle'}`;
    const scopeLine = `Scope: ${requestedPaths.length} repos | Active lanes: ${selectedLanes.length}`;
    const orchestration = buildWorkflowOrchestration(selectedLanes);
    const nextActions = [
        'Run lane tasks in parallel with strict path ownership.',
        'Run lane validation commands after implementation batches.',
        'Append cycle evidence and blockers to plan.md.',
    ];
    if (selectedLanes.some((lane) => (lane.externalDependsOn?.length ?? 0) > 0)) {
        nextActions.push('Selected scope excludes some lane dependencies; run full workflow or include dependency lanes for complete validation.');
    }
    return {
        mode,
        summary: `${taskLine} | ${scopeLine}`,
        lanes: selectedLanes,
        orchestration,
        nextActions,
    };
}
function validateSubagentWorkflowRequestContract(requestContract, expectedContract) {
    if (!requestContract || requestContract === expectedContract) {
        return { ok: true };
    }
    return {
        ok: false,
        error: {
            ok: false,
            error: `Workflow request contract mismatch: expected ${expectedContract}, got ${requestContract}`,
            code: exports.WORKFLOW_REQUEST_CONTRACT_ERROR_CODE,
            schemaVersion: exports.WORKFLOW_REQUEST_CONTRACT_ERROR_SCHEMA,
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
function buildInternalWorkflowResponse(params) {
    return {
        success: true,
        message: 'Subagent workflow plan generated',
        contract: exports.INTERNAL_WORKFLOW_CONTRACT,
        responseContract: exports.INTERNAL_WORKFLOW_CONTRACT,
        ...(params.requestContract ? { requestContract: params.requestContract } : {}),
        ...(params.projectId ? { projectId: params.projectId } : {}),
        workflow: params.workflow,
    };
}
function buildPublicWorkflowResponseData(params) {
    return {
        message: 'Subagent workflow plan generated',
        contract: exports.PUBLIC_WORKFLOW_CONTRACT,
        responseContract: exports.PUBLIC_WORKFLOW_CONTRACT,
        ...(params.requestContract ? { requestContract: params.requestContract } : {}),
        workflow: params.workflow,
    };
}
function buildSubagentWorkflowHealthSummary(input) {
    const completed = [];
    const running = [];
    const failed = [];
    const lanes = {};
    for (const [laneId, entry] of Object.entries(input.statuses)) {
        if (!isKnownSubagentLaneId(laneId)) {
            continue;
        }
        lanes[laneId] = entry;
        if (entry.status === 'completed') {
            completed.push(laneId);
        }
        else if (entry.status === 'running') {
            running.push(laneId);
        }
        else if (entry.status === 'failed') {
            failed.push(laneId);
        }
    }
    const blockers = [];
    const warnings = [];
    const nextActions = [];
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
    const state = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'degraded' : 'healthy';
    return {
        contract: exports.PUBLIC_WORKFLOW_HEALTH_CONTRACT,
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
