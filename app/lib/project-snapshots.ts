import { prisma } from '@/lib/prisma';
import { coerceDirectories, coerceFiles, mergeSnapshotState } from '@/lib/snapshot-paths';

export type ProjectSnapshotRecord = {
  projectId: string;
  userId: string | null;
  urlId: string | null;
  title: string | null;
  description: string | null;
  files: Record<string, string>;
  directories: string[];
  framework: string | null;
  starterId: string | null;
  source: string | null;
  createdAt: string | null;
  updatedAt: string;
  version: number;
};

type SnapshotPatchInput = {
  files?: Record<string, string>;
  removePaths?: string[];
  removePathPrefixes?: string[];
  addDirectories?: string[];
  removeDirectories?: string[];
  renamePaths?: Array<{ from: string; to: string }>;
  urlId?: string | null;
  title?: string | null;
  description?: string | null;
  framework?: string | null;
  source?: string | null;
};

let schemaEnsured = false;

async function ensureProjectSnapshotsTable(): Promise<void> {
  if (schemaEnsured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS project_snapshots (
      project_id TEXT PRIMARY KEY,
      user_id TEXT NULL,
      url_id TEXT NULL,
      title TEXT NULL,
      description TEXT NULL,
      files JSONB NOT NULL DEFAULT '{}'::jsonb,
      directories JSONB NOT NULL DEFAULT '[]'::jsonb,
      framework TEXT NULL,
      starter_id TEXT NULL,
      source TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      version BIGINT NOT NULL DEFAULT 1
    );
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE project_snapshots
    ADD COLUMN IF NOT EXISTS directories JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS project_snapshots_user_id_updated_at_idx
    ON project_snapshots (user_id, updated_at DESC);
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS project_snapshots_url_id_idx
    ON project_snapshots (url_id);
  `);

  schemaEnsured = true;
}

function mapSnapshotRow(row: any): ProjectSnapshotRecord {
  return {
    projectId: row.project_id,
    userId: row.user_id ?? null,
    urlId: row.url_id ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    files: coerceFiles(row.files),
    directories: coerceDirectories(row.directories),
    framework: row.framework ?? null,
    starterId: row.starter_id ?? null,
    source: row.source ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
    version: Number(row.version ?? 1),
  };
}

/**
 * Resolve the ordered, de-duplicated set of user ids that may own a project
 * snapshot for a given caller.
 *
 * Recoder keeps a single unified `users` table, but a project snapshot can be
 * persisted under either the Better Auth session id OR the resolved app-`users`
 * id for the same human. Those two ids share an email but can differ, so a
 * naive `WHERE user_id = $1` lookup misses rows written under the counterpart
 * id ("legacy fallback").
 *
 * This helper builds the candidate list:
 *   1. the primary user id (always first, never null/empty),
 *   2. any explicit fallback ids the caller already resolved (e.g. a route that
 *      computed both the auth-session id and the app-user id), and
 *   3. the email-counterpart id(s) derived from the `users` table, when not
 *      already provided.
 *
 * Order is preserved (primary first) and duplicates/blanks are removed so the
 * first matching owner wins deterministically.
 */
export async function resolveSnapshotOwnerCandidates(
  userId: string,
  explicitFallbacks: string[] = [],
  options: { deriveCounterparts?: boolean } = {},
): Promise<string[]> {
  const { deriveCounterparts = true } = options;

  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (candidate: string | null | undefined): void => {
    if (typeof candidate !== 'string') return;
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    ordered.push(trimmed);
  };

  push(userId);
  for (const fallback of explicitFallbacks) {
    push(fallback);
  }

  // Derive the email-counterpart id(s) only when we still need to widen the
  // candidate set. This costs at most two indexed lookups and is skipped when
  // the caller already supplied resolved fallbacks or opts out.
  if (deriveCounterparts && typeof userId === 'string' && userId.trim().length > 0) {
    try {
      const owner = await prisma.users.findUnique({
        where: { id: userId.trim() },
        select: { email: true },
      });

      const email = owner?.email;
      if (email) {
        const counterparts = await prisma.users.findMany({
          where: { email },
          select: { id: true },
        });

        for (const counterpart of counterparts as Array<{ id: string }>) {
          push(counterpart.id);
        }
      }
    } catch {
      // The unified-users counterpart lookup is a best-effort widening of the
      // candidate set. If the users table is unavailable we still return the
      // primary + explicit fallbacks rather than failing ownership resolution.
    }
  }

  return ordered;
}

async function upsertSnapshotRow(input: {
  projectId: string;
  userId: string;
  urlId?: string | null;
  title?: string | null;
  description?: string | null;
  files: Record<string, string>;
  directories: string[];
  framework?: string | null;
  starterId?: string | null;
  source?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Promise<ProjectSnapshotRecord> {
  await ensureProjectSnapshotsTable();

  const rows = await prisma.$queryRawUnsafe(
    `
      INSERT INTO project_snapshots (
        project_id,
        user_id,
        url_id,
        title,
        description,
        files,
        directories,
        framework,
        starter_id,
        source,
        created_at,
        updated_at,
        version
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, 1
      )
      ON CONFLICT (project_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        url_id = COALESCE(EXCLUDED.url_id, project_snapshots.url_id),
        title = COALESCE(EXCLUDED.title, project_snapshots.title),
        description = COALESCE(EXCLUDED.description, project_snapshots.description),
        files = EXCLUDED.files,
        directories = EXCLUDED.directories,
        framework = COALESCE(EXCLUDED.framework, project_snapshots.framework),
        starter_id = COALESCE(EXCLUDED.starter_id, project_snapshots.starter_id),
        source = COALESCE(EXCLUDED.source, project_snapshots.source),
        updated_at = EXCLUDED.updated_at,
        version = project_snapshots.version + 1
      RETURNING
        project_id,
        user_id,
        url_id,
        title,
        description,
        files,
        directories,
        framework,
        starter_id,
        source,
        created_at,
        updated_at,
        version
    `,
    input.projectId,
    input.userId,
    input.urlId ?? null,
    input.title ?? null,
    input.description ?? null,
    JSON.stringify(input.files),
    JSON.stringify(input.directories),
    input.framework ?? null,
    input.starterId ?? null,
    input.source ?? 'web',
    input.createdAt,
    input.updatedAt,
  ) as any[];

  return mapSnapshotRow(rows[0]);
}

export async function listProjectSnapshots(userId: string, limit: number): Promise<ProjectSnapshotRecord[]> {
  await ensureProjectSnapshotsTable();

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        project_id,
        user_id,
        url_id,
        title,
        description,
        files,
        directories,
        framework,
        starter_id,
        source,
        created_at,
        updated_at,
        version
      FROM project_snapshots
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `,
    userId,
    limit,
  ) as any[];

  return rows.map(mapSnapshotRow);
}

export async function getProjectSnapshot(projectIdOrUrlId: string, userId: string): Promise<ProjectSnapshotRecord | null> {
  await ensureProjectSnapshotsTable();

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        project_id,
        user_id,
        url_id,
        title,
        description,
        files,
        directories,
        framework,
        starter_id,
        source,
        created_at,
        updated_at,
        version
      FROM project_snapshots
      WHERE user_id = $1
        AND (project_id = $2 OR url_id = $2)
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    userId,
    projectIdOrUrlId,
  ) as any[];

  return rows.length > 0 ? mapSnapshotRow(rows[0]) : null;
}

