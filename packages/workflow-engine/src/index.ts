/**
 * @recoder/workflow-engine — the OWNED Workflow+Hooks capability (RECODER-ENGINES
 * E12). Runs a named verification workflow (verify → browser-check → memory) to a
 * truthful verdict, and captures hook artifacts / secret-scan findings. It skins
 * `@recoder/agent-workflows` (the runner) and `@recoder/agent-hooks` (scan +
 * capture); every external seam is injected and every path degrades truthfully.
 */
export {
	createWorkflowEngine,
	type WorkflowEngine,
	type WorkflowEngineDeps,
} from "./workflow-engine.js";
export {
	createAgentHooksHookRunner,
	createCommandVerificationRunner,
	createUnconfiguredHookRunner,
	createUnconfiguredVerificationRunner,
	type CommandVerificationRunnerOptions,
	type ExecFn,
	type ExecResult,
	type HookRunnerPort,
	type VerificationContext,
	type VerificationRunnerPort,
} from "./ports.js";
export {
	buildDefinition,
	checkNodeId,
	DEFAULT_WORKFLOW,
	DEFAULT_WORKFLOWS,
	nodeToCheck,
	resolveChecks,
	toNodeKind,
} from "./workflows.js";
export type {
	CaptureHookInput,
	CaptureHookResult,
	CaptureHookStatus,
	CheckResult,
	CheckRunOutcome,
	CheckStatus,
	HookFinding,
	VerificationCheck,
	VerifyInput,
	VerifyStatus,
	VerifyVerdict,
} from "./types.js";
