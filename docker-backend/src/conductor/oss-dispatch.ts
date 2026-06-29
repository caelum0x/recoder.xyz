/**
 * OSS dispatch boundary — wires `@recoder/agent-oss` IN-PROCESS behind the
 * conductor substrate dispatch (substrate-in-process.ts `launch`).
 *
 * MONOREPO RULE (.claude/rules/monorepo.md): OSS execution frameworks
 * (langgraph / crewai / autogen / browser-use / e2b / playwright / ...) are
 * REPLACEABLE execution surfaces that must NEVER own Recoder state. This module
 * enforces that boundary on the real product path: when an in_process workspace
 * is launched with a `runtimeId` that names an OSS provider, the substrate runs
 * the launch input through `@recoder/agent-oss`'s adapter boundary —
 * `assertAdapterCanHandle` + `mapTaskForOssRuntime` — to produce the canonical
 * `OssTaskMapping`. Recoder keeps the Workspace lifecycle, the run record, and
 * the RunEvents; agent-oss only owns the OSS dispatch translation.
 *
 * ADDITIVE + DEGRADE-SAFE: this only activates when the runtimeId resolves to a
 * known OSS adapter profile. For the default runtimes (`recoder_code`,
 * `claude_code`, ...) `resolveOssDispatch` returns `null` and the substrate's
 * prior `@recoder/runtime` path runs unchanged. If the agent-oss boundary throws
 * or the package is unavailable, the caller logs and falls back to prior
 * behavior — an OSS dispatch failure NEVER blocks a launch.
 */
import {
  assertAdapterCanHandle,
  mapTaskForOssRuntime,
  type OssAdapterProfile,
  type OssAdapterRunInput,
  type OssTaskMapping,
  autogenAdapterProfile,
  browserUseAdapterProfile,
  crewAiAdapterProfile,
  daytonaAdapterProfile,
  e2bAdapterProfile,
  githubAdapterProfile,
  langGraphAdapterProfile,
  liteLlmAdapterProfile,
  mem0AdapterProfile,
  openGrokAdapterProfile,
  openZitiAdapterProfile,
  playwrightAdapterProfile,
  sourcegraphAdapterProfile,
  stagehandAdapterProfile,
} from '@recoder/agent-oss';
import type { TaskSpec } from '@recoder/agent-os';
import type { RuntimePolicy } from '@recoder/agent-runtimes';

/**
 * The OSS adapter profiles agent-oss publishes today. Kept as a flat list so the
 * lookup below can match a runtimeId against `adapterId`, `provider`, or a
 * normalized alias without each adapter needing to register itself.
 */
const OSS_PROFILES: readonly OssAdapterProfile[] = [
  autogenAdapterProfile,
  browserUseAdapterProfile,
  crewAiAdapterProfile,
  daytonaAdapterProfile,
  e2bAdapterProfile,
  githubAdapterProfile,
  langGraphAdapterProfile,
  liteLlmAdapterProfile,
  mem0AdapterProfile,
  openGrokAdapterProfile,
  openZitiAdapterProfile,
  playwrightAdapterProfile,
  sourcegraphAdapterProfile,
  stagehandAdapterProfile,
];

/** Normalize a runtime/provider id for tolerant matching (`browser-use` ~ `browser_use`). */
function normalize(id: string): string {
  return id.trim().toLowerCase().replace(/[-_\s]+/g, '_');
}

/**
 * Resolve the agent-oss profile a runtimeId targets, or `undefined` for the
 * proven default runtimes (recoder_code / claude_code / ...). A runtimeId matches
 * when its normalized form equals the profile's normalized `adapterId` or
 * `provider`.
 */
export function resolveOssProfile(runtimeId: string | undefined): OssAdapterProfile | undefined {
  if (!runtimeId) return undefined;
  const target = normalize(runtimeId);
  return OSS_PROFILES.find(
    (profile) => normalize(profile.adapterId) === target || normalize(profile.provider) === target,
  );
}

/** Input the substrate has at launch time, narrowed to what the boundary needs. */
export type OssDispatchLaunch = {
  workspaceId: string;
  runtimeId: string;
  repoPath: string;
  branch: string;
  /** Rendered prompt (preferred) or the raw command the workspace was launched with. */
  prompt: string;
};

export type OssDispatchResult = {
  profile: OssAdapterProfile;
  mapping: OssTaskMapping;
};

/**
 * Build a minimal-but-canonical `TaskSpec` for the OSS boundary from the launch
 * input. This is the same shape the in_process substrate already builds for the
 * runtime engine, kept local so the boundary stays substrate-agnostic.
 */
function buildTaskSpec(input: OssDispatchLaunch): TaskSpec {
  return {
    taskId: `ws_${input.workspaceId}`,
    title: `Conductor in-process workspace ${input.workspaceId}`,
    intent: 'custom',
    goal: input.prompt,
    spaceId: 'conductor',
    repo: input.repoPath,
    branchPolicy: 'reuse_branch',
    targetPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };
}

/**
 * The policy passed to the OSS boundary. Conservative defaults that mirror the
 * in_process driver's own policy; the boundary records it on the mapping so the
 * OSS surface inherits Recoder's policy decision rather than inventing its own.
 */
function buildPolicy(): RuntimePolicy {
  return {
    requireSignedEnvelope: false,
    enforceWorkLocks: false,
    allowNetwork: true,
    allowShell: true,
    approvalMode: 'auto',
  };
}

/**
 * If `runtimeId` targets an OSS framework, run the launch through the
 * `@recoder/agent-oss` boundary and return the canonical mapping. Returns `null`
 * for non-OSS runtimes (the default in-process path) so the caller leaves proven
 * behavior untouched.
 *
 * The boundary is the only place OSS task translation happens; it asserts the
 * adapter can handle the task intent and never lets the OSS surface own Recoder
 * state (the mapping carries only refs back into canonical state).
 */
export function resolveOssDispatch(input: OssDispatchLaunch): OssDispatchResult | null {
  const profile = resolveOssProfile(input.runtimeId);
  if (!profile) return null;

  const task = buildTaskSpec(input);
  const runInput: OssAdapterRunInput = {
    task,
    bundle: {
      bundleId: `ws_${input.workspaceId}`,
      taskId: task.taskId,
      agentId: profile.adapterId,
      runtime: profile.adapterId,
      sharedGoal: input.prompt,
      acceptanceCriteria: [],
      verificationCommands: [],
      forbiddenActions: [],
      approvalGateIds: [],
      memoryRefIds: [],
      sourceRefs: [],
      compilerVersion: 'conductor-oss-dispatch',
      compiledAt: new Date().toISOString(),
      renderedPrompt: input.prompt,
    },
    policy: buildPolicy(),
  };

  // The boundary asserts intent support before producing the mapping. `custom`
  // is supported by every published OSS profile, so a known provider maps; an
  // unsupported intent would throw here and the caller degrades to the prior path.
  assertAdapterCanHandle(profile, task);
  const mapping = mapTaskForOssRuntime(profile, runInput);

  return { profile, mapping };
}
