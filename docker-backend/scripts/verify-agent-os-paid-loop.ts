import type { AgentProfile, TaskRun, TaskSpec } from '@recoder/agent-os';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type RunHistory = {
  run: TaskRun;
  counts: {
    events: number;
    artifacts: number;
    runtimeEvidence: number;
    approvals: number;
    policyDecisions: number;
    instructionBundles: number;
    githubDeliveryLinks: number;
  };
  latest: {
    state: TaskRun['state'];
    previewArtifactIds: string[];
    pullRequestArtifactIds: string[];
    runtimeEvidenceIds: string[];
    githubDeliveryLinkIds: string[];
  };
};

const baseUrl = normalizeBaseUrl(
  process.env.RECODER_AGENT_OS_API_URL
    ?? process.env.AGENT_OS_API_URL
    ?? process.env.RECODER_API_URL
    ?? 'http://localhost:4000',
);
const internalServiceKey = process.env.INTERNAL_SERVICE_KEY ?? process.env.RECODER_API_TOKEN;
const isLocalTarget = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(baseUrl);

if (!internalServiceKey && !isLocalTarget) {
  throw new Error('INTERNAL_SERVICE_KEY or RECODER_API_TOKEN is required for non-local Agent OS verification targets');
}

const now = new Date().toISOString();
const suffix = process.env.VERIFY_AGENT_OS_LOOP_ID ?? `${Date.now()}`;
const spaceId = process.env.VERIFY_AGENT_OS_LOOP_SPACE_ID ?? 'paid-user-launch-verification';
const agentId = process.env.VERIFY_AGENT_OS_LOOP_AGENT_ID ?? `agent-paid-loop-${suffix}`;
const taskId = `task-paid-loop-${suffix}`;
const runId = `run-paid-loop-${suffix}`;
const repository = process.env.VERIFY_AGENT_OS_LOOP_REPOSITORY ?? 'recoder/recoder.xyz';
const prUrl = process.env.VERIFY_AGENT_OS_LOOP_PR_URL ?? `https://github.com/${repository}/pull/999999`;
const previewUrl = process.env.VERIFY_AGENT_OS_LOOP_PREVIEW_URL ?? `https://preview.recoder.xyz/verify/${suffix}`;
const issueUrl = process.env.VERIFY_AGENT_OS_LOOP_ISSUE_URL ?? `https://github.com/${repository}/issues/999999`;

const createdIds = {
  spaceId,
  agentId,
  taskId,
  runId,
  decisionId: `decision-paid-loop-${suffix}`,
  approvalId: `approval-paid-loop-${suffix}`,
  eventId: `event-paid-loop-runtime-${suffix}`,
  evidenceId: `evidence-paid-loop-runtime-${suffix}`,
  linkId: undefined as string | undefined,
  instructionBundleId: undefined as string | undefined,
  pullRequestArtifactId: undefined as string | undefined,
  previewArtifactId: undefined as string | undefined,
};

await get('/api/agent-os/health');

await post('/api/agent-os/spaces', {
  spaceId,
  displayName: 'Paid-user launch verification',
  ownerId: process.env.VERIFY_AGENT_OS_LOOP_OWNER_ID ?? 'paid-user-launch-verifier',
  repositories: [
    {
      repoId: `repo-paid-loop-${suffix}`,
      provider: 'github',
      owner: repository.split('/')[0] ?? 'recoder',
      name: repository.split('/')[1] ?? 'recoder.xyz',
      defaultBranch: process.env.VERIFY_AGENT_OS_LOOP_BASE_BRANCH ?? 'main',
      url: `https://github.com/${repository}`,
    },
  ],
  policy: {
    policyId: `policy-paid-loop-${suffix}`,
    approvalRequiredFor: ['before_pr'],
    forbiddenPaths: ['.env', 'node_modules'],
    defaultVerificationCommands: ['pnpm --dir docker-backend run agent-os:verify-paid-loop'],
    allowNetworkByDefault: true,
    allowShellByDefault: true,
  },
  createdAt: now,
  updatedAt: now,
  metadata: {
    generatedBy: 'verify-agent-os-paid-loop',
    verificationId: suffix,
  },
});

