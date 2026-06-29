import type { AgentProfile, InstructionBundle, RunEvent, TaskSpec } from '@recoder/agent-os';
import type { RuntimePolicy } from '@recoder/agent-runtimes';

export type OssIntegrationKind =
  | 'agent_framework'
  | 'sandbox'
  | 'browser_automation'
  | 'code_search'
  | 'llm_router'
  | 'memory_provider'
  | 'private_network'
  | 'deployment'
  | 'observability'
  | 'custom';

export type OssProviderId =
  | 'daytona'
  | 'e2b'
  | 'playwright'
  | 'github'
  | 'openziti'
  | 'litellm'
  | 'langgraph'
  | 'autogen'
  | 'crewai'
  | 'openfang'
  | 'mem0'
  | 'browser_use'
  | 'stagehand'
  | 'sourcegraph'
  | 'opengrok'
  | 'custom';

export type OssAdapterProfile = {
  adapterId: string;
  provider: OssProviderId;
  kind: OssIntegrationKind;
  displayName: string;
  ownsCanonicalState: false;
  supportedTaskIntents: TaskSpec['intent'][];
  requiredCapabilities?: string[];
  emitsRunEvents: boolean;
  requiresPolicyDecision: boolean;
};

export type OssTaskMapping = {
  adapterId: string;
  taskId: string;
  externalRunId?: string;
  externalPayload: Record<string, unknown>;
  recoderStateRefs: {
    taskSpecId: string;
    instructionBundleId?: string;
    agentId?: string;
  };
};

export type OssAdapterRunInput = {
  task: TaskSpec;
  bundle?: InstructionBundle;
  agent?: AgentProfile;
  policy: RuntimePolicy;
};

export interface OssAdapter {
  profile(): OssAdapterProfile;
  mapTask(input: OssAdapterRunInput): OssTaskMapping;
  run?(input: OssAdapterRunInput): AsyncIterable<RunEvent>;
  cancel?(externalRunId: string): Promise<void>;
}

export function createOssAdapterProfile(input: Omit<OssAdapterProfile, 'ownsCanonicalState'>): OssAdapterProfile {
  return {
    ...input,
    ownsCanonicalState: false,
  };
}

export function assertAdapterCanHandle(profile: OssAdapterProfile, task: TaskSpec): void {
  if (!profile.supportedTaskIntents.includes(task.intent)) {
    throw new Error(`OSS adapter ${profile.adapterId} does not support task intent ${task.intent}`);
  }
}

export function mapTaskForOssRuntime(profile: OssAdapterProfile, input: OssAdapterRunInput): OssTaskMapping {
  assertAdapterCanHandle(profile, input.task);
  return {
    adapterId: profile.adapterId,
    taskId: input.task.taskId,
    externalPayload: {
      title: input.task.title,
      goal: input.task.goal,
      acceptanceCriteria: input.task.acceptanceCriteria,
      verificationCommands: input.task.verification.commands,
      renderedPrompt: input.bundle?.renderedPrompt,
      policy: input.policy,
    },
    recoderStateRefs: {
      taskSpecId: input.task.taskId,
      instructionBundleId: input.bundle?.bundleId,
      agentId: input.agent?.agentId,
    },
  };
}