export async function userOwnsProjectSnapshot(userId: string, projectIdOrUrlId: string): Promise<boolean> {
  await ensureProjectSnapshotsTable();

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT 1
      FROM project_snapshots
      WHERE user_id = $1
        AND (project_id = $2 OR url_id = $2)
      LIMIT 1
    `,
    userId,
    projectIdOrUrlId,
  ) as Array<{ '?column?': number }>;

  return rows.length > 0;
}

/**
 * List a user's project snapshots, transparently checking the legacy
 * cross-model owner id(s) when the primary id has no rows.
 *
 * The route already computes both the auth-session id (primary) and the
 * resolved app-`users` id (fallback). We try the primary first to preserve the
 * proven fast path, then walk each candidate owner id until one yields rows.
 */
export async function listProjectSnapshotsWithLegacyFallback(
  userId: string,
  limit: number,
  fallbackUserIds: string[] = [],
): Promise<ProjectSnapshotRecord[]> {
  const candidates = await resolveSnapshotOwnerCandidates(userId, fallbackUserIds, {
    // The caller (projects route) already resolves the cross-model fallback;
    // skip the extra users lookup unless no fallbacks were supplied.
    deriveCounterparts: fallbackUserIds.length === 0,
  });

  for (const candidate of candidates) {
    const snapshots = await listProjectSnapshots(candidate, limit);
    if (snapshots.length > 0) {
      return snapshots;
    }
  }

  return [];
}

/**
 * Fetch a single project snapshot by id/urlId, transparently checking the
 * legacy cross-model owner id(s) when the primary id does not own it.
 */
export async function getProjectSnapshotWithLegacyFallback(
  projectIdOrUrlId: string,
  userId: string,
  fallbackUserIds: string[] = [],
): Promise<ProjectSnapshotRecord | null> {
  const candidates = await resolveSnapshotOwnerCandidates(userId, fallbackUserIds, {
    deriveCounterparts: fallbackUserIds.length === 0,
  });

  for (const candidate of candidates) {
    const snapshot = await getProjectSnapshot(projectIdOrUrlId, candidate);
    if (snapshot) {
      return snapshot;
    }
  }

  return null;
}

/**
 * Internal-service ownership check that tolerates the unified-`users`
 * cross-model split. The verify-ownership route receives only a single userId
 * (no precomputed fallback), so we derive the email-counterpart id(s) here.
 */
export async function userOwnsProjectSnapshotWithLegacyFallback(
  userId: string,
  projectIdOrUrlId: string,
): Promise<boolean> {
  const candidates = await resolveSnapshotOwnerCandidates(userId, [], {
    deriveCounterparts: true,
  });

  for (const candidate of candidates) {
    if (await userOwnsProjectSnapshot(candidate, projectIdOrUrlId)) {
      return true;
    }
  }

  return false;
}

/**
 * Hydrate real chat message counts for a set of project snapshots.
 *
 * A project snapshot is linked to chat activity through `chat_sessions`, which
 * carry both a `projectId` and a unique `urlId`. The same snapshot may be keyed
 * by its `projectId` OR its `urlId` (the projects API exposes both), so we match
 * a session when EITHER identifier lines up.
 *
 * The authoritative message total is the live row count in `chat_messages`
 * (the cached `chat_sessions.totalMessages` counter can drift), so we group a
 * real `chat_messages.groupBy` by `sessionId` and fold it back onto each
 * project identifier. The whole thing is two indexed queries regardless of how
 * many projects are passed in (no per-project N+1).
 *
 * Returns a map from BOTH the projectId and the urlId of every matched project
 * to its message count, so callers can look up by whichever key they hold.
 * Projects with no chat sessions are simply absent from the map (treat as 0).
 */
export async function getProjectMessageCounts(
  projects: Array<{ projectId: string; urlId: string | null }>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (projects.length === 0) {
    return counts;
  }

  const projectIds = Array.from(
    new Set(
      projects
        .map((p) => p.projectId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );
  const urlIds = Array.from(
    new Set(
      projects
        .map((p) => p.urlId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );

  if (projectIds.length === 0 && urlIds.length === 0) {
    return counts;
  }

  try {
    // 1) Find every chat session that belongs to one of these projects, keyed by
    //    either projectId or urlId. One indexed query.
    const sessions: Array<{ id: string; projectId: string | null; urlId: string | null }> =
      await prisma.chat_sessions.findMany({
        where: {
          OR: [
            ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
            ...(urlIds.length > 0 ? [{ urlId: { in: urlIds } }] : []),
          ],
        },
        select: { id: true, projectId: true, urlId: true },
      });

    if (sessions.length === 0) {
      return counts;
    }

    // 2) Count live chat_messages rows grouped by sessionId. One indexed query.
    const sessionIds = sessions.map((s) => s.id);
    const grouped: Array<{ sessionId: string; _count: { _all: number } }> =
      await prisma.chat_messages.groupBy({
        by: ['sessionId'],
        where: { sessionId: { in: sessionIds } },
        _count: { _all: true },
      });

    const perSession = new Map<string, number>();
    for (const row of grouped) {
      perSession.set(row.sessionId, Number(row._count?._all ?? 0));
    }

    // 3) Fold per-session totals back onto each project identifier (both the
    //    projectId and the urlId map to the same aggregate).
    for (const session of sessions) {
      const messageCount = perSession.get(session.id) ?? 0;
      if (messageCount <= 0) continue;

      for (const key of [session.projectId, session.urlId]) {
        if (typeof key === 'string' && key.length > 0) {
          counts.set(key, (counts.get(key) ?? 0) + messageCount);
        }
      }
    }
  } catch {
    // Message-count hydration is a best-effort enrichment of the projects
    // response. If the chat tables are unavailable we return an empty map and
    // callers fall back to 0 rather than failing the whole projects request.
    return new Map();
  }

  return counts;
}

/**
 * Resolve the chat message count for a single project, by either its projectId
 * or its urlId. Thin wrapper over {@link getProjectMessageCounts} for the
 * project-detail route. Returns 0 when there is no linked chat activity.
 */
export async function getProjectMessageCount(
  projectId: string,
  urlId: string | null,
): Promise<number> {
  const counts = await getProjectMessageCounts([{ projectId, urlId }]);
  return counts.get(projectId) ?? (urlId ? counts.get(urlId) ?? 0 : 0);
}

export type ProjectChatMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

/**
 * Hydrate the real chat transcript for a single project, ordered oldest-first.
 *
 * Resolves the chat session(s) linked to the project (by projectId or urlId)
 * and returns their `chat_messages` rows. `limit` caps the number of returned
 * messages (most recent `limit`, then re-ordered ascending) to keep detail
 * payloads bounded; `messageCount` from {@link getProjectMessageCount} remains
 * the authoritative total even when the transcript is truncated.
 */
export async function getProjectMessages(
  projectId: string,
  urlId: string | null,
  limit = 200,
): Promise<ProjectChatMessage[]> {
  const projectIds = [projectId].filter((id) => typeof id === 'string' && id.length > 0);
  const urlIds = [urlId].filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (projectIds.length === 0 && urlIds.length === 0) {
    return [];
  }

  try {
    const sessions: Array<{ id: string }> = await prisma.chat_sessions.findMany({
      where: {
        OR: [
          ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
          ...(urlIds.length > 0 ? [{ urlId: { in: urlIds } }] : []),
        ],
      },
      select: { id: true },
    });

    if (sessions.length === 0) {
      return [];
    }

    const sessionIds = sessions.map((s) => s.id);
    const rows: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: Date;
      metadata: unknown;
    }> = await prisma.chat_messages.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { id: true, role: true, content: true, createdAt: true, metadata: true },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, limit),
    });

    return rows
      .map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: new Date(row.createdAt).toISOString(),
        metadata:
          row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {},
      }))
      .reverse();
  } catch {
    // Transcript hydration is best-effort; fall back to an empty list rather
    // than failing the project-detail request when chat tables are unavailable.
    return [];
  }
}

export async function patchProjectSnapshotFiles(
  userId: string,
  projectId: string,
  input: SnapshotPatchInput,
): Promise<ProjectSnapshotRecord> {
  const existing = await getProjectSnapshot(projectId, userId);

  // All file/directory bookkeeping (upsert, prefix removal, rename, ancestor
  // directory registration) is delegated to the pure, unit-tested merge helper.
  const { files: mergedFiles, directories: mergedDirectories } = mergeSnapshotState(
    { files: existing?.files, directories: existing?.directories },
    {
      files: input.files,
      removePaths: input.removePaths,
      removePathPrefixes: input.removePathPrefixes,
      addDirectories: input.addDirectories,
      removeDirectories: input.removeDirectories,
      renamePaths: input.renamePaths,
    },
  );

  const now = new Date();
  return upsertSnapshotRow({
    projectId,
    userId,
    urlId: input.urlId ?? existing?.urlId ?? null,
    title: input.title ?? existing?.title ?? null,
    description: input.description ?? existing?.description ?? null,
    files: mergedFiles,
    directories: mergedDirectories,
    framework: input.framework ?? existing?.framework ?? null,
    starterId: existing?.starterId ?? null,
    source: input.source ?? existing?.source ?? 'web',
    createdAt: existing?.createdAt ? new Date(existing.createdAt) : now,
    updatedAt: now,
  });
}