const task: TaskSpec = {
  taskId,
  title: 'Verify paid-user Agent OS delivery loop',
  intent: 'verification',
  goal: 'Exercise task, runtime evidence, PR, preview, approval, history, and outbox records through public Agent OS APIs.',
  spaceId,
  repo: repository,
  branchPolicy: 'no_git_write',
  targetPaths: ['docs/todo'],
  forbiddenPaths: ['.env', 'node_modules'],
  acceptanceCriteria: [
    'Instruction provenance is compiled and stored.',
    'Runtime evidence is projected from a runtime adapter event.',
    'PR and preview artifacts are linked to GitHub delivery.',
    'A policy approval request can be approved.',
  ],
  verification: {
    commands: ['pnpm --dir docker-backend run agent-os:verify-paid-loop'],
    evidenceRequired: ['runtime_evidence', 'pull_request', 'preview', 'approval'],
  },
  approvalRequired: ['before_pr'],
  artifactRequired: ['instruction_bundle', 'runtime_evidence', 'pull_request', 'preview'],
  metadata: {
    generatedBy: 'verify-agent-os-paid-loop',
    verificationId: suffix,
  },
};

const agent: AgentProfile = {
  agentId,
  displayName: 'Paid Loop Verification Agent',
  vendorSurface: 'codex',
  connectorId: 'verify-agent-os-paid-loop',
  runtimeKind: 'sandbox',
  capabilities: [
    {
      capabilityId: 'verification',
      kind: 'verification',
      label: 'Launch gate verification',
    },
  ],
  tools: [
    {
      toolName: 'recoder.github.create_pull_request',
      modes: ['write', 'network'],
    },
  ],
  supportedTaskIntents: ['verification', 'feature_delivery', 'platform_hardening'],
  permissions: {
    defaultFileEffect: 'allow',
    pathRules: [
      {
        glob: '.env*',
        effect: 'deny',
        reason: 'Secrets are outside verifier scope.',
      },
    ],
    toolRules: [
      {
        toolName: 'recoder.github.create_pull_request',
        effect: 'allow',
        modes: ['write', 'network'],
        requiresApproval: true,
      },
    ],
    allowNetwork: true,
    allowShell: true,
    allowGitWrite: false,
    allowPrCreation: true,
    allowSecretsAccess: false,
    maxParallelSubagents: 1,
    writeLockRequired: false,
  },
  approvalPolicy: {
    mode: 'manual',
    requiredRules: [
      {
        id: 'before-pr',
        label: 'Approve PR delivery',
        when: 'before_pr',
        required: true,
      },
    ],
    allowAutoApprovalForLowRisk: false,
    escalationTarget: 'paid-user-launch',
  },
  memoryScope: 'repo',
  cwdPolicy: {
    mode: 'repo_root',
    allowedRoots: ['/workspace/recoder.xyz'],
    preferredRoot: '/workspace/recoder.xyz',
  },
  health: {
    status: 'healthy',
    checkedAt: now,
  },
  lastSeenAt: now,
};

await post('/api/agent-os/agents', agent);
await post('/api/agent-os/tasks', task);

await post('/api/agent-os/runs', {
  runId,
  taskId,
  spaceId,
  state: 'created',
  assigneeAgentId: agentId,
  updatedAt: now,
  metadata: {
    generatedBy: 'verify-agent-os-paid-loop',
    verificationId: suffix,
  },
});

const compiled = await post<{
  runtimeBundle: { bundleId: string };
  artifact?: { artifactId: string };
  run?: TaskRun;
}>('/api/agent-os/instructions/compile', {
  taskId,
  agentId,
  runId,
  repoRoot: process.cwd(),
  bundleId: `bundle-paid-loop-${suffix}`,
  repoName: repository,
  currentBranch: process.env.VERIFY_AGENT_OS_LOOP_BRANCH ?? 'main',
  createArtifact: true,
  metadata: {
    generatedBy: 'verify-agent-os-paid-loop',
    verificationId: suffix,
  },
  extraSources: [
    {
      kind: 'custom',
      path: 'verify-agent-os-paid-loop',
      content: 'Paid-user launch verification bundle provenance source.',
    },
  ],
});
createdIds.instructionBundleId = compiled.runtimeBundle.bundleId;

