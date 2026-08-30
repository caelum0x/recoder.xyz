/**
 * Agent-OS composition-root seams — the small, PURE pieces of the bootstrap →
 * agent-os wiring, extracted so they are unit-testable without a full boot
 * (mirrors {@link ./billing-seams.ts} / {@link ./interop-wire-seams.ts} /
 * {@link ./memory-seams.ts}):
 *
 *   - {@link parseSquadSeedEnv} — parse the OPT-IN squad seed from env into the
 *     agent-os {@link SquadSeed} shape (bootstrap is the sole sanctioned env read;
 *     agent-os OWNS the actual seed — this only shapes config). Validated by the
 *     agent-os `squadSeedSchema`, so no drift is possible. Absent / malformed ⇒
 *     `null` ⇒ byte-identical pass-through (seed OFF), never a fabricated squad.
 *   - {@link createSquadAutopilotDispatch} — the NARROW {@link SquadConductorPort}
 *     the autopilot launches ready bd issues through, adapting the real conductor
 *     module's `createWorkspace` behind it (agent-os never imports the conductor
 *     module). A refused/faulted launch surfaces as a truthful `ok:false` — never
 *     a fabricated workspace/run.
 *
 * Neither owns cross-domain state; the dispatch seam reads no `process.env`.
 * Its repo/project/runtime launch contract is selected explicitly in Wave and
 * carried on each request.
 */
import type { EnvSource } from './config.js';
import { createHash } from 'node:crypto';
import { execFileSafe, type ExecOptions, type ExecResult } from '@recoder/substrate';
import { squadSeedSchema, type SquadSeed } from '../domains/agent-os/config.js';
import type { SquadConductorPort } from '../domains/agent-os/ports/squad-autopilot.port.js';
import type {
  PullRequestReviewConductorPort,
  PullRequestReviewContext,
  PullRequestImpactContext,
  PullRequestReviewFeedbackPort,
  PullRequestFindingFeedbackRecord,
  PullRequestReviewPublisherPort,
  PullRequestSourcePort,
  PullRequestReviewCheckEvidence,
} from '../domains/agent-os/ports/pr-review-agent.port.js';
import {
  extractPullRequestRenames,
  parsePullRequestReviewValidation,
  parsePullRequestReviewResult,
} from '../domains/agent-os/services/pr-review-findings.service.js';
import type { Principal } from '../domains/identity/types.js';
import type { JiraRequirement } from '../domains/agent-os/ports/jira-requirement.port.js';
import type { KvStore } from '../domains/persistence/ports/kv-store.port.js';
import { childLogger } from '../shared/logger.js';

/**
 * Parse the OPT-IN squad seed from env (bootstrap is the sole sanctioned env
 * read; agent-os OWNS the actual seed — this only shapes config). Two truthful
 * forms, JSON preferred:
 *   - `RECODER_SQUAD_DEF` = a full {@link SquadSeed} JSON object.
 *   - `RECODER_SQUAD_ID` + `RECODER_SQUAD_MEMBERS` (csv of `agentId[:weight]`),
 *     with optional `RECODER_SQUAD_LEADER` / `RECODER_SQUAD_NAME` /
 *     `RECODER_SQUAD_STRATEGY` / `RECODER_SQUAD_SPACE`.
 * Absent ⇒ `null` ⇒ byte-identical pass-through (the default, seed OFF). A
 * malformed / incomplete env ⇒ `null` + a truthful warn — NEVER a fabricated
 * squad; agent-os then leaves the autopilot un-routed (flat pass-through), it
 * never skips every dispatch. Validated by the agent-os `squadSeedSchema` (the
 * single source of truth for the seed shape), so no drift is possible.
 */
export function parseSquadSeedEnv(env: EnvSource): SquadSeed | null {
  const rawJson = env.RECODER_SQUAD_DEF?.trim();
  const squadId = env.RECODER_SQUAD_ID?.trim();
  const membersCsv = env.RECODER_SQUAD_MEMBERS?.trim();
  // Nothing configured ⇒ opt-out. A bare RECODER_SQUAD_ID (no members) also
  // yields null here — agent-os then warns and routes flat, never skip-all.
  if (!rawJson && !(squadId && membersCsv)) return null;
  try {
    if (rawJson) {
      return squadSeedSchema.parse(JSON.parse(rawJson));
    }
    const leaderAgentId = env.RECODER_SQUAD_LEADER?.trim();
    const members = membersCsv!
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const [agentId, weightRaw] = entry.split(':').map((part) => part.trim());
        const weight = weightRaw ? Number(weightRaw) : undefined;
        return {
          agentId,
          ...(leaderAgentId && agentId === leaderAgentId ? { role: 'leader' as const } : {}),
          ...(weight !== undefined && Number.isFinite(weight) ? { weight } : {}),
        };
      });
    return squadSeedSchema.parse({
      squadId,
      displayName: env.RECODER_SQUAD_NAME?.trim() || squadId,
      ...(env.RECODER_SQUAD_SPACE?.trim() ? { spaceId: env.RECODER_SQUAD_SPACE.trim() } : {}),
      ...(leaderAgentId ? { leaderAgentId } : {}),
      ...(env.RECODER_SQUAD_STRATEGY?.trim()
        ? { routingStrategy: env.RECODER_SQUAD_STRATEGY.trim() }
        : {}),
      members,
    });
  } catch (err) {
    childLogger('bootstrap').warn(
      { err: err instanceof Error ? err.message : String(err) },
      'bootstrap: malformed squad seed env — squad routing OFF (autopilot routes flat, not skip-all)',
    );
    return null;
  }
}

/**
 * The narrow conductor surface the squad-autopilot dispatch seam consumes
 * (structural — the real `ConductorModuleSurface.createWorkspace` fits without a
 * cross-domain import).
 */
export interface SquadAutopilotLauncher {
  listWorkspaces(): Promise<readonly {
    readonly workspaceId: string;
    readonly spaceId?: string;
    readonly projectId?: string;
    readonly runtimeId?: string;
    readonly state?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
    readonly metadata?: Record<string, unknown>;
  }[]>;
  workspaceOutput(workspaceId: string, lines?: number): Promise<{ output: string }>;
  listWorkspaceEvents(workspaceId: string): Promise<readonly { readonly message?: string }[]>;
  workspaceChecks?(workspaceId: string): Promise<{
    readonly available: boolean;
    readonly reason?: string;
    readonly localRan?: boolean;
    readonly checks?: readonly {
      readonly name: string;
      readonly status: string;
      readonly conclusion: string;
      readonly source?: 'github' | 'recoder';
      readonly detail?: string;
      readonly autofix?: { readonly prompt: string };
    }[];
  } | null>;
  createWorkspace(
    input: {
      readonly spaceId: string;
      readonly projectId: string;
      readonly taskId: string;
      readonly repoPath: string;
      readonly runtimeId: string;
      readonly prompt?: string;
      readonly branch?: string;
      readonly baseRef?: string;
      readonly metadata?: Record<string, unknown>;
    },
    principal: Principal,
  ): Promise<{
    readonly ok: boolean;
    readonly reason?: string;
    readonly value?: { readonly workspaceId: string; readonly runId?: string } | null;
  }>;
}

