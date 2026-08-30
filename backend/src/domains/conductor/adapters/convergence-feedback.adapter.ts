import type { KvStore } from '../../persistence/ports/kv-store.port.js';
import type {
  ConvergenceDecisionProfile,
  ConvergenceDecisionRecord,
  ConvergenceFeedbackPort,
  ConvergenceFlagDisposition,
  ConvergenceFlagFeedbackEvent,
  ConvergencePickDecision,
  ConvergenceRequiredRulePolicy,
} from '../ports/convergence-feedback.port.js';
import { createHash } from 'node:crypto';

const NAMESPACE = 'conductor.convergence-feedback';
const MAX_DECISIONS = 100;
const MAX_PICKS = 100;
const MAX_FLAGS = 50;
const MAX_FLAG_RULES = 100;
const MAX_FLAG_HISTORY = 500;

type StoredProfile = Omit<ConvergenceDecisionProfile, 'durable'> & { readonly version: 3 };

function text(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function pick(value: unknown): ConvergencePickDecision | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const path = text(row.path, 500);
  const sourceWorkspaceId = text(row.sourceWorkspaceId, 200);
  if (!path || !sourceWorkspaceId) return null;
  const sourceRuntime = text(row.sourceRuntime, 100);
  return { path, sourceWorkspaceId, ...(sourceRuntime ? { sourceRuntime } : {}) };
}

function decision(value: unknown): ConvergenceDecisionRecord | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const workspaceId = text(row.workspaceId, 200);
  const actorId = text(row.actorId, 200);
  const mergedAt = text(row.mergedAt, 100);
  if (!workspaceId || !actorId || !mergedAt) return null;
  const taskGroup = row.taskGroup === null ? null : text(row.taskGroup, 300);
  const evidenceHash = text(row.evidenceHash, 128);
  const trustTier = row.trustTier === 'high' || row.trustTier === 'medium' || row.trustTier === 'low'
    ? row.trustTier
    : undefined;
  const trustScore = typeof row.trustScore === 'number' && Number.isFinite(row.trustScore)
    ? Math.max(0, Math.min(100, Math.round(row.trustScore)))
    : undefined;
  const picks = (Array.isArray(row.picks) ? row.picks : []).flatMap(value => {
    const parsed = pick(value);
    return parsed ? [parsed] : [];
  }).slice(0, MAX_PICKS);
  const proceededWithFlags = (Array.isArray(row.proceededWithFlags) ? row.proceededWithFlags : [])
    .flatMap(value => {
      const parsed = text(value, 1_000);
      return parsed ? [parsed] : [];
    })
    .slice(0, MAX_FLAGS);
  return {
    workspaceId,
    actorId,
    taskGroup,
    mergedAt,
    ...(evidenceHash ? { evidenceHash } : {}),
    picks,
    ...(trustTier ? { trustTier } : {}),
    ...(trustScore !== undefined ? { trustScore } : {}),
    proceededWithFlags,
  };
}

function normalizedFlag(value: unknown): string | null {
  const flag = text(value, 1_000);
  return flag ? flag.replace(/\s+/g, ' ') : null;
}

function flagKey(flag: string): string {
  return createHash('sha256').update(flag.toLocaleLowerCase('en-US')).digest('hex').slice(0, 24);
}

function flagDisposition(value: unknown): ConvergenceFlagDisposition | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const flag = normalizedFlag(row.flag);
  const actorId = text(row.actorId, 200);
  const workspaceId = text(row.workspaceId, 200);
  const updatedAt = text(row.updatedAt, 100);
  const disposition = row.disposition === 'accepted' || row.disposition === 'dismissed'
    ? row.disposition
    : null;
  if (!flag || !actorId || !workspaceId || !updatedAt || !disposition) return null;
  return { key: flagKey(flag), flag, disposition, actorId, workspaceId, updatedAt };
}

function flagFeedbackEvent(value: unknown): ConvergenceFlagFeedbackEvent | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const flag = normalizedFlag(row.flag);
  const actorId = text(row.actorId, 200);
  const workspaceId = text(row.workspaceId, 200);
  const decidedAt = text(row.decidedAt, 100);
  const disposition = row.disposition === 'accepted' || row.disposition === 'dismissed' || row.disposition === 'clear'
    ? row.disposition
    : null;
  if (!flag || !actorId || !workspaceId || !decidedAt || !disposition) return null;
  return { key: flagKey(flag), flag, disposition, actorId, workspaceId, decidedAt };
}

