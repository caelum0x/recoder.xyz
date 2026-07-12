/**
 * types — the wire-facing shapes for the Workflow+Hooks capability (E12).
 *
 * A `verify` call runs a named verification workflow over a TaskSpec/run and
 * returns a truthful verdict `{ status, checks[], passed }`. A `captureHook` call
 * captures a hook artifact and runs a secret-scan, returning `{ status, findings[] }`.
 * Both degrade truthfully — no runner/hook configured ⇒ `status: 'not_configured'`.
 */
import type { AgentHookArtifact } from "@recoder/agent-hooks/artifact-capture";

/** Outcome of a single check the verification runner executed. */
export type CheckStatus = "passed" | "failed" | "skipped" | "errored";

/** A single verification step in a named workflow (E12: verify, browser-check, memory). */
export interface VerificationCheck {
	/** Stable name of the check (surfaced in the verdict). */
	name: string;
	/** Logical kind — maps to a workflow node kind. Defaults to 'verification'. */
	kind?: "verification" | "browser-check" | "memory" | string;
	/** Optional command the runner executes to satisfy the check. */
	command?: string;
	/** Extra config passed through to the runner. */
	config?: Record<string, unknown>;
}

/** What the injected runner reports back for one check. */
export interface CheckRunOutcome {
	status: CheckStatus;
	/** Truncated stdout/stderr or a human summary. */
	output?: string;
	durationMs?: number;
	reason?: string;
}

/** The runner's per-check result as surfaced in the verdict. */
export interface CheckResult {
	name: string;
	kind: string;
	status: CheckStatus;
	passed: boolean;
	output?: string;
	durationMs?: number;
	reason?: string;
}

export type VerifyStatus = "passed" | "failed" | "not_configured" | "empty";

export interface VerifyInput {
	/** Named workflow to run (defaults to the composition's default workflow). */
	workflow?: string;
	/** Task the workflow verifies (optional; enables intent tagging). */
	task?: { taskId?: string; intent?: string } & Record<string, unknown>;
	taskId?: string;
	runId?: string;
	/** Explicit checks to run — overrides the named workflow when provided. */
	checks?: VerificationCheck[];
}

export interface VerifyVerdict {
	status: VerifyStatus;
	workflow: string;
	taskId?: string;
	runId?: string;
	checks: CheckResult[];
	/** True only when no check failed or errored (skips do not fail delivery). */
	passed: boolean;
	reason?: string;
}

export type CaptureHookStatus = "ok" | "blocked" | "not_configured" | "empty";

export interface HookFinding {
	kind: string;
	/** Redacted match (the runner never returns raw secret material). */
	match: string;
	index: number;
}

export interface CaptureHookInput {
	/** Hook label (e.g. 'post-tool-use', 'secret-scan'). */
	hook?: string;
	/** Free-text content to secret-scan (tool input, diff, message). */
	content?: string;
	/** Command associated with the hook (scanned + recorded). */
	command?: string;
	/** Files changed by the action (recorded in the artifact). */
	changedFiles?: string[];
	/** Command output to record. */
	output?: string;
	exitCode?: number;
	taskId?: string;
	runId?: string;
}

export interface CaptureHookResult {
	status: CaptureHookStatus;
	hook: string;
	findings: HookFinding[];
	/** The captured hook artifact metadata (never contains raw secrets). */
	artifact?: AgentHookArtifact;
	reason?: string;
}