await transitionRun('running', {
  runtimeId: 'codex:verify-agent-os-paid-loop',
  sandboxId: `sandbox-${suffix}`,
});

const eventResult = await post<{
  runtimeEvidence: Array<{ evidenceId: string }>;
}>('/api/agent-os/events', {
  eventId: createdIds.eventId,
  type: 'log',
  taskId,
  runId,
  agentId,
  state: 'running',
  message: 'Runtime adapter emitted paid-user launch verification evidence.',
  createdAt: new Date().toISOString(),
  data: {
    runtimeId: 'codex:verify-agent-os-paid-loop',
    adapterId: agentId,
    sandboxId: `sandbox-${suffix}`,
    sessionId: `session-${suffix}`,
    command: 'pnpm --dir docker-backend run agent-os:verify-paid-loop',
    runtimeEvidence: {
      evidenceId: createdIds.evidenceId,
      kind: 'verification',
      status: 'passed',
      title: 'Runtime adapter verification passed',
      summary: 'Synthetic paid-user runtime evidence projected from /api/agent-os/events.',
    },
  },
});
assert(eventResult.runtimeEvidence.some((evidence) => evidence.evidenceId === createdIds.evidenceId), 'runtime evidence was not projected from run event');

await transitionRun('verifying');

await post(`/api/agent-os/runs/${encodeURIComponent(runId)}/verification-results`, {
  command: 'pnpm --dir docker-backend run agent-os:verify-paid-loop',
  passed: true,
  content: 'Paid-user launch verifier reached runtime evidence projection.',
  mimeType: 'text/plain',
  createdBy: agentId,
  transitionToState: 'delivered',
  metadata: {
    generatedBy: 'verify-agent-os-paid-loop',
    verificationId: suffix,
  },
});

const deliveryLink = await post<{
  linkId: string;
}>('/api/agent-os/github/delivery-links', {
  taskId,
  runId,
  repository,
  branch: `verify/paid-loop-${suffix}`,
  baseBranch: process.env.VERIFY_AGENT_OS_LOOP_BASE_BRANCH ?? 'main',
  issueNumber: 999999,
  issueUrl,
  createdBy: agentId,
  metadata: {
    generatedBy: 'verify-agent-os-paid-loop',
    verificationId: suffix,
  },
});
createdIds.linkId = deliveryLink.linkId;

const pr = await post<{ link: unknown; artifact: { artifactId: string } }>(
  `/api/agent-os/github/delivery-links/${encodeURIComponent(deliveryLink.linkId)}/pull-request`,
  {
    taskId,
    runId,
    url: prUrl,
    number: 999999,
    repository,
    branch: `verify/paid-loop-${suffix}`,
    title: 'Verify paid-user Agent OS delivery loop',
    createdBy: agentId,
    metadata: {
      generatedBy: 'verify-agent-os-paid-loop',
      verificationId: suffix,
      fixes: [issueUrl],
    },
  },
);
createdIds.pullRequestArtifactId = pr.artifact.artifactId;

const preview = await post<{ link: unknown; artifact: { artifactId: string } }>(
  `/api/agent-os/github/delivery-links/${encodeURIComponent(deliveryLink.linkId)}/previews`,
  {
    taskId,
    runId,
    url: previewUrl,
    provider: 'recoder-preview',
    environment: 'verification',
    createdBy: agentId,
    metadata: {
      generatedBy: 'verify-agent-os-paid-loop',
      verificationId: suffix,
    },
  },
);
createdIds.previewArtifactId = preview.artifact.artifactId;

await post(`/api/agent-os/github/delivery-links/${encodeURIComponent(deliveryLink.linkId)}/checks`, {
  checks: [
    {
      name: 'paid-loop-verifier',
      status: 'completed',
      conclusion: 'success',
      url: `${previewUrl}/checks/paid-loop-verifier`,
    },
  ],
});

await post(`/api/agent-os/github/delivery-links/${encodeURIComponent(deliveryLink.linkId)}/issue`, {
  issueNumber: 999999,
  issueUrl,
});

await transitionRun('waiting_for_approval', {
  deliveryLinkId: deliveryLink.linkId,
  pullRequestArtifactId: createdIds.pullRequestArtifactId,
  previewArtifactId: createdIds.previewArtifactId,
});

