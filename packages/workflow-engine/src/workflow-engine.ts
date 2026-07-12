/**
 * workflow-engine — the OWNED Workflow+Hooks capability (RECODER-ENGINES E12).
 *
 * It SKINS the domain packages rather than reinventing them:
 *   - `verify()` builds a `@recoder/agent-workflows` `WorkflowDefinition` from a
 *     named workflow and runs it through the OWNED `AgentOsWorkflowRunner` (which
 *     owns ordering, execution tracking, and stop-on-failure), routing every node
 *     to the injected `VerificationRunnerPort`. It maps the run into a truthful
 *     verdict `{ status, checks[], passed }`.
 *   - `captureHook()` runs the `@recoder/agent-hooks` secret-scan + artifact capture
 *     via the injected `HookRunnerPort`, returning `{ status, findings[] }`.
 *
 * DEGRADE-SAFE (the hard rule): no verification runner ⇒ `verify` returns
 * `status: 'not_configured'`; no hook runner ⇒ `captureHook` returns
 * `status: 'not_configured'`. A runner that throws is caught and surfaced as an
 * `errored` check — the engine NEVER throws and NEVER fabricates success.
 */
import {
	AgentOsWorkflowRunner,
	type WorkflowDefinition,
	type WorkflowNodeStatus,
	type WorkflowRun,
} from "@recoder/agent-workflows";
import {
	createAgentHooksHookRunner,
	createUnconfiguredVerificationRunner,
	type HookRunnerPort,
	type VerificationContext,
	type VerificationRunnerPort,
} from "./ports.js";
import type {
	CaptureHookInput,
	CaptureHookResult,
	CaptureHookStatus,
	CheckResult,
	CheckStatus,
	HookFinding,
	VerificationCheck,
	VerifyInput,
	VerifyStatus,
	VerifyVerdict,
} from "./types.js";
import {
	buildDefinition,
	checkNodeId,
	DEFAULT_WORKFLOW,
	DEFAULT_WORKFLOWS,
	nodeToCheck,
	resolveChecks,
} from "./workflows.js";

const VERIFY_NOT_CONFIGURED = "verification runner not configured";
const HOOK_NOT_CONFIGURED = "hook runner not configured";
/** The runner appends this synthetic node on validation/setup failure. */
const SYNTHETIC_NODE_ID = "__workflow__";

export interface WorkflowEngine {
	verify(input: VerifyInput): Promise<VerifyVerdict>;
	captureHook(input: CaptureHookInput): Promise<CaptureHookResult>;
}

export interface WorkflowEngineDeps {
	/** Executes verification checks. Defaults to an unconfigured runner (degrade). */
	runner?: VerificationRunnerPort;
	/** Runs secret-scan + artifact capture. Defaults to the agent-hooks runner. */
	hooks?: HookRunnerPort;
	/** Named-workflow registry. Defaults to {@link DEFAULT_WORKFLOWS}. */
	workflows?: Record<string, VerificationCheck[]>;
	/** Injectable clock (defaults to ISO now). */
	now?: () => string;
	/** Injectable run-id generator. */
	createRunId?: () => string;
}