/** Structural engines/GitHub slice consumed by the PR watcher source adapter. */
export interface PullRequestGithubFacet {
  listOpenPullRequests(input: { readonly repoRoot: string; readonly limit: number }): Promise<
    | {
        readonly ok: true;
        readonly value: {
          readonly pullRequests: readonly {
            readonly number: number;
            readonly title: string;
            readonly url: string;
            readonly headSha: string;
            readonly baseRefName: string;
            readonly headRefName: string;
            readonly isDraft: boolean;
            readonly updatedAt: string;
            readonly author?: string;
          }[];
        };
      }
    | { readonly ok: false; readonly reason: string }
  >;
  reviewPR(input: { readonly pr: number; readonly repoRoot: string }): Promise<
    | {
        readonly ok: true;
        readonly value: {
          readonly pr: unknown;
          readonly diff: string | null;
          readonly diffTruncated: boolean;
          readonly diffUnavailable?: string;
          readonly impact?: PullRequestImpactContext;
          readonly requirements?: {
            readonly issues: readonly {
              readonly number: number;
              readonly title: string;
              readonly body: string;
              readonly state: 'OPEN' | 'CLOSED';
              readonly url: string;
              readonly labels: readonly string[];
            }[];
            readonly unavailable: readonly { readonly number: number; readonly reason: string }[];
          };
          readonly reviewRules?: {
            readonly rules: readonly {
              readonly id: string;
              readonly level: 'required' | 'advisory';
              readonly text: string;
              readonly source: string;
              readonly check?: string;
            }[];
            readonly source?: string;
            readonly unavailable?: string;
          };
        };
      }
    | { readonly ok: false; readonly reason: string }
  >;
}

export interface PullRequestGithubPublisherFacet {
  submitReview(input: {
    readonly pr: number;
    readonly repoRoot: string;
    readonly commitId: string;
    readonly event: 'comment' | 'approve' | 'request_changes';
    readonly body: string;
    readonly comments?: readonly { readonly path: string; readonly line: number; readonly body: string }[];
  }): Promise<
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly reason: string }
  >;
  listReviewThreads(input: { readonly pr: number; readonly repoRoot: string }): Promise<
    | {
        readonly ok: true;
        readonly value: {
          readonly threads: readonly {
            readonly id: string;
            readonly path: string;
            readonly line: number;
            readonly isResolved: boolean;
            readonly isOutdated: boolean;
            readonly rootBody: string;
            readonly url?: string;
            readonly resolvedBy?: string;
          }[];
        };
      }
    | { readonly ok: false; readonly reason: string }
  >;
}

type PullRequestHeadPreparation = (input: {
  readonly repoPath: string;
  readonly number: number;
  readonly headSha: string;
}) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;

type GitExec = (bin: string, args: readonly string[], options: ExecOptions) => Promise<ExecResult>;

/**
 * Ensure the exact GitHub-reviewed commit exists in the local object database
 * without checking out or moving the operator's branch. Fork PRs often need the
 * host's refs/pull namespace fetched before Conductor can branch a worktree.
 */
export async function preparePullRequestHead(
  input: { readonly repoPath: string; readonly number: number; readonly headSha: string },
  exec: GitExec = execFileSafe,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  const sha = input.headSha.trim();
  if (!/^[0-9a-f]{7,64}$/i.test(sha) || !Number.isInteger(input.number) || input.number <= 0) {
    return { ok: false, reason: 'pull-request head identity is invalid' };
  }
  const options: ExecOptions = { timeoutMs: 30_000, maxBuffer: 1024 * 1024 };
  const hasCommit = async (): Promise<boolean> => {
    try {
      await exec('git', ['-C', input.repoPath, 'cat-file', '-e', `${sha}^{commit}`], options);
      return true;
    } catch {
      return false;
    }
  };
  if (await hasCommit()) return { ok: true };

  let remotes: string[] = [];
  try {
    const result = await exec('git', ['-C', input.repoPath, 'remote'], options);
    remotes = [...new Set(result.stdout.split('\n').map((row) => row.trim()).filter(Boolean))]
      .sort((a, b) => Number(b === 'origin') - Number(a === 'origin') || a.localeCompare(b))
      .slice(0, 5);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'could not inspect Git remotes' };
  }
  if (remotes.length === 0) return { ok: false, reason: 'repository has no Git remote for the pull-request head' };
  for (const remote of remotes) {
    try {
      await exec(
        'git',
        ['-C', input.repoPath, 'fetch', '--no-tags', '--no-recurse-submodules', remote, `refs/pull/${input.number}/head`],
        options,
      );
      if (await hasCommit()) return { ok: true };
    } catch {
      // Try the next configured remote; no local branch or named ref is changed.
    }
  }
  return { ok: false, reason: `reviewed commit ${sha.slice(0, 12)} is not available from the repository remotes` };
}

/** Deps for the squad-autopilot → conductor dispatch seam. */
export interface SquadAutopilotDispatchDeps {
  /** The real conductor launcher — adapted behind the narrow `SquadConductorPort`. */
  readonly conductor: SquadAutopilotLauncher;
}

/** The fixed internal-service identity every autopilot launch runs under. */
const SQUAD_AUTOPILOT_PRINCIPAL: Principal = {
  userId: 'squad-autopilot',
  scopes: ['internal', 'write'],
  kind: 'internal',
  isAnonymous: false,
  raw: null,
};

/**
 * Build the squad-autopilot → conductor dispatch seam: the autopilot pulls ready
 * bd issues and launches each through the real governed `createWorkspace` path
 * under a fixed internal-service principal. A refused/faulted launch surfaces as a
 * truthful `ok:false` — never a fabricated workspace/run. The squad-routed agent
 * (multica's leader-first / weighted selection) is carried onto the workspace
 * record metadata so the launch survives into the desktop's background-work
 * queue across process restarts and reflects WHICH member handled it.
 */
