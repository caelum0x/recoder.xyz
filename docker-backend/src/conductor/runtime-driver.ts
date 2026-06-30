/**
 * Runtime driver engine — the execution surface that drives real agent CLIs
 * through the Conductor substrate.
 *
 * Per docs/subsystems/runtime.md: this fills the gap in the existing
 * packages/agent-runtimes factory shells by providing real driver logic.
 * It translates each CLI's native event format into the uniform substrate
 * launch/capture/alive/exitCode contract, enforcing runtime-layer policy
 * gates (work-locks, forbidden paths) before the model can write.
 *
 * This is NOT a state-of-record — task/approval/memory state lives in
 * @recoder/agent-os. The driver only launches + observes + reports.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { createLogger } from '../logger.js';
import {
  resolveRuntimeCommand,
  runtimeAvailability,
  type ConductorRuntimeId,
  type ResolvedRuntimeCommand,
} from './runtime-commands.js';
import { getSubstrate, type SubstrateHandle } from './substrate.js';
import { gateLaunch, captureLaunchArtifact } from './hook-gate.js';
import { startRunTail, stopRunTail } from './run-tailer.js';
import {
  conductorAvailability,
  type ConductorSession,
} from './tmux-orchestrator.js';
import type { Workspace, WorkspaceSubstrate, RunEvent } from '@recoder/agent-os';

const exec = promisify(execFile);
const logger = createLogger('conductor:runtime-driver');

export interface RuntimeLaunchRequest {
  workspaceId: string;
  taskId: string;
  runId: string;
  spaceId: string;
  projectId: string;
  runtimeId: ConductorRuntimeId;
  prompt: string;
  model?: string;
  extraArgs?: string[];
  repoPath: string;
  branch: string;
  baseRef: string;
  env?: Record<string, string>;
  substrate: WorkspaceSubstrate;
  createdBy: string;
}

export interface RuntimeLaunchResult {
  success: boolean;
  command: ResolvedRuntimeCommand;
  handle?: SubstrateHandle;
  sessionName?: string;
  worktreePath?: string;
  error?: string;
  /** Set true when the in-process hook gate blocked the launch (vs. infra failure). */
  blockedByPolicy?: boolean;
  /** Post-launch audit artifact captured by the in-process hook (best-effort). */
  launchArtifactKey?: string;
}

/**
 * Resolve + launch a real agent CLI through the selected substrate.
 *
 * This is the single entry point that workspace-service calls to start an
 * agent run. It: (1) checks runtime availability, (2) resolves the headless
 * CLI invocation, (3) launches via the substrate, (4) binds the run-tailer.
 */
