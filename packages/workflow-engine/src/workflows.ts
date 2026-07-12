/**
 * workflows — the named verification-workflow registry + the definition builder.
 *
 * E12's canonical delivery workflow is `verify → browser-check → memory`. A named
 * workflow is just an ordered list of {@link VerificationCheck}s; the builder turns
 * it into a real `@recoder/agent-workflows` `WorkflowDefinition` (a linear
 * dependency chain) so the OWNED runner does the ordering/execution/tracking.
 */
import type { WorkflowDefinition, WorkflowNode, WorkflowNodeKind } from "@recoder/agent-workflows";
import type { VerificationCheck } from "./types.js";

/** The default workflow the engine runs when none is named. */
export const DEFAULT_WORKFLOW = "delivery";

/** Built-in named workflows. Hosts may override/extend via engine deps. */
export const DEFAULT_WORKFLOWS: Record<string, VerificationCheck[]> = {
	// E12 delivery gate: verify the change, browser-check the preview, then memory.
	delivery: [
		{ name: "verify", kind: "verification" },
		{ name: "browser-check", kind: "browser-check" },
		{ name: "memory", kind: "memory" },
	],
	// A minimal single-step workflow.
	verify: [{ name: "verify", kind: "verification" }],
};

const VALID_NODE_KINDS = new Set<WorkflowNodeKind>([
	"verification",
	"browser-check",
	"memory",
]);

/** Resolve the ordered checks for a workflow: explicit `checks` win over the registry. */
export function resolveChecks(
	workflow: string,
	explicit: VerificationCheck[] | undefined,
	registry: Record<string, VerificationCheck[]>,
): VerificationCheck[] {
	if (explicit && explicit.length > 0) {
		return explicit;
	}
	return registry[workflow] ?? [];
}

/** Map a check kind onto a real workflow node kind (unknown kinds → 'verification'). */
export function toNodeKind(kind: string | undefined): WorkflowNodeKind {
	if (kind && VALID_NODE_KINDS.has(kind as WorkflowNodeKind)) {
		return kind as WorkflowNodeKind;
	}
	return "verification";
}

/** Deterministic node id for check `index`. */
export function checkNodeId(index: number, check: VerificationCheck): string {
	return `check_${index}_${slug(check.name)}`;
}

/**
 * Build a linear `WorkflowDefinition` where check `i` depends on check `i-1`. The
 * chain makes the OWNED runner execute checks in order and stop at the first
 * failure (downstream checks then surface as `skipped` in the verdict).
 */
export function buildDefinition(
	workflow: string,
	checks: VerificationCheck[],
	intent?: string,
): WorkflowDefinition {
	const nodes: WorkflowNode[] = checks.map((check, index) => ({
		nodeId: checkNodeId(index, check),
		kind: toNodeKind(check.kind),
		label: check.name,
		dependsOn: index > 0 ? [checkNodeId(index - 1, checks[index - 1])] : [],
		config: {
			name: check.name,
			kind: check.kind ?? "verification",
			...(check.command ? { command: check.command } : {}),
			...(check.config ?? {}),
		},
	}));

	return {
		workflowId: `wf_${slug(workflow)}`,
		name: workflow,
		version: "1",
		...(intent ? { taskIntent: intent as WorkflowDefinition["taskIntent"] } : {}),
		nodes,
	};
}

/** Read a {@link VerificationCheck} back out of a node's config. */
export function nodeToCheck(node: WorkflowNode): VerificationCheck {
	const config = node.config ?? {};
	return {
		name: typeof config.name === "string" ? config.name : node.label,
		kind: typeof config.kind === "string" ? config.kind : node.kind,
		command: typeof config.command === "string" ? config.command : undefined,
		config,
	};
}

function slug(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "check";
}
