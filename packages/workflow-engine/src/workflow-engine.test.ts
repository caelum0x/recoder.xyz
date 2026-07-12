import { describe, expect, it } from "vitest";
import {
	createAgentHooksHookRunner,
	createCommandVerificationRunner,
	createUnconfiguredHookRunner,
	createUnconfiguredVerificationRunner,
	type ExecFn,
	type ExecResult,
	type VerificationRunnerPort,
} from "./ports.js";
import type { CheckRunOutcome, VerificationCheck } from "./types.js";
import { createWorkflowEngine } from "./workflow-engine.js";

// ── Fakes (no network / subprocess / fs) ─────────────────────────────────────

/**
 * A verification runner driven by a name→outcome map. Any check not in the map
 * passes. `configured` toggles the degrade path.
 */
function fakeRunner(
	outcomes: Record<string, CheckRunOutcome> = {},
	configured = true,
): VerificationRunnerPort & { calls: string[] } {
	const calls: string[] = [];
	return {
		configured,
		calls,
		async runCheck(check: VerificationCheck): Promise<CheckRunOutcome> {
			calls.push(check.name);
			return outcomes[check.name] ?? { status: "passed", output: `${check.name} ok` };
		},
	};
}

/** A runner whose runCheck throws — proves the engine catches and reports 'errored'. */
function throwingRunner(): VerificationRunnerPort {
	return {
		configured: true,
		async runCheck() {
			throw new Error("boom");
		},
	};
}

/** A fake exec for the command runner: exit code keyed by command substring. */
function fakeExec(codes: Record<string, ExecResult>): ExecFn {
	return async (command) => codes[command] ?? { exitCode: 0, stdout: "ok" };
}

const now = () => "2026-07-13T00:00:00.000Z";
const createRunId = () => "wfrun_test";

// ── verify: happy path ───────────────────────────────────────────────────────

describe("createWorkflowEngine.verify", () => {
	it("runs the default delivery workflow and returns a passing verdict", async () => {
		const runner = fakeRunner();
		const engine = createWorkflowEngine({ runner, now, createRunId });

		const verdict = await engine.verify({ taskId: "task_1" });

		expect(verdict.status).toBe("passed");
		expect(verdict.passed).toBe(true);
		expect(verdict.workflow).toBe("delivery");
		expect(verdict.taskId).toBe("task_1");
		// verify → browser-check → memory, in order.
		expect(verdict.checks.map((c) => c.name)).toEqual([
			"verify",
			"browser-check",
			"memory",
		]);
		expect(verdict.checks.every((c) => c.status === "passed")).toBe(true);
		expect(runner.calls).toEqual(["verify", "browser-check", "memory"]);
	});

	it("surfaces a failing check truthfully and stops the chain", async () => {
		const runner = fakeRunner({
			"browser-check": { status: "failed", reason: "preview 500", output: "boom" },
		});
		const engine = createWorkflowEngine({ runner, now, createRunId });

		const verdict = await engine.verify({ workflow: "delivery", runId: "run_9" });

		expect(verdict.status).toBe("failed");
		expect(verdict.passed).toBe(false);

		const byName = Object.fromEntries(verdict.checks.map((c) => [c.name, c]));
		expect(byName.verify.status).toBe("passed");
		expect(byName["browser-check"].status).toBe("failed");
		expect(byName["browser-check"].reason).toBe("preview 500");
		// memory never ran because browser-check failed — reported as skipped, not passed.
		expect(byName.memory.status).toBe("skipped");
		expect(byName.memory.passed).toBe(false);
		expect(runner.calls).toEqual(["verify", "browser-check"]);
	});

	it("catches a throwing runner and reports the check as errored", async () => {
		const engine = createWorkflowEngine({
			runner: throwingRunner(),
			now,
			createRunId,
		});

		const verdict = await engine.verify({ workflow: "verify" });

		expect(verdict.status).toBe("failed");
		expect(verdict.passed).toBe(false);
		expect(verdict.checks[0].status).toBe("errored");
		expect(verdict.checks[0].reason).toMatch(/boom/);
	});

	it("treats a skipped check as non-failing", async () => {
		const runner = fakeRunner({
			"browser-check": { status: "skipped", reason: "no preview url" },
		});
		const engine = createWorkflowEngine({ runner, now, createRunId });

		const verdict = await engine.verify({ workflow: "delivery" });

		// A skip does not fail the run; verify + memory still pass.
		expect(verdict.status).toBe("passed");
		expect(verdict.passed).toBe(true);
		expect(verdict.checks.map((c) => c.status)).toEqual([
			"passed",
			"skipped",
			"passed",
		]);
	});

	it("accepts explicit checks that override the named workflow", async () => {
		const runner = fakeRunner();
		const engine = createWorkflowEngine({ runner, now, createRunId });

		const verdict = await engine.verify({
			workflow: "custom",
			checks: [{ name: "lint" }, { name: "types" }],
		});

		expect(verdict.status).toBe("passed");
		expect(verdict.checks.map((c) => c.name)).toEqual(["lint", "types"]);
	});

	// ── degrade-safe ───────────────────────────────────────────────────────────

	it("degrades to not_configured when no runner is wired", async () => {
		const engine = createWorkflowEngine({
			runner: createUnconfiguredVerificationRunner(),
			now,
			createRunId,
		});

		const verdict = await engine.verify({ workflow: "delivery" });

		expect(verdict.status).toBe("not_configured");
		expect(verdict.passed).toBe(false);
		expect(verdict.checks).toEqual([]);
		expect(verdict.reason).toMatch(/not configured/);
	});

	it("reports empty when the workflow has no checks", async () => {
		const engine = createWorkflowEngine({ runner: fakeRunner(), now, createRunId });
		const verdict = await engine.verify({ workflow: "does-not-exist" });
		expect(verdict.status).toBe("empty");
		expect(verdict.checks).toEqual([]);
	});
});