const policy = await post<{
  decision: { decisionId: string };
  approval?: { approvalId: string };
}>('/api/agent-os/policies/decisions', {
  decisionId: createdIds.decisionId,
  effect: 'needs_approval',
  action: 'mcp.tool.call',
  actorAgentId: agentId,
  taskId,
  reason: 'Paid-user PR delivery requires PM approval.',
  createdAt: new Date().toISOString(),
  runId,
  requestedBy: agentId,
  requiredAt: 'before_pr',
  approval: {
    required: true,
    gateId: createdIds.approvalId,
    reason: 'Approve paid-user verification PR delivery.',
  },
  target: {
    toolName: 'recoder.github.create_pull_request',
  },
  metadata: {
    generatedBy: 'verify-agent-os-paid-loop',
    verificationId: suffix,
    toolName: 'recoder.github.create_pull_request',
  },
});
assert(policy.approval?.approvalId === createdIds.approvalId, 'policy decision did not create the expected pending approval');

const approval = await post<{ approval: { approvalId: string; status: string }; run?: TaskRun }>(
  `/api/agent-os/approvals/${encodeURIComponent(createdIds.approvalId)}/approve`,
  {
    decidedBy: process.env.VERIFY_AGENT_OS_LOOP_DECIDED_BY ?? 'paid-user-launch-verifier',
    reason: 'Synthetic verifier approved delivery loop.',
  },
);
assert(approval.approval.status === 'approved', 'approval did not reach approved state');

const history = await get<RunHistory>(`/api/agent-os/runs/${encodeURIComponent(runId)}/history`);
assert(history.run.state === 'approved', `expected run state approved, received ${history.run.state}`);
assert(history.counts.instructionBundles >= 1, 'history is missing instruction bundle provenance');
assert(history.counts.runtimeEvidence >= 1, 'history is missing runtime evidence');
assert(history.counts.artifacts >= 3, 'history is missing expected artifacts');
assert(history.counts.githubDeliveryLinks >= 1, 'history is missing GitHub delivery link');
assert(history.counts.policyDecisions >= 1, 'history is missing policy decision');
assert(history.counts.approvals >= 1, 'history is missing approval');
assert(history.latest.pullRequestArtifactIds.includes(createdIds.pullRequestArtifactId ?? ''), 'history is missing PR artifact reference');
assert(history.latest.previewArtifactIds.includes(createdIds.previewArtifactId ?? ''), 'history is missing preview artifact reference');
assert(history.latest.runtimeEvidenceIds.includes(createdIds.evidenceId), 'history is missing runtime evidence reference');

const outbox = await get<unknown[]>('/api/agent-os/outbox');
assert(Array.isArray(outbox), 'outbox endpoint did not return an array');

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  createdIds,
  history: {
    state: history.run.state,
    counts: history.counts,
    latest: history.latest,
  },
  outboxRecords: outbox.length,
}, null, 2));

async function transitionRun(state: TaskRun['state'], metadata: Record<string, unknown> = {}): Promise<TaskRun> {
  return post<TaskRun>(`/api/agent-os/runs/${encodeURIComponent(runId)}/transition`, {
    state,
    agentId,
    metadata: {
      generatedBy: 'verify-agent-os-paid-loop',
      verificationId: suffix,
      ...metadata,
    },
  });
}

async function get<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

async function post<T = unknown>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(internalServiceKey
        ? {
          authorization: `Bearer ${internalServiceKey}`,
          'x-internal-service-key': internalServiceKey,
        }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text.length > 0 ? safeJson(text) : {};
  if (!response.ok) {
    const detail = typeof parsed === 'object' && parsed && 'error' in parsed ? (parsed as { error?: unknown }).error : text;
    throw new Error(`${method} ${path} failed with ${response.status}: ${String(detail)}`);
  }
  const envelope = parsed as ApiResponse<T>;
  if (envelope && typeof envelope === 'object' && 'success' in envelope) {
    if (!envelope.success) {
      throw new Error(`${method} ${path} failed: ${envelope.error ?? 'unknown_error'}`);
    }
    return envelope.data as T;
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, '');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