export function createWorkflowEngine(deps: WorkflowEngineDeps = {}): WorkflowEngine {
	const runner = deps.runner ?? createUnconfiguredVerificationRunner();
	const hooks = deps.hooks ?? createAgentHooksHookRunner();
	const workflows = deps.workflows ?? DEFAULT_WORKFLOWS;
	const now = deps.now ?? (() => new Date().toISOString());
	const createRunId =
		deps.createRunId ??
		(() => `wfrun_${Date.now()}_${Math.random().toString(16).slice(2)}`);

	async function verify(input: VerifyInput): Promise<VerifyVerdict> {
		const workflow = input.workflow?.trim() || DEFAULT_WORKFLOW;
		const taskId = input.taskId ?? input.task?.taskId;
		const base = { workflow, taskId, runId: input.runId };

		// Refuse before doing any work when no runner is wired — truthful degrade.
		if (!runner.configured) {
			return {
				...base,
				status: "not_configured",
				checks: [],
				passed: false,
				reason: VERIFY_NOT_CONFIGURED,
			};
		}

		const checks = resolveChecks(workflow, input.checks, workflows);
		if (checks.length === 0) {
			return {
				...base,
				status: "empty",
				checks: [],
				passed: false,
				reason: `no checks defined for workflow: ${workflow}`,
			};
		}

		const definition = buildDefinition(workflow, checks, input.task?.intent);
		const ctx: VerificationContext = { workflow, taskId, runId: input.runId };

		const wfRunner = new AgentOsWorkflowRunner({
			now,
			createRunId: () => createRunId(),
			// Route EVERY node to the injected runner — the runner port catches its
			// own throws, so this handler is total and never fabricates success.
			executeNode: async (node) => {
				const outcome = await safeRunCheck(runner, nodeToCheck(node), ctx);
				return {
					status: toNodeStatus(outcome.status),
					output: {
						checkStatus: outcome.status,
						output: outcome.output,
						durationMs: outcome.durationMs,
						reason: outcome.reason,
					},
				};
			},
		});

		const run = await wfRunner.run({
			definition,
			// Only `task.taskId` is read on the executeNode-override path; a partial
			// task is sufficient, so widen through `unknown` for the strict TaskSpec.
			task: input.task as unknown as WorkflowRunTask,
		});
		const checkResults = mapRunToChecks(checks, definition, run);
		const passed = checkResults.every(
			(check) => check.status !== "failed" && check.status !== "errored",
		);

		const status: VerifyStatus = passed ? "passed" : "failed";
		return { ...base, status, checks: checkResults, passed };
	}

	async function captureHook(input: CaptureHookInput): Promise<CaptureHookResult> {
		const hook = input.hook?.trim() || "secret-scan";
		if (!hooks.configured) {
			return { status: "not_configured", hook, findings: [], reason: HOOK_NOT_CONFIGURED };
		}

		const content = [input.content, input.command, input.output]
			.filter((part): part is string => typeof part === "string" && part.length > 0)
			.join("\n");
		const changedFiles = (input.changedFiles ?? []).filter(Boolean);
		const hasTarget = content.length > 0 || changedFiles.length > 0;

		// Always capture the artifact metadata — that is the "capture a hook artifact"
		// half of the capability (never contains raw secrets: content is not stored
		// verbatim beyond what the caller passed as `output`).
		const artifact = hooks.capture({
			taskId: input.taskId,
			runId: input.runId,
			hook,
			changedFiles,
			command: input.command,
			exitCode: input.exitCode,
			output: input.output,
		});

		if (!hasTarget) {
			return {
				status: "empty",
				hook,
				findings: [],
				artifact,
				reason: "no content or changed files to scan/capture",
			};
		}

		const findings: HookFinding[] = (content.length > 0 ? hooks.scan(content) : []).map(
			(finding) => ({ kind: finding.kind, match: finding.match, index: finding.index }),
		);
		const status: CaptureHookStatus = findings.length > 0 ? "blocked" : "ok";
		return {
			status,
			hook,
			findings,
			artifact,
			reason: findings.length > 0 ? "potential secret material detected" : undefined,
		};
	}

	return { verify, captureHook };
}

type WorkflowRunTask = Parameters<AgentOsWorkflowRunner["run"]>[0]["task"];

async function safeRunCheck(
	runner: VerificationRunnerPort,
	check: VerificationCheck,
	ctx: VerificationContext,
) {
	try {
		return await runner.runCheck(check, ctx);
	} catch (error) {
		return {
			status: "errored" as CheckStatus,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

/** Map a check outcome onto a workflow node status (errored ⇒ failed node). */
function toNodeStatus(status: CheckStatus): WorkflowNodeStatus {
	if (status === "passed") return "completed";
	if (status === "skipped") return "skipped";
	return "failed";
}

/**
 * Map the OWNED runner's `WorkflowRun` back into per-check verdict rows. Checks
 * that never ran (because a prior check failed and the chain stopped) surface as
 * `skipped` — truthful, not fabricated as passed.
 */
function mapRunToChecks(
	checks: VerificationCheck[],
	definition: WorkflowDefinition,
	run: WorkflowRun,
): CheckResult[] {
	const executions = new Map(
		(run.nodeExecutions ?? [])
			.filter((execution) => execution.nodeId !== SYNTHETIC_NODE_ID)
			.map((execution) => [execution.nodeId, execution]),
	);

	return definition.nodes.map((node, index) => {
		const check = checks[index];
		const kind = typeof node.config?.kind === "string" ? node.config.kind : node.kind;
		const execution = executions.get(node.nodeId);

		if (!execution) {
			return {
				name: check.name,
				kind,
				status: "skipped",
				passed: false,
				reason: "check did not run (a prior check failed)",
			};
		}

		const output = execution.output ?? {};
		const status = readCheckStatus(output, execution.status);
		return {
			name: check.name,
			kind,
			status,
			passed: status === "passed",
			output: typeof output.output === "string" ? output.output : undefined,
			durationMs: typeof output.durationMs === "number" ? output.durationMs : undefined,
			reason:
				typeof output.reason === "string" ? output.reason : execution.error ?? undefined,
		};
	});
}

function readCheckStatus(
	output: Record<string, unknown>,
	nodeStatus: WorkflowNodeStatus,
): CheckStatus {
	const raw = output.checkStatus;
	if (raw === "passed" || raw === "failed" || raw === "skipped" || raw === "errored") {
		return raw;
	}
	if (nodeStatus === "completed") return "passed";
	if (nodeStatus === "skipped") return "skipped";
	return "failed";
}

// Re-export so the composition root can reference the node-id helper if needed.
export { checkNodeId };