export async function launchRuntime(request: RuntimeLaunchRequest): Promise<RuntimeLaunchResult> {
  const { runtimeId, prompt, model, extraArgs, repoPath } = request;

  // 1. Verify the runtime CLI is installed (truthful — never assume).
  const availability = await runtimeAvailability();
  const runtimeAvail = availability.find((r) => r.runtimeId === runtimeId);
  if (!runtimeAvail?.available) {
    return {
      success: false,
      command: { runtimeId, bin: runtimeAvail?.bin ?? runtimeId, commandLine: '' },
      error: `runtime ${runtimeId} not available (bin ${runtimeAvail?.bin ?? 'unknown'} not on PATH)`,
    };
  }

  // 2. Resolve the real headless CLI invocation.
  let command: ResolvedRuntimeCommand;
  try {
    command = resolveRuntimeCommand(runtimeId, { prompt, model, extraArgs });
  } catch (err) {
    return {
      success: false,
      command: { runtimeId, bin: runtimeAvail.bin, commandLine: '' },
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 2b. In-process hook gate: secret + path/command policy check on the
  // agent-controlled prompt + resolved command line BEFORE the agent can write.
  // Degrade-safe: only a positive `block` decision stops the launch.
  const gate = gateLaunch({
    workspaceId: request.workspaceId,
    taskId: request.taskId,
    runId: request.runId,
    commandLine: command.commandLine,
    prompt: request.prompt,
    repoPath,
    branch: request.branch,
    runtimeId,
    createdBy: request.createdBy,
  });
  if (!gate.allowed) {
    return {
      success: false,
      command,
      blockedByPolicy: true,
      error: `blocked by hook policy: ${gate.blockedReason ?? 'policy violation'}`,
    };
  }

  // 3. Launch via the selected substrate.
  const substrate = getSubstrate(request.substrate);
  const substrateAvail = await substrate.available();
  if (!substrateAvail.available) {
    return {
      success: false,
      command,
      error: `substrate ${request.substrate} unavailable: ${substrateAvail.reason ?? 'unknown'}`,
    };
  }

  // Inject the outer-agent identity env into the launched CLI process so its
  // child pal MCP server (stdio child) inherits these and can emit correlated
  // RunEvents back to the control plane. MCP stdio children inherit the parent
  // CLI env, so setting them here at launch is sufficient — we never write
  // secrets into .mcp.json or config.toml. When any of these are unset the PAL
  // emitter is a deliberate no-op. Built immutably (spread, no mutation) so the
  // caller-provided request.env is preserved and not modified in place.
  const internalServiceKey = process.env.INTERNAL_SERVICE_KEY ?? '';
  const localBackendBase = `http://127.0.0.1:${process.env.PORT ?? '3100'}`;
  const internalUrl = process.env.RECODER_INTERNAL_URL ?? localBackendBase;
  // Point the launched agent's A2A MCP server at THIS LOCAL backend's bridge so it
  // registers locally (and other local agents can see it) instead of defaulting to
  // the production bridge. MCP stdio children inherit the parent CLI env, so setting
  // these here is sufficient — no .mcp.json edit needed. Respect any explicit
  // operator override (RECODER_DOCKER_URL / RECODER_A2A_URL) so a cloud-targeted
  // backend can still steer spawned agents at a remote bridge.
  const localDockerUrl = process.env.RECODER_DOCKER_URL ?? localBackendBase;
  const localBridgeUrl =
    process.env.RECODER_A2A_URL ??
    `${localDockerUrl.replace('https:', 'wss:').replace('http:', 'ws:').replace(/\/+$/, '')}/agent-bridge`;
  // Mint (once per process) a local A2A bridge token so the spawned agent can
  // AUTHENTICATE to THIS backend's /agent-bridge WS — resolveA2ASystemSession
  // (auth-utils.ts) matches RECODER_A2A_BRIDGE_TOKEN. Without a token the bridge
  // closes the connection (1008 'Authentication required') and the agent shows
  // "disconnected" despite the correct local URL. The agent's MCP client appends
  // it as ?token= via PLATFORM_TOKEN. An operator-set A2A token (shared-secret /
  // bridge / worker) is reused as-is; cloud behavior is unchanged.
  let a2aBridgeToken =
    process.env.RECODER_A2A_SHARED_SECRET?.trim() ||
    process.env.RECODER_A2A_BRIDGE_TOKEN?.trim() ||
    process.env.RECODER_A2A_WORKER_TOKEN?.trim() ||
    '';
  if (!a2aBridgeToken) {
    a2aBridgeToken = `a2a-local-${randomBytes(24).toString('hex')}`;
    process.env.RECODER_A2A_BRIDGE_TOKEN = a2aBridgeToken;
  }
  const launchEnv: Record<string, string> = {
    ...(request.env ?? {}),
    RECODER_RUN_ID: request.runId,
    RECODER_TASK_ID: request.taskId,
    RECODER_INTERNAL_URL: internalUrl,
    INTERNAL_SERVICE_KEY: internalServiceKey,
    RECODER_DOCKER_URL: localDockerUrl,
    RECODER_A2A_URL: localBridgeUrl,
    PLATFORM_TOKEN: a2aBridgeToken,
  };

  let handle: SubstrateHandle;
  try {
    handle = await substrate.launch({
      workspaceId: request.workspaceId,
      command: command.commandLine,
      repoPath,
      branch: request.branch,
      baseRef: request.baseRef,
      env: launchEnv,
    });
  } catch (err) {
    return {
      success: false,
      command,
      error: `substrate launch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Bind the run-tailer to stream output into the RunEvent log.
  startRunTail({
    workspaceId: request.workspaceId,
    taskId: request.taskId,
    runId: request.runId,
    substrate: request.substrate,
    sessionName: handle.sessionName ?? handle.ref,
    worktreePath: handle.worktreePath,
  });

  // Post-launch: capture an audit artifact for the run trail (best-effort).
  const launchArtifact = captureLaunchArtifact({
    taskId: request.taskId,
    runId: request.runId,
    commandLine: command.commandLine,
    changedFiles: handle.worktreePath ? [handle.worktreePath] : undefined,
  });

  logger.info(
    { workspaceId: request.workspaceId, runtimeId, bin: command.bin, sessionName: handle.sessionName },
    'runtime launched',
  );

  return {
    success: true,
    command,
    handle,
    sessionName: handle.sessionName ?? handle.ref,
    worktreePath: handle.worktreePath,
    launchArtifactKey: launchArtifact?.key,
  };
}

/**
 * Stop a running agent: stop the run-tailer + teardown the substrate handle.
 */
export async function stopRuntime(
  workspaceId: string,
  substrate: WorkspaceSubstrate,
  handle: SubstrateHandle,
  options?: { removeIsolation?: boolean },
): Promise<void> {
  stopRunTail(workspaceId);
  await getSubstrate(substrate).teardown(handle, options);
}

/**
 * Get the current status of a running agent (alive + exit code + recent output).
 */
export async function runtimeStatus(
  substrate: WorkspaceSubstrate,
  handle: SubstrateHandle,
): Promise<{
  alive: boolean;
  exitCode?: number | null;
  recentOutput: string | null;
}> {
  const sub = getSubstrate(substrate);
  const [alive, recentOutput] = await Promise.all([
    sub.alive(handle),
    sub.capture(handle, 50),
  ]);
  let exitCode: number | null | undefined;
  if (!alive && sub.exitCode) {
    exitCode = await sub.exitCode(handle);
  }
  return { alive, exitCode, recentOutput };
}

/**
 * Send input to a running agent (steering, approval, interrupt).
 * Only works for interactive substrates (tmux).
 */
export async function steerRuntime(
  substrate: WorkspaceSubstrate,
  handle: SubstrateHandle,
  keys: string,
): Promise<void> {
  if (substrate !== 'tmux_worktree') {
    throw new Error(`steering not supported on substrate ${substrate}`);
  }
  // Use the raw orchestrator for tmux send-keys (survivable via deterministic name).
  const { sendKeys } = await import('./tmux-orchestrator.js');
  await sendKeys(handle.ref, keys);
}

/**
 * Full runtime availability snapshot for the health endpoint.
 */
export async function runtimeDriverHealth(): Promise<{
  substrate: { available: boolean; git: boolean; tmux: boolean; tmuxBin: string };
  runtimes: { runtimeId: ConductorRuntimeId; bin: string; available: boolean; path?: string }[];
  activeTails: number;
}> {
  const [substrate, runtimes] = await Promise.all([
    conductorAvailability(),
    runtimeAvailability(),
  ]);
  const { activeTailCount } = await import('./run-tailer.js');
  return {
    substrate: {
      available: substrate.available,
      git: substrate.git,
      tmux: substrate.tmux,
      tmuxBin: substrate.tmuxBin,
    },
    runtimes,
    activeTails: activeTailCount(),
  };
}
