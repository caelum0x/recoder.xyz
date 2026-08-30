/**
 * Durable remote-continuity session store over the canonical persistence KvStore.
 * KvStore owns database/fallback selection and TTL enforcement; this adapter owns
 * only the remote-session namespace and defensive decoding.
 */
import type { KvStore } from '../../persistence/ports/kv-store.port.js';
import type { RemoteAttachSessionStore } from '../remote-attach/remote-attach.service.js';
import type {
  RemoteAttachCapability,
  RemoteAttachSession,
} from '../remote-attach/remote-attach.types.js';

const NAMESPACE = 'conductor.remote_attach';
const CAPABILITIES: readonly RemoteAttachCapability[] = ['monitor', 'steer'];

function parseSession(value: unknown): RemoteAttachSession | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.sessionId !== 'string' ||
    typeof row.principalId !== 'string' ||
    typeof row.issuedAt !== 'string' ||
    typeof row.expiresAt !== 'string' ||
    row.scope == null ||
    typeof row.scope !== 'object' ||
    Array.isArray(row.scope) ||
    !Array.isArray(row.capabilities)
  ) {
    return null;
  }
  const capabilities = row.capabilities.filter(
    (capability): capability is RemoteAttachCapability =>
      typeof capability === 'string' &&
      (CAPABILITIES as readonly string[]).includes(capability)
  );
  if (capabilities.length === 0) return null;
  const rawScope = row.scope as Record<string, unknown>;
  const workspaceIds = Array.isArray(rawScope.workspaceIds)
    ? rawScope.workspaceIds.filter(
        (workspaceId): workspaceId is string =>
          typeof workspaceId === 'string' && workspaceId.trim().length > 0
      )
    : [];
  const taskGroup =
    typeof rawScope.taskGroup === 'string' && rawScope.taskGroup.trim().length > 0
      ? rawScope.taskGroup.trim()
      : undefined;
  if (workspaceIds.length === 0 && !taskGroup) return null;
  return {
    sessionId: row.sessionId,
    principalId: row.principalId,
    scope: {
      ...(workspaceIds.length > 0 ? { workspaceIds } : {}),
      ...(taskGroup ? { taskGroup } : {}),
    },
    capabilities,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    durable: row.durable === true,
  };
}

export function createRemoteAttachSessionStore(kv: KvStore): RemoteAttachSessionStore {
  return {
    async get(sessionId) {
      return parseSession(await kv.getJson<unknown>(NAMESPACE, sessionId));
    },
    async set(session, ttlMs) {
      await kv.setJson(NAMESPACE, session.sessionId, session, { ttlMs });
    },
    async delete(sessionId) {
      await kv.delete(NAMESPACE, sessionId);
    },
    async deleteByPrincipal(principalId) {
      const sessions = (await kv.list(NAMESPACE))
        .map(entry => parseSession(entry.value))
        .filter((session): session is RemoteAttachSession =>
          session != null && session.principalId === principalId
        );
      await Promise.all(sessions.map(session => kv.delete(NAMESPACE, session.sessionId)));
      return sessions.length;
    },
    isDurable() {
      return kv.isDurable();
    },
  };
}
