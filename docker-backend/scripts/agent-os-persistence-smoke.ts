import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Pool } from 'pg';
import type { GitHubDeliveryLink, Space, TaskRun, TaskSpec } from '@recoder/agent-os';
import { WorkSignalService } from '@recoder/agent-os';
import type { AgentOsRepository } from '../src/agent-os/repositories/agent-os.repository';
import { JsonFileAgentOsRepository } from '../src/agent-os/repositories/json-file-agent-os.repository';
import { PostgresAgentOsRepository } from '../src/agent-os/repositories/postgres-agent-os.repository';

async function main(): Promise<void> {
  const id = `smoke-${Date.now()}`;
  const tempDir = mkdtempSync(join(tmpdir(), 'agent-os-persistence-'));
  try {
    const stateFilePath = join(tempDir, 'agent-os-state.json');
    await smokeRepository('json', new JsonFileAgentOsRepository(stateFilePath), id);
    await assertRestored('json', new JsonFileAgentOsRepository(stateFilePath), `${id}-json`);

    const databaseUrl = process.env.AGENT_OS_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.log('agent-os persistence smoke: json=pass postgres=skipped (set AGENT_OS_DATABASE_URL)');
      return;
    }

    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await smokeRepository('postgres', new PostgresAgentOsRepository(pool), id);
    } finally {
      await pool.end();
    }

    console.log('agent-os persistence smoke: json=pass postgres=pass');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function smokeRepository(label: string, repository: AgentOsRepository, id: string): Promise<void> {
  const now = new Date().toISOString();
  const space = createSpace(`${id}-${label}`, now);
  const task = createTask(space.spaceId, `${id}-${label}`);
  const run = createRun(space.spaceId, task.taskId, `${id}-${label}`, now);
  const link = createGitHubDeliveryLink(space.spaceId, task.taskId, run.runId, `${id}-${label}`, now);

  await repository.upsertSpace(space);
  await repository.upsertTask(task);
  await repository.upsertRun(run);
  await repository.upsertGitHubDeliveryLink(link);

  const detectedSignals = new WorkSignalService().detect({
    tasks: await repository.listTasks(),
    runs: await repository.listRuns(),
    artifacts: await repository.listArtifacts(),
    approvals: await repository.listApprovals(),
    githubDeliveryLinks: await repository.listGitHubDeliveryLinks(),
    runtimeEvidence: await repository.listRuntimeEvidence(),
    policyDecisions: await repository.listPolicyDecisions(),
    existingSignals: await repository.listWorkSignals(),
    now,
  });

  for (const signal of detectedSignals) {
    await repository.upsertWorkSignal(signal);
  }

  const snapshot = await repository.snapshot();
  assert(snapshot.spaces.some((item) => item.spaceId === space.spaceId), `${label}: space missing`);
  assert(snapshot.tasks.some((item) => item.taskId === task.taskId), `${label}: task missing`);
  assert(snapshot.runs.some((item) => item.runId === run.runId), `${label}: run missing`);
  assert(snapshot.githubDeliveryLinks.some((item) => item.linkId === link.linkId), `${label}: github delivery link missing`);
  assert(
    snapshot.workSignals.some((item) => item.detectedReason === 'github_checks_failed' && item.sourceId === link.linkId),
    `${label}: github_checks_failed work signal missing`,
  );
}

async function assertRestored(label: string, repository: AgentOsRepository, id: string): Promise<void> {
  const snapshot = await repository.snapshot();
  assert(snapshot.tasks.some((item) => item.taskId === `task-${id}`), `${label}: restored task missing`);
  assert(snapshot.runs.some((item) => item.runId === `run-${id}`), `${label}: restored run missing`);
  assert(snapshot.githubDeliveryLinks.some((item) => item.linkId === `github-link-${id}`), `${label}: restored github delivery link missing`);
  assert(
    snapshot.workSignals.some((item) => item.detectedReason === 'github_checks_failed' && item.sourceId === `github-link-${id}`),
    `${label}: restored work signal missing`,
  );
}

function createSpace(id: string, now: string): Space {
  return {
    spaceId: `space-${id}`,
    displayName: 'Agent OS persistence smoke',
    ownerId: 'smoke',
    repositories: [],
    policy: {
      policyId: `policy-${id}`,
      approvalRequiredFor: [],
      forbiddenPaths: [],
      defaultVerificationCommands: ['pnpm exec tsc --noEmit --pretty false'],
      allowNetworkByDefault: false,
      allowShellByDefault: true,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function createTask(spaceId: string, id: string): TaskSpec {
  return {
    taskId: `task-${id}`,
    title: 'Agent OS persistence smoke task',
    intent: 'verification',
    goal: 'Prove repository roundtrip persistence',
    spaceId,
    targetPaths: ['docker-backend/src/agent-os'],
    forbiddenPaths: [],
    acceptanceCriteria: ['Repository roundtrip preserves core Agent OS records'],
    verification: {
      commands: ['pnpm run agent-os:persistence-smoke'],
    },
    approvalRequired: [],
    artifactRequired: [],
    metadata: {
      status: 'created',
      smoke: true,
    },
  };
}

function createRun(spaceId: string, taskId: string, id: string, now: string): TaskRun {
  return {
    runId: `run-${id}`,
    taskId,
    spaceId,
    state: 'created',
    updatedAt: now,
    metadata: {
      smoke: true,
    },
  };
}

function createGitHubDeliveryLink(spaceId: string, taskId: string, runId: string, id: string, now: string): GitHubDeliveryLink {
  return {
    linkId: `github-link-${id}`,
    taskId,
    runId,
    spaceId,
    repository: 'recoder/agent-os-smoke',
    branch: `agent-os-smoke-${id}`,
    pullRequestUrl: `https://github.com/recoder/agent-os-smoke/pull/${Date.now()}`,
    pullRequestNumber: Date.now(),
    previewArtifactIds: [],
    checks: [
      {
        name: 'agent-os-persistence-smoke',
        state: 'failure',
        completedAt: now,
      },
    ],
    reviews: [],
    status: 'checks_failed',
    createdAt: now,
    updatedAt: now,
    createdBy: 'agent-os-smoke',
    metadata: {
      smoke: true,
    },
  };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
