import type { KvStore } from '../../persistence/ports/kv-store.port.js';
import type {
  SkillTrustStore,
  StoredSkillManifest,
  StoredSkillPublisher,
} from '../skill/skill-trust.service.js';

const PUBLISHERS = 'conductor.skill.publishers';
const MANIFESTS = 'conductor.skill.manifests';

function publisher(value: unknown): StoredSkillPublisher | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<StoredSkillPublisher>;
  return typeof row.keyId === 'string' && typeof row.publicKey === 'string' &&
    typeof row.addedBy === 'string' && typeof row.addedAt === 'string'
    ? row as StoredSkillPublisher
    : null;
}

function manifest(value: unknown): StoredSkillManifest | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<StoredSkillManifest>;
  return row.manifest != null && typeof row.manifest === 'object' &&
    typeof row.addedBy === 'string' && typeof row.addedAt === 'string'
    ? row as StoredSkillManifest
    : null;
}

export function createSkillTrustStore(kv: KvStore): SkillTrustStore {
  return {
    async listPublishers() {
      return (await kv.list(PUBLISHERS)).flatMap(entry => {
        const parsed = publisher(entry.value);
        return parsed ? [parsed] : [];
      });
    },
    async listManifests() {
      return (await kv.list(MANIFESTS)).flatMap(entry => {
        const parsed = manifest(entry.value);
        return parsed ? [parsed] : [];
      });
    },
    async putPublisher(value) {
      await kv.setJson(PUBLISHERS, value.keyId, value);
    },
    async deletePublisher(keyId) {
      await kv.delete(PUBLISHERS, keyId);
    },
    async putManifest(value) {
      await kv.setJson(MANIFESTS, value.manifest.id, value);
    },
    async deleteManifest(skillId) {
      await kv.delete(MANIFESTS, skillId);
    },
    isDurable() {
      return kv.isDurable();
    },
  };
}
