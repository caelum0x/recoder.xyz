/**
 * billing-engine — the concrete executor behind the `recoder.billing` MCP server.
 * Lets an AGENT read the authoritative plan + usage for the task/workspace owner
 * over the real DistributionModule (recoder.xyz is the plan authority; Polar is
 * the Merchant-of-Record behind the billing port):
 *
 *  - `billing.plan.read`  — the owner's authoritative plan + effective
 *                           entitlements (`auth.getUserProfile` + `resolver.resolve`).
 *  - `billing.usage.read` — the owner's usage headroom for a metered kind
 *                           (`billing.checkQuota`). Fail-safe: deny/zero-headroom
 *                           on miss, never inflated.
 *
 * Both are READ-ONLY. The billing subject is the OWNER userId, resolved (in order)
 * from `args.userId`, the task owner (`input.task` metadata), then the workspace's
 * `createdBy`. When no subject resolves the tool returns a truthful error rather
 * than guessing or fabricating a plan. Deps are injected (module thunk + optional
 * workspace resolvers) so the wiring is unit-testable without a live Polar or the
 * conductor.
 */
import { billingMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolCallInput } from '@recoder/agent-mcp';
import type {
  Entitlement,
  QuotaDecision,
  RecoderUserProfile,
  Subject,
  UsageKind,
} from '@recoder/distribution';

/** Minimal workspace shape the engine needs to fall back to the owner userId. */
export interface BillingWorkspaceLike {
  workspaceId: string;
  taskId?: string;
  createdBy?: string;
}

/**
 * The subset of the DistributionModule this engine reads. Kept structural so the
 * real `DistributionModule` satisfies it without an import cycle, and a fake can
 * be injected in tests.
 */
export interface BillingModuleLike {
  auth: { getUserProfile(userId: string): Promise<RecoderUserProfile | null> };
  resolver: { resolve(subject: Subject): Promise<Entitlement[]> };
  billing: { checkQuota(subject: Subject, kind: UsageKind, cost?: number): Promise<QuotaDecision> };
}

/** Injected seams; the module is a thunk so it is built lazily (never at import). */
export interface BillingEngineDeps {
  getModule(): BillingModuleLike;
  getWorkspace?(id: string): Promise<BillingWorkspaceLike | null>;
  listWorkspaces?(): Promise<BillingWorkspaceLike[]>;
}

/** Metered usage kinds distribution gates (mirror of the distribution UsageKind). */
const USAGE_KINDS: readonly UsageKind[] = [
  'cli_request',
  'agent_run',
  'publish',
  'preview',
  'download',
] as const;
const DEFAULT_USAGE_KIND: UsageKind = 'agent_run';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Pull an owner userId off a task's metadata (several conventional key spellings). */
function taskOwnerId(input: McpToolCallInput): string | undefined {
  const meta = input.task?.metadata;
  if (!meta) return undefined;
  return str(meta.userId) ?? str(meta.ownerId) ?? str(meta.createdBy);
}

function normalizeUsageKind(v: unknown): UsageKind {
  const raw = str(v);
  if (!raw) return DEFAULT_USAGE_KIND;
  if ((USAGE_KINDS as readonly string[]).includes(raw)) return raw as UsageKind;
  throw new Error(`unknown usage kind: ${raw} (expected one of ${USAGE_KINDS.join(', ')})`);
}

export function registerBillingMcpTools(
  router: McpToolRouter,
  deps: BillingEngineDeps,
): void {
  /**
   * Resolve the billing subject (owner userId): explicit `args.userId` wins, then
   * the task owner, then the workspace's `createdBy`. Throws a truthful error when
   * none resolves (never guesses a subject).
   */
  async function resolveUserId(input: McpToolCallInput): Promise<string> {
    const fromArgs = str(input.args.userId);
    if (fromArgs) return fromArgs;
    const fromTask = taskOwnerId(input);
    if (fromTask) return fromTask;

    // Fall back to the workspace owner, resolved like the other engines.
    const wid = str(input.args.workspaceId) ?? str(input.args.id);
    if (wid && deps.getWorkspace) {
      const ws = await deps.getWorkspace(wid);
      const owner = str(ws?.createdBy);
      if (owner) return owner;
    }
    const tid = str(input.args.taskId) ?? input.task?.taskId;
    if (tid && deps.listWorkspaces) {
      const all = await deps.listWorkspaces();
      const forTask = all.filter((w) => w.taskId === tid);
      const owner = forTask.length ? str(forTask[forTask.length - 1].createdBy) : undefined;
      if (owner) return owner;
    }
    throw new Error(
      'no billing subject: could not resolve an owner userId from args.userId, the task, or the workspace.',
    );
  }

  router.register(billingMcpServer, 'billing.plan.read', async (input) => {
    const userId = await resolveUserId(input);
    const mod = deps.getModule();
    const subject: Subject = { subjectId: userId, kind: 'user' };
    const [profile, entitlements] = await Promise.all([
      mod.auth.getUserProfile(userId),
      mod.resolver.resolve(subject),
    ]);
    return {
      content: {
        userId,
        plan: profile?.plan ?? null,
        hasOwnApiKey: profile?.hasOwnApiKey ?? null,
        entitlements: entitlements.map((e) => ({
          kind: e.kind,
          key: e.key,
          plan: e.plan,
          granted: e.granted,
        })),
        message: profile
          ? undefined
          : 'No plan profile resolved for this user from recoder.xyz (the subject may be unknown) — reporting entitlements only.',
      },
    };
  });

  router.register(billingMcpServer, 'billing.usage.read', async (input) => {
    const userId = await resolveUserId(input);
    const kind = normalizeUsageKind(input.args.kind);
    const mod = deps.getModule();
    const subject: Subject = { subjectId: userId, kind: 'user' };
    const decision = await mod.billing.checkQuota(subject, kind);
    return {
      content: {
        userId,
        kind,
        allowed: decision.allowed,
        limit: decision.quota.limit,
        remaining: decision.quota.remaining,
        resetAt: decision.quota.resetAt,
        unlimited: decision.quota.limit === 0,
        reason: decision.reason,
      },
    };
  });
}