export function createSquadAutopilotDispatch(
  deps: SquadAutopilotDispatchDeps,
): SquadConductorPort {
  const { conductor } = deps;
  return {
    async dispatch(req) {
      // The service's board cache is intentionally bounded and in-memory. The
      // canonical workspace metadata is therefore the restart-safe idempotency
      // cursor: a catch-up scan must reuse prior work even if Beads still reports
      // the issue ready while its claim/state catches up.
      let workspaces: Awaited<ReturnType<SquadAutopilotLauncher['listWorkspaces']>>;
      try {
        workspaces = await conductor.listWorkspaces();
      } catch (error) {
        return {
          ok: false,
          reason: `could not verify prior background work: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      const existing = workspaces.find((workspace) => {
        const metadata = workspace.metadata;
        return metadata?.backgroundAgent === true &&
          metadata.prReviewAgent !== true &&
          metadata.backgroundIssueId === req.taskId &&
          metadata.backgroundRepoPath === req.profile.repoPath &&
          metadata.backgroundRuntimeId === req.profile.runtimeId &&
          workspace.projectId === req.profile.projectId;
      });
      if (existing) return { ok: true, status: 'existing', workspaceId: existing.workspaceId };

      const res = await conductor.createWorkspace(
        {
          spaceId: req.profile.spaceId,
          projectId: req.profile.projectId,
          taskId: req.taskId, // the bd issue id — the issue-graph tracker claims it
          repoPath: req.profile.repoPath,
          runtimeId: req.profile.runtimeId,
          prompt: req.prompt,
          // Durable background provenance lets the Wave rail reconstruct this
          // launch after the autopilot's bounded in-memory board rolls over or
          // the embedded backend restarts.
          metadata: {
            backgroundAgent: true,
            backgroundIssueId: req.taskId,
            backgroundIssueTitle: req.title,
            backgroundRepoPath: req.profile.repoPath,
            backgroundRuntimeId: req.profile.runtimeId,
            reviewOwner: 'human',
            autoMerge: false,
            ...(req.routedAgentId ? { routedAgentId: req.routedAgentId } : {}),
          },
        },
        SQUAD_AUTOPILOT_PRINCIPAL,
      );
      if (!res.ok || !res.value) {
        return { ok: false, reason: res.reason ?? 'conductor refused workspace.create' };
      }
      return {
        ok: true,
        status: 'launched',
        workspaceId: res.value.workspaceId,
        ...(res.value.runId ? { runId: res.value.runId } : {}),
      };
    },
  };
}

/** Adapt the unified GithubModule onto the watcher-owned read-only source port. */
export function createPullRequestReviewSource(
  github: () => PullRequestGithubFacet,
): PullRequestSourcePort {
  return {
    async listOpen(input) {
      const result = await github().listOpenPullRequests({
        repoRoot: input.repoPath,
        limit: input.limit,
      });
      return result.ok
        ? { ok: true, pullRequests: result.value.pullRequests }
        : { ok: false, reason: result.reason };
    },
    async reviewContext(input) {
      const result = await github().reviewPR({
        pr: input.number,
        repoRoot: input.repoPath,
      });
      if (!result.ok) return { ok: false, reason: result.reason };
      const pr = readPullRequestView(result.value.pr);
      if (!pr || pr.number !== input.number) {
        return { ok: false, reason: 'GitHub returned an invalid pull-request review context' };
      }
      return {
        ok: true,
        context: {
          ...pr,
          diff: result.value.diff,
          diffTruncated: result.value.diffTruncated,
          renames: extractPullRequestRenames(result.value.diff),
          ...(result.value.impact ? { impact: result.value.impact } : {}),
          linkedRequirements: result.value.requirements?.issues ?? [],
          unavailableRequirements: result.value.requirements?.unavailable ?? [],
          reviewRules: result.value.reviewRules?.rules ?? [],
          ...(result.value.reviewRules?.unavailable
            ? { reviewRulesUnavailable: {
                ...(result.value.reviewRules.source ? { source: result.value.reviewRules.source } : {}),
                reason: result.value.reviewRules.unavailable,
              } }
            : {}),
          ...(result.value.diffUnavailable
            ? { diffUnavailable: result.value.diffUnavailable }
            : {}),
        },
      };
    },
  };
}

/**
 * Adapt Conductor onto the PR watcher. Canonical workspace metadata is both the
 * durable dedupe cursor and the product provenance surfaced by Wave.
 */
export function createPullRequestReviewDispatch(
  conductor: SquadAutopilotLauncher,
  deps: { readonly prepareHead?: PullRequestHeadPreparation } = {},
): PullRequestReviewConductorPort {
  const prepareHead = deps.prepareHead ?? preparePullRequestHead;
  return {
    async findExisting(input) {
      const workspaces = await conductor.listWorkspaces();
      const found = workspaces.find((workspace) => {
        const metadata = workspace.metadata;
        const role = metadata?.prReviewRole === 'validator' ? 'validator' : 'reviewer';
        return metadata?.prReviewAgent === true &&
          metadata.backgroundRepoPath === input.repoPath &&
          metadata.prNumber === input.number &&
          metadata.prHeadSha === input.headSha &&
          metadata.backgroundRuntimeId === input.runtimeId &&
          role === (input.role ?? 'reviewer');
      });
      return found
        ? {
            workspaceId: found.workspaceId,
            ...(found.state ? { state: found.state } : {}),
            runtimeId: input.runtimeId,
          }
        : null;
    },
    async getReviewTarget(workspaceId) {
      const workspace = (await conductor.listWorkspaces()).find((item) => item.workspaceId === workspaceId);
      const metadata = workspace?.metadata;
      if (
        !workspace ||
        metadata?.prReviewAgent !== true ||
        typeof metadata.backgroundRepoPath !== 'string' ||
        typeof metadata.prNumber !== 'number' ||
        typeof metadata.prUrl !== 'string' ||
        typeof metadata.prHeadSha !== 'string' ||
        typeof metadata.backgroundIssueTitle !== 'string'
      ) return null;
      return {
        workspaceId,
        ...(typeof workspace.spaceId === 'string' ? { spaceId: workspace.spaceId } : {}),
        ...(typeof workspace.projectId === 'string' ? { projectId: workspace.projectId } : {}),
        ...(typeof workspace.runtimeId === 'string' ? { runtimeId: workspace.runtimeId } : {}),
        ...(workspace.state ? { state: workspace.state } : {}),
        repoPath: metadata.backgroundRepoPath,
        number: metadata.prNumber,
        url: metadata.prUrl,
        headSha: metadata.prHeadSha,
        title: typeof metadata.prTitle === 'string' ? metadata.prTitle : metadata.backgroundIssueTitle,
        ...(typeof metadata.prBaseRef === 'string' ? { baseRefName: metadata.prBaseRef } : {}),
        ...(typeof metadata.prHeadRef === 'string' ? { headRefName: metadata.prHeadRef } : {}),
        ...(typeof metadata.prUpdatedAt === 'string' ? { updatedAt: metadata.prUpdatedAt } : {}),
        linkedRequirements: Array.isArray(metadata.prLinkedRequirements)
          ? metadata.prLinkedRequirements.flatMap((value): { number: number; title: string; state: 'OPEN' | 'CLOSED'; url: string }[] => {
              if (!value || typeof value !== 'object') return [];
              const requirement = value as Record<string, unknown>;
              return typeof requirement.number === 'number' && typeof requirement.title === 'string' &&
                (requirement.state === 'OPEN' || requirement.state === 'CLOSED') && typeof requirement.url === 'string'
                ? [{ number: requirement.number, title: requirement.title, state: requirement.state, url: requirement.url }]
                : [];
            })
          : [],
        unavailableRequirements: Array.isArray(metadata.prUnavailableRequirements)
          ? metadata.prUnavailableRequirements.flatMap((value): { number: number; reason: string }[] => {
              if (!value || typeof value !== 'object') return [];
              const requirement = value as Record<string, unknown>;
              return typeof requirement.number === 'number' && typeof requirement.reason === 'string'
                ? [{ number: requirement.number, reason: requirement.reason }]
                : [];
            })
          : [],
        linkedBeadsRequirements: Array.isArray(metadata.prLinkedBeadsRequirements)
          ? metadata.prLinkedBeadsRequirements.flatMap((value): { id: string; title: string; status?: string }[] => {
              if (!value || typeof value !== 'object') return [];
              const requirement = value as Record<string, unknown>;
              return typeof requirement.id === 'string' && typeof requirement.title === 'string'
                ? [{ id: requirement.id, title: requirement.title,
                    ...(typeof requirement.status === 'string' ? { status: requirement.status } : {}) }]
                : [];
            })
          : [],
        unavailableBeadsRequirements: Array.isArray(metadata.prUnavailableBeadsRequirements)
          ? metadata.prUnavailableBeadsRequirements.flatMap((value): { id: string; reason: string }[] => {
              if (!value || typeof value !== 'object') return [];
              const requirement = value as Record<string, unknown>;
              return typeof requirement.id === 'string' && typeof requirement.reason === 'string'
                ? [{ id: requirement.id, reason: requirement.reason }]
                : [];
            })
          : [],
        linkedJiraRequirements: parseJiraRequirements(metadata.prLinkedJiraRequirements),
        unavailableJiraRequirements: Array.isArray(metadata.prUnavailableJiraRequirements)
          ? metadata.prUnavailableJiraRequirements.flatMap((value): { key: string; reason: string }[] => {
              if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
              const requirement = value as Record<string, unknown>;
              return typeof requirement.key === 'string' && typeof requirement.reason === 'string'
                ? [{ key: requirement.key.slice(0, 100), reason: requirement.reason.slice(0, 1_000) }]
                : [];
            }).slice(0, 5)
          : [],
        reviewRules: Array.isArray(metadata.prReviewRules)
          ? metadata.prReviewRules.flatMap((value): { id: string; level: 'required' | 'advisory'; text: string; source: string; check?: string }[] => {
              if (!value || typeof value !== 'object') return [];
              const rule = value as Record<string, unknown>;
              return typeof rule.id === 'string' && (rule.level === 'required' || rule.level === 'advisory') &&
                typeof rule.text === 'string' && typeof rule.source === 'string'
                ? [{ id: rule.id, level: rule.level, text: rule.text, source: rule.source,
                    ...(typeof rule.check === 'string' && rule.check.trim() ? { check: rule.check.trim().slice(0, 200) } : {}) }]
                : [];
            })
          : [],
        reviewRuleChecks: parseReviewRuleCheckEvidence(metadata.prReviewRuleChecks),
        ...(metadata.prReviewRulesUnavailable && typeof metadata.prReviewRulesUnavailable === 'object' &&
          typeof (metadata.prReviewRulesUnavailable as Record<string, unknown>).reason === 'string'
          ? { reviewRulesUnavailable: {
              ...((typeof (metadata.prReviewRulesUnavailable as Record<string, unknown>).source === 'string')
                ? { source: (metadata.prReviewRulesUnavailable as Record<string, unknown>).source as string }
                : {}),
              reason: (metadata.prReviewRulesUnavailable as Record<string, unknown>).reason as string,
            } }
          : {}),
        ...pullRequestImpactField(metadata.prImpact),
        ...(typeof metadata.backgroundOwnerId === 'string'
          ? { ownerId: metadata.backgroundOwnerId }
          : {}),
      };
    },
    async reviewHistory(workspaceId) {
      const workspaces = await conductor.listWorkspaces();
      const anchor = workspaces.find((item) => item.workspaceId === workspaceId);
      const metadata = anchor?.metadata;
      if (
        !anchor ||
        metadata?.prReviewAgent !== true ||
        typeof metadata.backgroundRepoPath !== 'string' ||
        typeof metadata.prNumber !== 'number' ||
        typeof metadata.prHeadSha !== 'string'
      ) return [];
      const ownerId = typeof metadata.backgroundOwnerId === 'string' ? metadata.backgroundOwnerId : undefined;
      const history = workspaces.filter((item) => {
        const row = item.metadata;
        return row?.prReviewAgent === true &&
          (row.prReviewRole === undefined || row.prReviewRole === 'reviewer') &&
          row.backgroundRepoPath === metadata.backgroundRepoPath &&
          row.prNumber === metadata.prNumber &&
          (ownerId === undefined || row.backgroundOwnerId === ownerId) &&
          typeof row.backgroundRuntimeId === 'string' &&
          typeof row.prHeadSha === 'string';
      });
      // The lifecycle surface needs only this revision and its immediate predecessor.
      // Bound output/event reads even for a long-lived PR with many pushes.
      const revisions = [...new Map(history.map((item) => {
        const row = item.metadata!;
        const headSha = row.prHeadSha as string;
        return [headSha, {
          headSha,
          updatedAt: typeof row.prUpdatedAt === 'string' ? row.prUpdatedAt : '',
        }] as const;
      })).values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.headSha.localeCompare(b.headSha));
      const currentIndex = revisions.findIndex((revision) => revision.headSha === metadata.prHeadSha);
      const allowedHeads = new Set([
        metadata.prHeadSha,
        ...(currentIndex > 0 && revisions[currentIndex - 1] ? [revisions[currentIndex - 1]!.headSha] : []),
      ]);
      const cohort = history.filter((item) => allowedHeads.has(item.metadata!.prHeadSha as string));
      return Promise.all(cohort.map(async (item) => {
        const events = await conductor.listWorkspaceEvents(item.workspaceId).catch(() => []);
        const eventOutput = events.flatMap((event) => typeof event.message === 'string' ? [event.message] : []).join('\n');
        const hasStructuredEvent = parsePullRequestReviewResult(eventOutput) !== null;
        const paneOutput = hasStructuredEvent
          ? ''
          : (await conductor.workspaceOutput(item.workspaceId, 4_000).catch(() => ({ output: '' }))).output;
        return {
          workspaceId: item.workspaceId,
          runtimeId: item.metadata!.backgroundRuntimeId as string,
          headSha: item.metadata!.prHeadSha as string,
          updatedAt: typeof item.metadata!.prUpdatedAt === 'string' ? item.metadata!.prUpdatedAt : '',
          ...(item.state ? { state: item.state } : {}),
          output: hasStructuredEvent ? eventOutput : paneOutput,
          renames: Array.isArray(item.metadata!.prRenames)
            ? item.metadata!.prRenames.flatMap((value): { from: string; to: string }[] => {
                if (!value || typeof value !== 'object') return [];
                const rename = value as Record<string, unknown>;
                return typeof rename.from === 'string' && typeof rename.to === 'string'
                  ? [{ from: rename.from, to: rename.to }]
                  : [];
              })
            : [],
        };
      }));
    },
    async validation(workspaceId) {
      const workspaces = await conductor.listWorkspaces();
      const anchor = workspaces.find((item) => item.workspaceId === workspaceId);
      const metadata = anchor?.metadata;
      if (
        !anchor ||
        metadata?.prReviewAgent !== true ||
        typeof metadata.backgroundRepoPath !== 'string' ||
        typeof metadata.prNumber !== 'number' ||
        typeof metadata.prHeadSha !== 'string'
      ) return null;
      const ownerId = typeof metadata.backgroundOwnerId === 'string' ? metadata.backgroundOwnerId : undefined;
      const validator = workspaces.find((item) => {
        const row = item.metadata;
        return row?.prReviewAgent === true &&
          row.prReviewRole === 'validator' &&
          row.backgroundRepoPath === metadata.backgroundRepoPath &&
          row.prNumber === metadata.prNumber &&
          row.prHeadSha === metadata.prHeadSha &&
          (ownerId === undefined || row.backgroundOwnerId === ownerId) &&
          typeof row.backgroundRuntimeId === 'string';
      });
      if (!validator) return null;
      const events = await conductor.listWorkspaceEvents(validator.workspaceId).catch(() => []);
      const eventOutput = events.flatMap((event) => typeof event.message === 'string' ? [event.message] : []).join('\n');
      const hasStructuredEvent = parsePullRequestReviewValidation(eventOutput) !== null;
      const paneOutput = hasStructuredEvent
        ? ''
        : (await conductor.workspaceOutput(validator.workspaceId, 4_000).catch(() => ({ output: '' }))).output;
      return {
        workspaceId: validator.workspaceId,
        runtimeId: validator.metadata!.backgroundRuntimeId as string,
        ...(validator.state ? { state: validator.state } : {}),
        output: hasStructuredEvent ? eventOutput : paneOutput,
        reviewRuleChecks: applyReviewRuleCheckRemediation(
          parseReviewRuleCheckEvidence(validator.metadata?.prReviewRuleChecks),
          validator.metadata?.checkRemediation,
        ),
      };
    },
    async captureReviewRuleChecks(workspaceId, checkNames) {
      const names = [...new Set(checkNames.map((name) => name.trim()).filter(Boolean))].slice(0, 30);
      if (names.length === 0) return [];
      if (!conductor.workspaceChecks) {
        return names.map((name) => ({ name, status: 'unavailable', detail: 'Recoder check runner is unavailable' }));
      }
      let view: Awaited<ReturnType<NonNullable<SquadAutopilotLauncher['workspaceChecks']>>>;
      try {
        view = await conductor.workspaceChecks(workspaceId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Recoder checks could not be read';
        return names.map((name) => ({ name, status: 'unavailable', detail }));
      }
      if (!view || view.localRan !== true) {
        const detail = view?.reason ?? 'No repository-owned checks ran in the review worktree';
        return names.map((name) => ({ name, status: 'unavailable', detail }));
      }
      const rows = (view.checks ?? []).filter((row) => row.source === 'recoder');
      return names.map((name): PullRequestReviewCheckEvidence => {
        const matches = rows.filter((row) => row.name === name);
        if (matches.length === 0) return { name, status: 'missing', detail: `No Recoder check is named "${name}"` };
        if (matches.length > 1) return { name, status: 'ambiguous', detail: `Multiple Recoder checks are named "${name}"` };
        const row = matches[0]!;
        const status = row.conclusion === 'SUCCESS' ? 'pass' : row.conclusion === 'FAILURE' ? 'fail' : 'error';
        return {
          name,
          status,
          ...(row.detail ? { detail: row.detail } : {}),
          ...(row.autofix ? { autofix: true } : {}),
        };
      });
    },
    async listFindingFixes(workspaceId) {
      const workspaces = await conductor.listWorkspaces();
      const anchor = workspaces.find((item) => item.workspaceId === workspaceId);
      const metadata = anchor?.metadata;
      if (
        !anchor ||
        metadata?.prReviewAgent !== true ||
        typeof metadata.backgroundRepoPath !== 'string' ||
        typeof metadata.prNumber !== 'number' ||
        typeof metadata.prHeadSha !== 'string'
      ) return [];
      const ownerId = typeof metadata.backgroundOwnerId === 'string' ? metadata.backgroundOwnerId : undefined;
      return workspaces
        .flatMap((item) => {
          const row = item.metadata;
          if (
            row?.prReviewAgent !== true ||
            row.prReviewRole !== 'fixer' ||
            row.backgroundRepoPath !== metadata.backgroundRepoPath ||
            row.prNumber !== metadata.prNumber ||
            row.prHeadSha !== metadata.prHeadSha ||
            (ownerId !== undefined && row.backgroundOwnerId !== ownerId) ||
            typeof row.prFindingKey !== 'string'
          ) return [];
          return [{
            findingKey: row.prFindingKey,
            workspaceId: item.workspaceId,
            ...(typeof item.runtimeId === 'string'
              ? { runtimeId: item.runtimeId }
              : typeof row.backgroundRuntimeId === 'string' ? { runtimeId: row.backgroundRuntimeId } : {}),
            ...(item.state ? { state: item.state } : {}),
            headSha: metadata.prHeadSha as string,
            ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}),
          }];
        })
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.workspaceId.localeCompare(a.workspaceId));
    },
    async dispatchFindingFix(input) {
      const { target, finding } = input;
      if (!target.spaceId || !target.projectId) {
        return { ok: false, reason: 'source review workspace is missing its project identity' };
      }
      const workspaces = await conductor.listWorkspaces();
      const matching = workspaces
        .filter((workspace) => {
          const row = workspace.metadata;
          return row?.prReviewAgent === true &&
            row.prReviewRole === 'fixer' &&
            row.backgroundRepoPath === target.repoPath &&
            row.prNumber === target.number &&
            row.prHeadSha === target.headSha &&
            row.prFindingKey === finding.key &&
            row.backgroundRuntimeId === input.runtimeId &&
            row.backgroundOwnerId === input.ownerId;
        })
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.workspaceId.localeCompare(a.workspaceId));
      const existing = matching[0];
      if (existing && existing.state !== 'failed' && existing.state !== 'cancelled') {
        return { ok: true, workspaceId: existing.workspaceId, existing: true };
      }
      const prepared = await prepareHead({ repoPath: target.repoPath, number: target.number, headSha: target.headSha });
      if (!prepared.ok) return prepared;
      const runtimeKey = input.runtimeId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 32);
      const findingKey = createHash('sha256').update(finding.key).digest('hex').slice(0, 12);
      const attempt = matching.length + 1;
      const taskId = `github-pr-${target.number}-${target.headSha.slice(0, 12)}-fix-${findingKey}-${runtimeKey}${attempt > 1 ? `-${attempt}` : ''}`;
      const result = await conductor.createWorkspace(
        {
          spaceId: target.spaceId,
          projectId: target.projectId,
          taskId,
          repoPath: target.repoPath,
          runtimeId: input.runtimeId,
          baseRef: target.headSha,
          prompt: input.prompt,
          metadata: {
            backgroundAgent: true,
            backgroundIssueId: taskId,
            backgroundIssueTitle: `Fix PR #${target.number}: ${finding.message}`,
            backgroundRepoPath: target.repoPath,
            backgroundRuntimeId: input.runtimeId,
            backgroundOwnerId: input.ownerId,
            prReviewAgent: true,
            prReviewRole: 'fixer',
            prFindingKey: finding.key,
            prFindingFile: finding.file,
            prFindingLine: finding.line,
            prFindingDefectKey: finding.defectKey,
            ...(finding.symbol ? { prFindingSymbol: finding.symbol } : {}),
            prFixAttempt: attempt,
            prFixOriginWorkspaceId: target.workspaceId,
            prNumber: target.number,
            prTitle: target.title,
            prUrl: target.url,
            prHeadSha: target.headSha,
            ...(target.baseRefName ? { prBaseRef: target.baseRefName } : {}),
            ...(target.headRefName ? { prHeadRef: target.headRefName } : {}),
            ...(target.updatedAt ? { prUpdatedAt: target.updatedAt } : {}),
            prLinkedRequirements: target.linkedRequirements ?? [],
            prUnavailableRequirements: target.unavailableRequirements ?? [],
            prLinkedBeadsRequirements: target.linkedBeadsRequirements ?? [],
            prUnavailableBeadsRequirements: target.unavailableBeadsRequirements ?? [],
            prLinkedJiraRequirements: target.linkedJiraRequirements ?? [],
            prUnavailableJiraRequirements: target.unavailableJiraRequirements ?? [],
            prReviewRules: target.reviewRules ?? [],
            ...(target.reviewRulesUnavailable ? { prReviewRulesUnavailable: target.reviewRulesUnavailable } : {}),
            ...(target.impact ? { prImpact: target.impact } : {}),
            reviewOwner: 'human',
            fixOwner: 'human',
            githubDelivery: 'human',
            autoMerge: false,
          },
        },
        SQUAD_AUTOPILOT_PRINCIPAL,
      );
      if (!result.ok || !result.value) {
        return { ok: false, reason: result.reason ?? 'conductor refused finding-fix workspace' };
      }
      return {
        ok: true,
        workspaceId: result.value.workspaceId,
        ...(result.value.runId ? { runId: result.value.runId } : {}),
        existing: false,
      };
    },
    async dispatch(input) {
      const pr = input.pullRequest;
      const role = input.role ?? 'reviewer';
      const runtimeKey = input.profile.runtimeId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 32);
      const taskId = `github-pr-${pr.number}-${pr.headSha.slice(0, 12)}-${runtimeKey}${role === 'validator' ? '-validator' : ''}`;
      const result = await conductor.createWorkspace(
        {
          spaceId: input.profile.spaceId,
          projectId: input.profile.projectId,
          taskId,
          repoPath: input.profile.repoPath,
          runtimeId: input.profile.runtimeId,
          prompt: input.prompt,
          metadata: {
            backgroundAgent: true,
            backgroundIssueId: taskId,
            backgroundIssueTitle: `${role === 'validator' ? 'Validate findings for' : 'Review'} PR #${pr.number}: ${pr.title}`,
            backgroundRepoPath: input.profile.repoPath,
            backgroundRuntimeId: input.profile.runtimeId,
            prReviewAgent: true,
            prReviewRole: role,
            prNumber: pr.number,
            prTitle: pr.title,
            prUrl: pr.url,
            prHeadSha: pr.headSha,
            prBaseRef: pr.baseRefName,
            prHeadRef: pr.headRefName,
            prUpdatedAt: pr.updatedAt,
            prRenames: pr.renames ?? [],
            prLinkedRequirements: (pr.linkedRequirements ?? []).map((requirement) => ({
              number: requirement.number,
              title: requirement.title,
              state: requirement.state,
              url: requirement.url,
            })),
            prUnavailableRequirements: pr.unavailableRequirements ?? [],
            prLinkedBeadsRequirements: (pr.linkedBeadsRequirements ?? []).map((requirement) => ({
              id: requirement.id,
              title: requirement.title,
              ...(requirement.status ? { status: requirement.status } : {}),
            })),
            prUnavailableBeadsRequirements: pr.unavailableBeadsRequirements ?? [],
            prLinkedJiraRequirements: pr.linkedJiraRequirements ?? [],
            prUnavailableJiraRequirements: pr.unavailableJiraRequirements ?? [],
            prReviewRules: pr.reviewRules ?? [],
            prReviewRuleChecks: pr.reviewRuleChecks ?? [],
            ...(pr.reviewRulesUnavailable ? { prReviewRulesUnavailable: pr.reviewRulesUnavailable } : {}),
            ...(pr.impact ? { prImpact: pr.impact } : {}),
            backgroundOwnerId: input.ownerId,
            reviewOwner: 'human',
            githubDelivery: 'human',
            autoMerge: false,
          },
        },
        SQUAD_AUTOPILOT_PRINCIPAL,
      );
      if (!result.ok || !result.value) {
        return { ok: false, reason: result.reason ?? 'conductor refused PR review workspace' };
      }
      return {
        ok: true,
        workspaceId: result.value.workspaceId,
        ...(result.value.runId ? { runId: result.value.runId } : {}),
      };
    },
  };
}

