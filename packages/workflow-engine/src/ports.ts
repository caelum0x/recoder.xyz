/**
 * ports — the injectable seams for the Workflow+Hooks engine.
 *
 * The engine owns NO external I/O. A `VerificationRunnerPort` executes a check
 * (shelling out, calling a service …). A `HookRunnerPort` runs the secret-scan and
 * captures an artifact. Both expose a `configured` flag so the engine can degrade
 * truthfully to `not_configured` without ever throwing.
 *
 * Concrete runners here are BYO-injectable and reuse the OWNED domain packages:
 *   - the hook runner skins `@recoder/agent-hooks` (`scanSecrets`, `createArtifactCapture`).
 *   - the command verification runner takes an injectable `exec` so unit tests drive
 *     it with a fake and touch no subprocess.
 */
import {
	createArtifactCapture,
	type ArtifactCaptureInput,
} from "@recoder/agent-hooks/artifact-capture";
import { scanSecrets } from "@recoder/agent-hooks/secret-scan";
import type { CheckRunOutcome, VerificationCheck } from "./types.js";

/** Context handed to a runner for a single check. */
export interface VerificationContext {
	workflow: string;
	taskId?: string;
	runId?: string;
}

/** Executes verification checks. `configured === false` ⇒ engine degrades truthfully. */
export interface VerificationRunnerPort {
	readonly configured: boolean;
	runCheck(check: VerificationCheck, ctx: VerificationContext): Promise<CheckRunOutcome>;
}

/** Runs the secret-scan hook + captures an artifact. `configured === false` ⇒ degrade. */
export interface HookRunnerPort {
	readonly configured: boolean;
	scan(content: string): Array<{ kind: string; match: string; index: number }>;
	capture(input: ArtifactCaptureInput): ReturnType<typeof createArtifactCapture>;
}

// ── Hook runners ─────────────────────────────────────────────────────────────

/**
 * The default hook runner — skins `@recoder/agent-hooks`. Both `scanSecrets` and
 * `createArtifactCapture` are pure (no I/O), so this is always `configured`.
 */
export function createAgentHooksHookRunner(): HookRunnerPort {
	return {
		configured: true,
		scan: (content) => scanSecrets(content),
		capture: (input) => createArtifactCapture(input),
	};
}

/** A truthfully-unconfigured hook runner (host chose not to wire hooks). */
export function createUnconfiguredHookRunner(): HookRunnerPort {
	return {
		configured: false,
		scan: () => [],
		capture: (input) => createArtifactCapture(input),
	};
}

// ── Verification runners ─────────────────────────────────────────────────────

/** A truthfully-unconfigured verification runner (no driver present). */
export function createUnconfiguredVerificationRunner(): VerificationRunnerPort {
	return {
		configured: false,
		async runCheck() {
			return { status: "skipped", reason: "no verification runner configured" };
		},
	};
}

/** Result of running a shell command via the injected `exec`. */
export interface ExecResult {
	exitCode: number;
	stdout?: string;
	stderr?: string;
}

/** Injectable command executor — the ONLY external seam of the command runner. */
export type ExecFn = (
	command: string,
	opts?: { cwd?: string; timeoutMs?: number },
) => Promise<ExecResult>;

export interface CommandVerificationRunnerOptions {
	/** The injectable executor (fake in tests, child_process in the host). */
	exec: ExecFn;
	/** Overrides the default `configured: true` (e.g. gate behind an env flag). */
	configured?: boolean;
	cwd?: string;
	timeoutMs?: number;
	/** Resolve a command for checks that don't carry their own. */
	resolveCommand?: (check: VerificationCheck) => string | undefined;
	/** Max chars of captured output kept in the outcome. */
	maxOutputChars?: number;
}

const DEFAULT_MAX_OUTPUT = 4000;

/**
 * A verification runner that executes each check's command via the injected `exec`.
 * A check with no command (and no resolver hit) is `skipped` — never a failure. Any
 * thrown executor error is caught and reported as `errored` (never propagated).
 */
export function createCommandVerificationRunner(
	opts: CommandVerificationRunnerOptions,
): VerificationRunnerPort {
	const maxOutput = opts.maxOutputChars ?? DEFAULT_MAX_OUTPUT;
	return {
		configured: opts.configured ?? true,
		async runCheck(check): Promise<CheckRunOutcome> {
			const command = check.command?.trim() || opts.resolveCommand?.(check)?.trim();
			if (!command) {
				return { status: "skipped", reason: `no command for check ${check.name}` };
			}
			const started = Date.now();
			try {
				const res = await opts.exec(command, {
					cwd: opts.cwd,
					timeoutMs: opts.timeoutMs,
				});
				const durationMs = Date.now() - started;
				const output = truncate(res.stdout || res.stderr || "", maxOutput);
				if (res.exitCode === 0) {
					return { status: "passed", output, durationMs };
				}
				return {
					status: "failed",
					output,
					durationMs,
					reason: `command exited ${res.exitCode}`,
				};
			} catch (error) {
				return {
					status: "errored",
					durationMs: Date.now() - started,
					reason: error instanceof Error ? error.message : String(error),
				};
			}
		},
	};
}

function truncate(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max)}…[truncated ${value.length - max} chars]`;
}
