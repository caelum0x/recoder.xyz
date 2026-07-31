/**
 * Capability engine binders — the REAL handlers behind three advertised-but-unbound
 * catalog servers. Before these binders their tools sat in the gated registry with
 * NO in-proc executor, so every call failed truthfully with "No in-proc executor
 * wired". Each binder wires the package's runtime-agnostic `register*McpTools` over
 * a concrete OWNED engine; every call still traverses interop's
 * `authorize → risk → execute → audit` gate at the host boundary.
 *
 *  - `gitNexusEngineBinder` → `recoder.git_nexus.*` over the `@recoder/recodergit`
 *    on-disk indexer (search/package-map/owners/related-tests/impact/context-pack).
 *  - `workflowEngineBinder`  → `recoder.workflow.*` over `@recoder/workflow-engine`
 *    (`workflow.verify` runs a named verification workflow; `workflow.capture_hook`
 *    runs the real agent-hooks secret-scan + artifact capture).
 *  - `notifyEngineBinder`    → `recoder.notify.notify.send` over the OWNED
 *    `@recoder/agent-notify` engine (a resolvable webhook or a truthful
 *    `not_configured`).
 *
 * Every handler degrades truthfully — an unresolvable repo / unconfigured runner /
 * missing webhook yields a real degraded result, never a fabricated success.
 */
import { promisify } from 'node:util';
import { exec as nodeExec } from 'node:child_process';
import {
  registerGitNexusMcpTools,
  registerWorkflowMcpTools,
  registerNotifyMcpTools,
  type McpToolRouter,
} from '@recoder/agent-mcp';
import {
  createWorkflowEngine,
  createCommandVerificationRunner,
  type ExecFn,
  type WorkflowEngine,
} from '@recoder/workflow-engine';
import type { NotifyEngine } from '@recoder/agent-notify';

const execAsync = promisify(nodeExec);
const VERIFY_MAX_BUFFER = 4 * 1024 * 1024;
const VERIFY_DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Build the MINIMAL env overlay for a verification subprocess: PATH so the OS can
 * resolve a bare binary name, plus HOME for tools that need a home dir — and
 * NOTHING else. NEVER `...process.env` (secret-leak guard, mirroring the
 * PATH-only base `runCli`/cli-exec.ts enforces). Computed per-call so it tracks
 * the live PATH.
 */
function minimalVerifyEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
  };
}

/**
 * The verification `exec` seam for `recoder.workflow.verify`. Runs a command with
 * a MINIMAL env (see {@link minimalVerifyEnv}) so an executed check can neither
 * inherit nor exfiltrate backend secrets. Degrade-safe: a non-zero exit is
 * surfaced as a truthful `{ exitCode }` (a `failed` check), never thrown. Exported
 * for the security regression test.
 */
export function createEnginesVerifyExec(cwd: string): ExecFn {
  return async (command, opts) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: opts?.cwd ?? cwd,
        timeout: opts?.timeoutMs ?? VERIFY_DEFAULT_TIMEOUT_MS,
        maxBuffer: VERIFY_MAX_BUFFER,
        // MINIMAL env — never the full process.env (secret-leak guard).
        env: minimalVerifyEnv(),
      });
      return { exitCode: 0, stdout: String(stdout), stderr: String(stderr) };
    } catch (err) {
      // `exec` rejects on a non-zero exit; surface the real exit code + output
      // (a truthful `failed` check) rather than throwing an `errored` one.
      const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
      return {
        exitCode: typeof e.code === 'number' ? e.code : 1,
        stdout: typeof e.stdout === 'string' ? e.stdout : '',
        stderr: typeof e.stderr === 'string' ? e.stderr : e.message ?? '',
      };
    }
  };
}

/**
 * Bind `recoder.git_nexus.*` over the recodergit on-disk indexer. The port resolves
 * every call to the configured repo root (a caller `args.repo` absolute path wins);
 * an unresolved repo throws truthfully inside the package handler. Uses the package
 * default `createRepoIndexer()`.
 */
export function gitNexusEngineBinder(deps: {
  readonly repoRoot: string | null;
}): (router: McpToolRouter) => void {
  return (router) =>
    registerGitNexusMcpTools(router, {
      resolveRepoRoot: ({ repo }) => {
        const resolved = typeof repo === 'string' && repo.trim() ? repo.trim() : deps.repoRoot;
        if (!resolved) {
          throw new Error(
            'git_nexus: repository root unconfigured (pass args.repo or configure engines repoRoot)',
          );
        }
        return resolved;
      },
    });
}

/**
 * Build the OWNED workflow engine (real agent-hooks capture by default) with a
 * bounded command verification runner scoped to the repo root, so `workflow.verify`
 * actually runs a check's command when one is supplied (a check with no command is
 * `skipped`, never a failure). Degrade-safe: a thrown exec is caught by the runner
 * and surfaced as an `errored` check; the engine never throws.
 */
export function createEnginesWorkflowEngine(deps: {
  readonly repoRoot: string | null;
}): WorkflowEngine {
  const cwd = deps.repoRoot ?? process.cwd();
  return createWorkflowEngine({
    runner: createCommandVerificationRunner({
      cwd,
      timeoutMs: VERIFY_DEFAULT_TIMEOUT_MS,
      // Minimal-env exec (PATH/HOME only) — commands that reach here come from the
      // trusted named-workflow registry, never caller free-form input.
      exec: createEnginesVerifyExec(cwd),
    }),
  });
}

/** Bind `recoder.workflow.*` over the OWNED workflow engine (structural port). */
export function workflowEngineBinder(engine: WorkflowEngine): (router: McpToolRouter) => void {
  return (router) => registerWorkflowMcpTools(router, engine);
}

/** Bind `recoder.notify.notify.send` over the OWNED notify engine (structural port). */
export function notifyEngineBinder(engine: NotifyEngine): (router: McpToolRouter) => void {
  return (router) => registerNotifyMcpTools(router, engine);
}
