import type { KvStore } from '../../persistence/ports/kv-store.port.js';
import type {
  SkillInvocationEvidence,
  SkillInvocationEvidenceStore,
} from '../skill/skill-invocation-evidence.js';

const INVOCATIONS = 'conductor.skill.invocations';

function namespace(workspaceId: string): string {
  return `${INVOCATIONS}.${encodeURIComponent(workspaceId)}`;
}

function evidence(value: unknown): SkillInvocationEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<SkillInvocationEvidence>;
  return typeof row.id === 'string' && typeof row.startedAt === 'string' &&
    typeof row.actorId === 'string' && typeof row.contentHash === 'string' &&
    row.target != null && typeof row.target === 'object' &&
    typeof row.target.workspaceId === 'string' &&
    row.skill != null && typeof row.skill === 'object' &&
    typeof row.skill.id === 'string' && typeof row.skill.actionId === 'string' &&
    Array.isArray(row.skill.capabilities) && row.policy != null && row.outcome != null
    ? row as SkillInvocationEvidence
    : null;
}

export function createSkillInvocationEvidenceStore(kv: KvStore): SkillInvocationEvidenceStore {
  return {
    async put(record) {
      await kv.setJson(namespace(record.target.workspaceId), record.id, record);
    },
    async listByWorkspace(workspaceId, limit) {
      const rows = (await kv.list(namespace(workspaceId))).flatMap(entry => {
        const parsed = evidence(entry.value);
        return parsed ? [parsed] : [];
      });
      rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
      return {
        total: rows.length,
        invocations: rows.slice(0, Math.max(1, Math.min(200, Math.floor(limit)))),
      };
    },
    isDurable() {
      return kv.isDurable();
    },
  };
}