/** The only GitHub write seam used by the human-triggered publish action. */
export function createPullRequestReviewPublisher(
  github: () => PullRequestGithubPublisherFacet,
): PullRequestReviewPublisherPort {
  return {
    async publish(input) {
      const result = await github().submitReview({
        pr: input.number,
        repoRoot: input.repoPath,
        commitId: input.commitId,
        event: input.event,
        body: input.body,
        ...(input.comments ? { comments: input.comments } : {}),
      });
      return result.ok ? { ok: true } : { ok: false, reason: result.reason };
    },
    async listThreads(input) {
      const result = await github().listReviewThreads({ pr: input.number, repoRoot: input.repoPath });
      return result.ok
        ? { ok: true, threads: result.value.threads }
        : { ok: false, reason: result.reason };
    },
  };
}

const PR_REVIEW_FEEDBACK_NAMESPACE = 'agent-os.pr-review-feedback';
const PR_REVIEW_FEEDBACK_STATE_NAMESPACE = 'agent-os.pr-review-feedback-state';

/** Durable repo-scoped review feedback over the shared installed-app KvStore. */
export function createPullRequestReviewFeedbackStore(kv: KvStore): PullRequestReviewFeedbackPort {
  const isRecord = (value: unknown): value is PullRequestFindingFeedbackRecord => {
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    return typeof row.repoPath === 'string' && typeof row.signature === 'string' &&
      typeof row.file === 'string' && typeof row.defectKey === 'string' &&
      (row.symbol === undefined || typeof row.symbol === 'string') &&
      (row.disposition === 'accepted' || row.disposition === 'dismissed') &&
      typeof row.actorId === 'string' && typeof row.updatedAt === 'string';
  };
  type FeedbackState = {
    readonly version: 1;
    readonly repoPath: string;
    readonly records: readonly PullRequestFindingFeedbackRecord[];
    readonly stats: {
      readonly acceptedDecisions: number;
      readonly dismissedDecisions: number;
      readonly startedAt?: string;
      readonly updatedAt?: string;
      readonly coverage: 'since_metrics_enabled' | 'migrated_active_rules';
    };
  };
  const stateKey = (repoPath: string): string => encodeURIComponent(repoPath.trim());
  const isCount = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;
  const isState = (value: unknown, repoPath: string): value is FeedbackState => {
    if (!value || typeof value !== 'object') return false;
    const state = value as Record<string, unknown>;
    const stats = state.stats && typeof state.stats === 'object' ? state.stats as Record<string, unknown> : null;
    return state.version === 1 && state.repoPath === repoPath && Array.isArray(state.records) &&
      state.records.every(isRecord) && !!stats && isCount(stats.acceptedDecisions) &&
      isCount(stats.dismissedDecisions) &&
      (stats.coverage === 'since_metrics_enabled' || stats.coverage === 'migrated_active_rules') &&
      (stats.startedAt === undefined || typeof stats.startedAt === 'string') &&
      (stats.updatedAt === undefined || typeof stats.updatedAt === 'string');
  };
  const legacyRecords = async (repoPath: string): Promise<readonly PullRequestFindingFeedbackRecord[]> => {
    const entries = await kv.list(PR_REVIEW_FEEDBACK_NAMESPACE);
    return entries.flatMap((entry) => isRecord(entry.value) && entry.value.repoPath === repoPath ? [entry.value] : []);
  };
  const loadState = async (repoPath: string): Promise<FeedbackState> => {
    const stored = await kv.getJson<unknown>(PR_REVIEW_FEEDBACK_STATE_NAMESPACE, stateKey(repoPath));
    if (isState(stored, repoPath)) return stored;
    const records = await legacyRecords(repoPath);
    const acceptedDecisions = records.filter((record) => record.disposition === 'accepted').length;
    const dismissedDecisions = records.filter((record) => record.disposition === 'dismissed').length;
    const timestamps = records.map((record) => record.updatedAt).filter(Boolean).sort();
    return {
      version: 1,
      repoPath,
      records,
      stats: {
        acceptedDecisions,
        dismissedDecisions,
        ...(timestamps[0] ? { startedAt: timestamps[0] } : {}),
        ...(timestamps.at(-1) ? { updatedAt: timestamps.at(-1) } : {}),
        coverage: records.length > 0 ? 'migrated_active_rules' : 'since_metrics_enabled',
      },
    };
  };
  const locks = new Map<string, Promise<unknown>>();
  const serialize = async <T>(repoPath: string, action: () => Promise<T>): Promise<T> => {
    const previous = locks.get(repoPath) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(action);
    locks.set(repoPath, current);
    try {
      return await current;
    } finally {
      if (locks.get(repoPath) === current) locks.delete(repoPath);
    }
  };
  const saveState = (state: FeedbackState): Promise<void> =>
    kv.setJson(PR_REVIEW_FEEDBACK_STATE_NAMESPACE, stateKey(state.repoPath), state);
  return {
    durable: kv.isDurable(),
    async list(repoPath) {
      return (await loadState(repoPath)).records;
    },
    async stats(repoPath) {
      const { stats } = await loadState(repoPath);
      const totalDecisions = stats.acceptedDecisions + stats.dismissedDecisions;
      return {
        acceptedDecisions: stats.acceptedDecisions,
        dismissedDecisions: stats.dismissedDecisions,
        totalDecisions,
        dismissalRate: totalDecisions > 0 ? stats.dismissedDecisions / totalDecisions : 0,
        ...(stats.startedAt ? { startedAt: stats.startedAt } : {}),
        ...(stats.updatedAt ? { updatedAt: stats.updatedAt } : {}),
        coverage: stats.coverage,
      };
    },
    async upsert(record) {
      await serialize(record.repoPath, async () => {
        const state = await loadState(record.repoPath);
        const records = state.records.filter((item) => item.signature !== record.signature);
        records.push(record);
        await saveState({
          ...state,
          records,
          stats: {
            ...state.stats,
            acceptedDecisions: state.stats.acceptedDecisions + (record.disposition === 'accepted' ? 1 : 0),
            dismissedDecisions: state.stats.dismissedDecisions + (record.disposition === 'dismissed' ? 1 : 0),
            startedAt: state.stats.startedAt ?? record.updatedAt,
            updatedAt: record.updatedAt,
          },
        });
      });
    },
    async delete(repoPath, signature) {
      await serialize(repoPath, async () => {
        const state = await loadState(repoPath);
        await saveState({ ...state, records: state.records.filter((record) => record.signature !== signature) });
      });
    },
  };
}

