import {
  AgentCapabilityKindEnum,
  AgentRuntimeKindEnum,
  ApprovalPolicyModeEnum,
  CwdPolicyModeEnum,
  MemoryScopeEnum,
  PermissionEffectEnum,
  RuntimeHealthStatusEnum,
  TaskIntentEnum,
  createAgentProfile,
  type AgentProfile,
  type InstructionBundle,
  type TaskIntent,
} from '../../../packages/a2a-sdk/src/index';
import {
  compileInstructionBundle,
  type MemorySnapshot,
} from '../../../packages/agent-instructions/src/index';
import {
  evaluatePreToolUse,
  evaluateStop,
  type AgentHookDecision,
} from '../../../packages/agent-hooks/src/index';

type Runtime = 'claude_code' | 'codex' | 'recoder_code';

export type EvalTask = {
  id: string;
  state:
    | 'created'
    | 'compiled'
    | 'claimed'
    | 'running'
    | 'waiting_for_approval'
    | 'verifying'
    | 'completed'
    | 'failed';
  prompt: string;
  assignee: string;
  bundle?: InstructionBundle;
  logs: string[];
  artifacts: Array<{ key: string; content: string; metadata?: Record<string, unknown> }>;
  approvals: Array<{ id: string; status: 'pending' | 'approved' | 'rejected'; reason: string }>;
  verificationOutput?: string;
};

export class AgentOsEvalHarness {
  agents = new Map<string, AgentProfile>();
  tasks = new Map<string, EvalTask>();
  memoryCandidates: Array<{ id: string; taskId: string; status: 'pending' | 'approved' | 'rejected'; title: string }> = [];
  memory: Array<{ id: string; title: string }> = [];
  events: Array<{ type: string; subject: string }> = [];

  connectAgent(runtime: Runtime, id = runtime): AgentProfile {
    const existing = this.agents.get(id);
    const profile = createEvalAgent(runtime, id);
    this.agents.set(id, existing ? { ...profile, last_seen_at: profile.last_seen_at } : profile);
    this.events.push({ type: existing ? 'recoder.agent.reconnected' : 'recoder.agent.connected', subject: id });
    this.events.push({ type: 'recoder.agent.capabilities.updated', subject: id });
    return this.agents.get(id)!;
  }

  createTask(input: { prompt: string; assignee: string; intent?: TaskIntent; forbiddenPaths?: string[]; verify?: string[] }): EvalTask {
    const agent = this.agents.get(input.assignee);
    if (!agent) throw new Error(`Agent is not connected: ${input.assignee}`);
    const id = `task_${this.tasks.size + 1}`;
    const bundle = compileForEval({
      agent,
      prompt: input.prompt,
      intent: input.intent ?? TaskIntentEnum.Bugfix,
      forbiddenPaths: input.forbiddenPaths ?? [],
      verify: input.verify ?? ['pnpm agent:instructions:check'],
      memory: this.memory.map((entry): MemorySnapshot => ({
        memory_id: entry.id,
        scope: 'repo',
        title: entry.title,
        body: entry.title,
      })),
    });
    const task: EvalTask = {
      id,
      state: 'compiled',
      prompt: input.prompt,
      assignee: input.assignee,
      bundle,
      logs: [],
      artifacts: [
        {
          key: `instruction-bundle:${id}`,
          content: JSON.stringify(bundle),
          metadata: { type: 'instruction_bundle' },
        },
      ],
      approvals: [],
    };
    this.tasks.set(id, task);
    this.events.push({ type: 'recoder.task.created', subject: id });
    this.events.push({ type: 'recoder.task.compiled', subject: id });
    return task;
  }

  claimTask(taskId: string, agentId: string): EvalTask {
    const task = this.requireTask(taskId);
    if (task.assignee !== agentId) throw new Error('Task assigned to a different agent');
    task.state = 'claimed';
    this.events.push({ type: 'recoder.task.claimed', subject: taskId });
    return task;
  }

  runTask(taskId: string): EvalTask {
    const task = this.requireTask(taskId);
    task.state = 'running';
    task.logs.push('run started');
    this.events.push({ type: 'recoder.run.started', subject: taskId });
    this.events.push({ type: 'recoder.run.log.appended', subject: taskId });
    return task;
  }

  attachArtifact(taskId: string, key: string, content: string): void {
    const task = this.requireTask(taskId);
    task.artifacts.push({ key, content });
    this.events.push({ type: 'recoder.artifact.created', subject: taskId });
  }

  requestApproval(taskId: string, reason: string): string {
    const task = this.requireTask(taskId);
    const id = `approval_${task.approvals.length + 1}`;
    task.state = 'waiting_for_approval';
    task.approvals.push({ id, reason, status: 'pending' });
    this.events.push({ type: 'recoder.approval.requested', subject: taskId });
    return id;
  }

  approve(taskId: string, approvalId: string): void {
    const task = this.requireTask(taskId);
    const approval = task.approvals.find((item) => item.id === approvalId);
    if (!approval) throw new Error(`Unknown approval: ${approvalId}`);
    approval.status = 'approved';
    task.state = 'running';
    this.events.push({ type: 'recoder.approval.approved', subject: taskId });
  }