function requiredRulePolicy(value: unknown): ConvergenceRequiredRulePolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { mode: 'off' };
  const row = value as Record<string, unknown>;
  const mode = row.mode === 'warn' || row.mode === 'block' || row.mode === 'off' ? row.mode : 'off';
  const actorId = text(row.actorId, 200);
  const updatedAt = text(row.updatedAt, 100);
  return { mode, ...(actorId ? { actorId } : {}), ...(updatedAt ? { updatedAt } : {}) };
}

function empty(repoId: string, durable: boolean): ConvergenceDecisionProfile {
  return {
    repoId,
    durable,
    totalDeliveries: 0,
    contestedPickDecisions: 0,
    proceededWithFlagDecisions: 0,
    totalFlagFeedbackDecisions: 0,
    acceptedFlagRules: 0,
    dismissedFlagRules: 0,
    decisions: [],
    flagDispositions: [],
    flagFeedbackHistory: [],
    requiredRulePolicy: { mode: 'off' },
  };
}

/** One serialized state document per repository: counters and evidence cannot drift. */
export function createConvergenceFeedbackStore(kv: KvStore): ConvergenceFeedbackPort {
  const locks = new Map<string, Promise<unknown>>();
  const key = (repoId: string): string => encodeURIComponent(repoId.trim());
  const load = async (repoId: string): Promise<ConvergenceDecisionProfile> => {
    const raw = await kv.getJson<unknown>(NAMESPACE, key(repoId));
    if (!raw || typeof raw !== 'object') return empty(repoId, kv.isDurable());
    const row = raw as Record<string, unknown>;
    if ((row.version !== 1 && row.version !== 2 && row.version !== 3) || row.repoId !== repoId) return empty(repoId, kv.isDurable());
    const decisions = (Array.isArray(row.decisions) ? row.decisions : []).flatMap(value => {
      const parsed = decision(value);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_DECISIONS);
    const flagDispositions = (Array.isArray(row.flagDispositions) ? row.flagDispositions : []).flatMap(value => {
      const parsed = flagDisposition(value);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_FLAG_RULES);
    const flagFeedbackHistory = (Array.isArray(row.flagFeedbackHistory) ? row.flagFeedbackHistory : []).flatMap(value => {
      const parsed = flagFeedbackEvent(value);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_FLAG_HISTORY);
    return {
      repoId,
      durable: kv.isDurable(),
      totalDeliveries: typeof row.totalDeliveries === 'number' ? Math.max(0, Math.floor(row.totalDeliveries)) : decisions.length,
      contestedPickDecisions: typeof row.contestedPickDecisions === 'number'
        ? Math.max(0, Math.floor(row.contestedPickDecisions))
        : decisions.reduce((sum, item) => sum + item.picks.length, 0),
      proceededWithFlagDecisions: typeof row.proceededWithFlagDecisions === 'number'
        ? Math.max(0, Math.floor(row.proceededWithFlagDecisions))
        : decisions.reduce((sum, item) => sum + item.proceededWithFlags.length, 0),
      totalFlagFeedbackDecisions: typeof row.totalFlagFeedbackDecisions === 'number'
        ? Math.max(0, Math.floor(row.totalFlagFeedbackDecisions))
        : flagFeedbackHistory.length,
      acceptedFlagRules: flagDispositions.filter(item => item.disposition === 'accepted').length,
      dismissedFlagRules: flagDispositions.filter(item => item.disposition === 'dismissed').length,
      ...(text(row.updatedAt, 100) ? { updatedAt: text(row.updatedAt, 100)! } : {}),
      decisions,
      flagDispositions,
      flagFeedbackHistory,
      requiredRulePolicy: requiredRulePolicy(row.requiredRulePolicy),
    };
  };
  const serialize = async <T>(repoId: string, action: () => Promise<T>): Promise<T> => {
    const previous = locks.get(repoId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(action);
    locks.set(repoId, current);
    try {
      return await current;
    } finally {
      if (locks.get(repoId) === current) locks.delete(repoId);
    }
  };
  return {
    durable: kv.isDurable(),
    read: load,
    async record(repoId, input) {
      return serialize(repoId, async () => {
        const prior = await load(repoId);
        const normalized = decision(input);
        if (!normalized) return prior;
        // Idempotent by delivered workspace: a retried response cannot double-count.
        const existing = prior.decisions.find(item => item.workspaceId === normalized.workspaceId);
        const decisions = [normalized, ...prior.decisions.filter(item => item.workspaceId !== normalized.workspaceId)]
          .slice(0, MAX_DECISIONS);
        const next: ConvergenceDecisionProfile = {
          repoId,
          durable: kv.isDurable(),
          totalDeliveries: prior.totalDeliveries + (existing ? 0 : 1),
          contestedPickDecisions: prior.contestedPickDecisions - (existing?.picks.length ?? 0) + normalized.picks.length,
          proceededWithFlagDecisions:
            prior.proceededWithFlagDecisions - (existing?.proceededWithFlags.length ?? 0) + normalized.proceededWithFlags.length,
          totalFlagFeedbackDecisions: prior.totalFlagFeedbackDecisions,
          acceptedFlagRules: prior.acceptedFlagRules,
          dismissedFlagRules: prior.dismissedFlagRules,
          updatedAt: normalized.mergedAt,
          decisions,
          flagDispositions: prior.flagDispositions,
          flagFeedbackHistory: prior.flagFeedbackHistory,
          requiredRulePolicy: prior.requiredRulePolicy,
        };
        const { durable: _durable, ...persisted } = next;
        const stored: StoredProfile = { version: 3, ...persisted };
        await kv.setJson(NAMESPACE, key(repoId), stored);
        return next;
      });
    },
    async setFlagDisposition(repoId, input) {
      return serialize(repoId, async () => {
        const prior = await load(repoId);
        const event = flagFeedbackEvent(input);
        if (!event) return prior;
        const existingDecision = prior.decisions.find(item => item.workspaceId === event.workspaceId);
        if (!existingDecision?.proceededWithFlags.some(flag => flagKey(normalizedFlag(flag) ?? '') === event.key)) {
          throw new Error('flag was not recorded on this delivered convergence workspace');
        }
        const flagDispositions = event.disposition === 'clear'
          ? prior.flagDispositions.filter(item => item.key !== event.key)
          : [
              {
                key: event.key,
                flag: event.flag,
                disposition: event.disposition,
                actorId: event.actorId,
                workspaceId: event.workspaceId,
                updatedAt: event.decidedAt,
              } satisfies ConvergenceFlagDisposition,
              ...prior.flagDispositions.filter(item => item.key !== event.key),
            ].slice(0, MAX_FLAG_RULES);
        const flagFeedbackHistory = [event, ...prior.flagFeedbackHistory].slice(0, MAX_FLAG_HISTORY);
        const next: ConvergenceDecisionProfile = {
          ...prior,
          durable: kv.isDurable(),
          totalFlagFeedbackDecisions: prior.totalFlagFeedbackDecisions + 1,
          acceptedFlagRules: flagDispositions.filter(item => item.disposition === 'accepted').length,
          dismissedFlagRules: flagDispositions.filter(item => item.disposition === 'dismissed').length,
          updatedAt: event.decidedAt,
          flagDispositions,
          flagFeedbackHistory,
        };
        const { durable: _durable, ...persisted } = next;
        const stored: StoredProfile = { version: 3, ...persisted };
        await kv.setJson(NAMESPACE, key(repoId), stored);
        return next;
      });
    },
    async setRequiredRulePolicy(repoId, input) {
      return serialize(repoId, async () => {
        const prior = await load(repoId);
        const mode = input.mode === 'warn' || input.mode === 'block' || input.mode === 'off'
          ? input.mode
          : 'off';
        const actorId = text(input.actorId, 200);
        const updatedAt = text(input.updatedAt, 100);
        if (!actorId || !updatedAt) return prior;
        const next: ConvergenceDecisionProfile = {
          ...prior,
          durable: kv.isDurable(),
          updatedAt,
          requiredRulePolicy: { mode, actorId, updatedAt },
        };
        const { durable: _durable, ...persisted } = next;
        const stored: StoredProfile = { version: 3, ...persisted };
        await kv.setJson(NAMESPACE, key(repoId), stored);
        return next;
      });
    },
  };
}