function parseReviewRuleCheckEvidence(value: unknown): PullRequestReviewCheckEvidence[] {
  if (!Array.isArray(value)) return [];
  const statuses = new Set<PullRequestReviewCheckEvidence['status']>([
    'pass', 'fail', 'error', 'missing', 'ambiguous', 'unavailable', 'running',
  ]);
  const seen = new Set<string>();
  return value.flatMap((item): PullRequestReviewCheckEvidence[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 200) : '';
    const status = typeof row.status === 'string' && statuses.has(row.status as PullRequestReviewCheckEvidence['status'])
      ? row.status as PullRequestReviewCheckEvidence['status']
      : null;
    if (!name || !status || seen.has(name)) return [];
    seen.add(name);
    const detail = typeof row.detail === 'string' ? row.detail.trim().slice(0, 1_000) : '';
    return [{ name, status, ...(detail ? { detail } : {}), ...(row.autofix === true ? { autofix: true } : {}) }];
  }).slice(0, 30);
}

function parseJiraRequirements(value: unknown): JiraRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): JiraRequirement[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.key !== 'string' || typeof row.title !== 'string' ||
      typeof row.description !== 'string' || typeof row.status !== 'string' ||
      typeof row.url !== 'string'
    ) return [];
    const labels = Array.isArray(row.labels)
      ? row.labels.flatMap((label) => typeof label === 'string' ? [label.slice(0, 200)] : []).slice(0, 50)
      : [];
    return [{
      key: row.key.slice(0, 100),
      title: row.title.slice(0, 2_000),
      description: row.description.slice(0, 20_000),
      status: row.status.slice(0, 200),
      url: row.url.slice(0, 2_000),
      labels,
      ...(typeof row.issueType === 'string' ? { issueType: row.issueType.slice(0, 200) } : {}),
      ...(typeof row.priority === 'string' ? { priority: row.priority.slice(0, 200) } : {}),
    }];
  }).slice(0, 5);
}

