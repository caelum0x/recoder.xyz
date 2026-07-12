/**
 * workflow-engine — docker-backend's concrete binding for the `recoder.workflow`
 * MCP server. It composes the OWNED `@recoder/workflow-engine` (which itself skins
 * `@recoder/agent-workflows` for the runner and `@recoder/agent-hooks` for
 * secret-scan + artifact capture), then registers the package's real
 * `workflow.verify` / `workflow.capture_hook` handlers behind the interop gate.
 *
 * DEGRADE-SAFE: the hook runner (`scanSecrets` + `createArtifactCapture`) is pure,
 * so `capture_hook` is always available. The verification runner shells out via
 * node's child_process and is GATED behind `RECODER_WORKFLOW_VERIFY` — when unset,
 * an unconfigured runner is wired and `workflow.verify` returns a truthful
 * `status: 'not_configured'`. Nothing here fakes success: the desktop boots and the
 * tools stay callable with zero external commands enabled.
 */
import { registerWorkflowMcpTools as registerWorkflowToolHandlers } from '@recoder/agent-mcp';
import {
  createAgentHooksHookRunner,
  createCommandVerificationRunner,
  createUnconfiguredVerificationRunner,
  createWorkflowEngine,
  type ExecFn,
  type ExecResult,
  type VerificationRunnerPort,
} from '@recoder/workflow-engine';
import type { McpToolRouter } from '@recoder/agent-mcp';

type WorkflowEnv = {
  RECODER_WORKFLOW_VERIFY?: string;
  RECODER_WORKFLOW_CWD?: string;
  RECODER_WORKFLOW_TIMEOUT_MS?: string;
};

export type WorkflowEngineDeps = {
  /** Injectable executor (defaults to a lazily-imported child_process spawn). */
  exec?: ExecFn;
  /** Env subset read by the composition root. Defaults to process.env. */
  env?: WorkflowEnv;
  /** Working directory for verification commands. */
  cwd?: string;
};

/**
 * Register the REAL workflow handlers on the router. The verification runner is
 * opt-in (env `RECODER_WORKFLOW_VERIFY=1`) so the default posture is a truthful
 * `not_configured`; the hook runner is always the agent-hooks skin.
 */
export function registerWorkflowMcpTools(
  router: McpToolRouter,
  deps: WorkflowEngineDeps = {},
): void {
  const env = deps.env ?? (process.env as WorkflowEnv);
  const enabled = env.RECODER_WORKFLOW_VERIFY === '1' || env.RECODER_WORKFLOW_VERIFY === 'true';

  const runner: VerificationRunnerPort = enabled
    ? createCommandVerificationRunner({
        exec: deps.exec ?? defaultExec,
        cwd: deps.cwd ?? env.RECODER_WORKFLOW_CWD ?? process.cwd(),
        timeoutMs: readTimeout(env.RECODER_WORKFLOW_TIMEOUT_MS),
      })
    : createUnconfiguredVerificationRunner();

  const engine = createWorkflowEngine({
    runner,
    hooks: createAgentHooksHookRunner(),
  });

  registerWorkflowToolHandlers(router, engine);
}

const DEFAULT_TIMEOUT_MS = 120_000;

function readTimeout(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * The default executor — a lazily-imported child_process spawn. It NEVER throws:
 * spawn errors resolve to a non-zero exit with the error captured on stderr, and
 * the engine surfaces that as an `errored`/`failed` check.
 */
const defaultExec: ExecFn = async (command, opts) => {
  const { spawn } = await import('node:child_process');
  return await new Promise<ExecResult>((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd: opts?.cwd,
      timeout: opts?.timeoutMs,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
};

export { workflowMcpServer } from '@recoder/agent-mcp';