  verify(taskId: string, output: string): void {
    const task = this.requireTask(taskId);
    task.state = 'verifying';
    task.verificationOutput = output;
    this.attachArtifact(taskId, 'verification-output', output);
    this.events.push({ type: 'recoder.verification.completed', subject: taskId });
  }

  completeWithMemoryCandidate(taskId: string): void {
    const task = this.requireTask(taskId);
    const decision = evaluateStop({
      taskId,
      artifactId: 'verification-output',
      result: {
        data: {
          memoryCandidate: {
            scope: 'repo',
            title: 'Agent OS eval verification command',
            body: 'Use the Agent OS eval script to validate control-plane contract behavior.',
          },
        },
      },
    });
    for (const candidate of decision.memoryCandidates ?? []) {
      this.memoryCandidates.push({
        id: `memory_candidate_${this.memoryCandidates.length + 1}`,
        taskId,
        status: 'pending',
        title: candidate.title,
      });
      this.events.push({ type: 'recoder.memory.candidate.created', subject: taskId });
    }
    task.state = 'completed';
    this.events.push({ type: 'recoder.run.completed', subject: taskId });
  }

  approveMemoryCandidate(candidateId: string): void {
    const candidate = this.memoryCandidates.find((item) => item.id === candidateId);
    if (!candidate) throw new Error(`Unknown memory candidate: ${candidateId}`);
    candidate.status = 'approved';
    this.memory.push({ id: `memory_${this.memory.length + 1}`, title: candidate.title });
    this.events.push({ type: 'recoder.memory.accepted', subject: candidate.taskId });
  }

  enforce(input: Parameters<typeof evaluatePreToolUse>[0]): AgentHookDecision {
    return evaluatePreToolUse(input);
  }

  private requireTask(taskId: string): EvalTask {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    return task;
  }
}

export function createEvalAgent(runtime: Runtime, id = runtime): AgentProfile {
  return createAgentProfile({
    agent_id: id,
    display_name: id,
    vendor_surface: runtime,
    connector_id: `${runtime}-connector`,
    runtime_kind: AgentRuntimeKindEnum.Local,
    capabilities: [
      { capability_id: 'implementation', label: 'Implementation', kind: AgentCapabilityKindEnum.Implementation },
      { capability_id: 'verification', label: 'Verification', kind: AgentCapabilityKindEnum.Verification },
    ],
    tools: [{ tool_name: `${runtime}-cli`, modes: ['execute'] }],
    supported_task_intents: [TaskIntentEnum.Bugfix, TaskIntentEnum.Verification, TaskIntentEnum.PlatformHardening],
    permissions: {
      default_file_effect: PermissionEffectEnum.Deny,
      path_rules: [],
      tool_rules: [],
      allow_network: true,
      allow_shell: true,
      allow_git_write: false,
      allow_pr_creation: false,
      allow_secrets_access: false,
      max_parallel_subagents: 1,
      write_lock_required: true,
    },
    approval_policy: {
      mode: ApprovalPolicyModeEnum.Policy,
      required_rules: [],
      allow_auto_approval_for_low_risk: false,
    },
    memory_scope: MemoryScopeEnum.Repo,
    cwd_policy: {
      mode: CwdPolicyModeEnum.RepoRoot,
      allowed_roots: [process.cwd()],
    },
    health: {
      status: RuntimeHealthStatusEnum.Healthy,
      checked_at: new Date().toISOString(),
    },
    last_seen_at: new Date().toISOString(),
  });
}

export function compileForEval(input: {
  agent: AgentProfile;
  prompt: string;
  intent: TaskIntent;
  forbiddenPaths?: string[];
  verify?: string[];
  memory?: MemorySnapshot[];
}): InstructionBundle {
  return compileInstructionBundle({
    task: {
      title: input.prompt,
      intent: input.intent,
      goal: input.prompt,
      repo: 'caelum0x/recoder.xyz',
      space_id: 'space_eval',
      target_paths: ['docker-backend/**', 'packages/**'],
      forbidden_paths: input.forbiddenPaths ?? [],
      acceptance: ['Task reaches completed state', 'Artifacts and verification evidence are present'],
      verify: input.verify ?? [],
      approval_required: ['before pushing PR', 'before touching auth/security files'],
      artifact_required: ['summary', 'changed_files', 'test_output'],
    },
    agent: input.agent,
    repoContext: {
      repo_root: process.cwd(),
      repo_name: 'recoder.xyz',
      current_branch: 'main',
    },
    spacePolicy: {
      policy_id: 'agent-os-eval',
      name: 'Agent OS Eval Policy',
      forbidden_paths: input.forbiddenPaths ?? [],
      forbidden_actions: ['memory.write'],
    },
    memory: input.memory ?? [],
    pathRules: [
      {
        glob: 'docker-backend/**',
        instruction: 'Attach instruction bundle provenance to task artifacts.',
      },
    ],
    recentFailures: [],
    verification: {
      commands: input.verify ?? [],
      browser_checks: [],
    },
    compilerVersion: 'agent-os-eval',
  });
}