function applyReviewRuleCheckRemediation(
  evidence: readonly PullRequestReviewCheckEvidence[],
  value: unknown,
): PullRequestReviewCheckEvidence[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [...evidence];
  const row = value as Record<string, unknown>;
  const checkName = typeof row.checkName === 'string' ? row.checkName.trim() : '';
  const state = row.state;
  if (!checkName || (state !== 'running' && state !== 'passed' && state !== 'failed' && state !== 'error')) {
    return [...evidence];
  }
  const status: PullRequestReviewCheckEvidence['status'] = state === 'passed'
    ? 'pass'
    : state === 'failed'
      ? 'fail'
      : state === 'running'
        ? 'running'
        : 'error';
  const detail = state === 'running'
    ? 'Agent remediation is running; Recoder will independently rerun the named check.'
    : typeof row.afterDetail === 'string' && row.afterDetail.trim()
      ? row.afterDetail.trim().slice(0, 1_000)
      : `Named-check remediation finished with ${status}.`;
  return evidence.map((item) => item.name === checkName
    ? { ...item, status, detail }
    : item);
}

function readPullRequestView(value: unknown): PullRequestReviewContext | null {
  if (value === null || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const author = row.author !== null && typeof row.author === 'object'
    ? text((row.author as Record<string, unknown>).login)
    : undefined;
  if (
    typeof row.number !== 'number' ||
    !Number.isInteger(row.number) ||
    typeof row.title !== 'string' ||
    typeof row.url !== 'string' ||
    typeof row.headRefOid !== 'string' ||
    typeof row.baseRefName !== 'string' ||
    typeof row.headRefName !== 'string' ||
    typeof row.updatedAt !== 'string'
  ) return null;
  return {
    number: row.number,
    title: row.title,
    url: row.url,
    headSha: row.headRefOid,
    baseRefName: row.baseRefName,
    headRefName: row.headRefName,
    isDraft: row.isDraft === true,
    updatedAt: row.updatedAt,
    ...(author ? { author } : {}),
    ...(text(row.body) ? { body: text(row.body) } : {}),
    diff: null,
    diffTruncated: false,
  };
}

function pullRequestImpactField(value: unknown): { impact?: PullRequestImpactContext } {
  const impact = readPullRequestImpact(value);
  return impact ? { impact } : {};
}

/** Validate persisted impact metadata before it reaches prompts or Wave. */
function readPullRequestImpact(value: unknown): PullRequestImpactContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const risks = new Set(['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  if (
    typeof row.available !== 'boolean' ||
    row.source !== 'recodergit' ||
    !risks.has(String(row.risk)) ||
    typeof row.partial !== 'boolean'
  ) return null;
  const files = Array.isArray(row.files)
    ? row.files.slice(0, 100).flatMap(readPullRequestImpactFile)
    : [];
  const tests = files.filter((file) => file.isTest);
  const processes = Array.isArray(row.processes)
    ? row.processes.slice(0, 30).flatMap((value): PullRequestImpactContext['processes'][number][] => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const process = value as Record<string, unknown>;
        const label = text(process.label)?.slice(0, 200);
        if (!label) return [];
        return [{
          ...(text(process.id) ? { id: text(process.id)!.slice(0, 200) } : {}),
          label,
          ...(text(process.processType) ? { processType: text(process.processType)!.slice(0, 100) } : {}),
          ...(text(process.filePath) ? { filePath: text(process.filePath)!.slice(0, 500) } : {}),
        }];
      })
    : [];
  const consumers = Array.isArray(row.consumers)
    ? row.consumers.slice(0, 100).flatMap((value): PullRequestImpactContext['consumers'][number][] => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const consumer = value as Record<string, unknown>;
        const ecosystem = consumer.ecosystem;
        const repoId = text(consumer.repoId)?.slice(0, 200);
        const path = text(consumer.path)?.slice(0, 500);
        const packageName = text(consumer.packageName)?.slice(0, 300);
        const importSpecifier = text(consumer.importSpecifier)?.slice(0, 500);
        if (
          !repoId || !path || !packageName || !importSpecifier ||
          (ecosystem !== 'npm' && ecosystem !== 'python' && ecosystem !== 'go' && ecosystem !== 'cargo')
        ) return [];
        return [{ repoId, path, ecosystem, packageName, importSpecifier, relationType: 'CONSUMED_BY' }];
      })
    : [];
  return {
    available: row.available,
    ...(text(row.reason) ? { reason: text(row.reason)!.slice(0, 1_000) } : {}),
    source: 'recodergit',
    scope: row.scope === 'file' || row.scope === 'mixed' || row.scope === 'unavailable'
      ? row.scope
      : 'symbol',
    risk: row.risk as PullRequestImpactContext['risk'],
    partial: row.partial,
    changedSymbols: stringArray(row.changedSymbols, 12),
    files,
    tests,
    processes,
    consumers,
    summary: {
      impactedFiles: files.length,
      affectedTests: tests.length,
      upstreamFiles: files.filter((file) => file.directions.includes('upstream')).length,
      downstreamFiles: files.filter((file) => file.directions.includes('downstream')).length,
      affectedProcesses: processes.length,
      coChangedFiles: files.filter((file) => file.coChange !== undefined).length,
      crossRepositoryFiles: consumers.length,
      consumerRepositories: new Set(consumers.map((item) => item.repoId)).size,
    },
  };
}