// ── verify: command runner over a fake exec ──────────────────────────────────

describe("createCommandVerificationRunner", () => {
	it("passes on exit 0 and fails on non-zero, via the injected exec", async () => {
		const runner = createCommandVerificationRunner({
			exec: fakeExec({
				"pnpm test": { exitCode: 0, stdout: "42 passed" },
				"pnpm lint": { exitCode: 1, stderr: "3 errors" },
			}),
		});
		const engine = createWorkflowEngine({ runner, now, createRunId });

		const verdict = await engine.verify({
			workflow: "ci",
			checks: [
				{ name: "test", command: "pnpm test" },
				{ name: "lint", command: "pnpm lint" },
			],
		});

		expect(verdict.status).toBe("failed");
		const byName = Object.fromEntries(verdict.checks.map((c) => [c.name, c]));
		expect(byName.test.status).toBe("passed");
		expect(byName.test.output).toContain("42 passed");
		expect(byName.lint.status).toBe("failed");
		expect(byName.lint.output).toContain("3 errors");
	});

	it("skips a check with no command", async () => {
		const runner = createCommandVerificationRunner({ exec: fakeExec({}) });
		const engine = createWorkflowEngine({ runner, now, createRunId });
		const verdict = await engine.verify({
			workflow: "ci",
			checks: [{ name: "manual" }],
		});
		expect(verdict.checks[0].status).toBe("skipped");
		expect(verdict.status).toBe("passed");
	});
});

// ── captureHook ──────────────────────────────────────────────────────────────

describe("createWorkflowEngine.captureHook", () => {
	it("captures an artifact and returns ok with no findings for clean content", async () => {
		const engine = createWorkflowEngine({ hooks: createAgentHooksHookRunner() });

		const result = await engine.captureHook({
			hook: "post-tool-use",
			content: "just a normal diff with no secrets",
			changedFiles: ["src/app.ts"],
			taskId: "task_1",
		});

		expect(result.status).toBe("ok");
		expect(result.findings).toEqual([]);
		expect(result.artifact).toBeDefined();
		expect(result.artifact?.metadata.hook).toBe("post-tool-use");
	});

	it("blocks and surfaces redacted findings when a secret is present", async () => {
		const engine = createWorkflowEngine({ hooks: createAgentHooksHookRunner() });

		const result = await engine.captureHook({
			hook: "secret-scan",
			content: "aws_access_key_id = AKIAIOSFODNN7EXAMPLE",
		});

		expect(result.status).toBe("blocked");
		expect(result.findings.length).toBeGreaterThan(0);
		expect(result.findings[0].kind).toBe("aws_access_key_id");
		// Never returns raw secret material.
		expect(result.findings[0].match).toContain("[redacted]");
		expect(result.findings[0].match).not.toContain("OSFODNN7");
	});

	it("reports empty when there is nothing to scan or capture", async () => {
		const engine = createWorkflowEngine({ hooks: createAgentHooksHookRunner() });
		const result = await engine.captureHook({ hook: "post-tool-use" });
		expect(result.status).toBe("empty");
		expect(result.findings).toEqual([]);
	});

	it("degrades to not_configured when the hook runner is absent", async () => {
		const engine = createWorkflowEngine({ hooks: createUnconfiguredHookRunner() });
		const result = await engine.captureHook({ hook: "secret-scan", content: "x" });
		expect(result.status).toBe("not_configured");
		expect(result.findings).toEqual([]);
		expect(result.reason).toMatch(/not configured/);
	});
});