function readPullRequestImpactFile(value: unknown): PullRequestImpactContext['files'][number][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  const path = text(row.path)?.slice(0, 500);
  if (!path || typeof row.minDepth !== 'number' || !Number.isFinite(row.minDepth)) return [];
  const directions = Array.isArray(row.directions)
    ? row.directions.filter((item): item is 'upstream' | 'downstream' => item === 'upstream' || item === 'downstream')
    : [];
  const rawCoChange = row.coChange && typeof row.coChange === 'object' && !Array.isArray(row.coChange)
    ? row.coChange as Record<string, unknown>
    : null;
  const coChange = rawCoChange &&
    typeof rawCoChange.commits === 'number' && Number.isInteger(rawCoChange.commits) && rawCoChange.commits > 0 &&
    typeof rawCoChange.confidence === 'number' && Number.isFinite(rawCoChange.confidence) &&
    rawCoChange.confidence >= 0 && rawCoChange.confidence <= 1
    ? { commits: rawCoChange.commits, confidence: rawCoChange.confidence }
    : null;
  return [{
    path,
    isTest: row.isTest === true,
    minDepth: Math.max(1, Math.floor(row.minDepth)),
    directions: [...new Set(directions)],
    changedSymbols: stringArray(row.changedSymbols, 12),
    symbols: stringArray(row.symbols, 30),
    relationTypes: stringArray(row.relationTypes, 20),
    processes: stringArray(row.processes, 20),
    ...(coChange ? { coChange } : {}),
  }];
}

function stringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? [...new Set(value.flatMap((item) => text(item)?.slice(0, 500) ?? []).slice(0, limit))]
    : [];
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
