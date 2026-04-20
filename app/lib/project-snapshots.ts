import { prisma } from '@/lib/prisma';

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

type LegacyProjectRecord = {
  id?: string;
  urlId?: string;
  title?: string;
  description?: string;
  fileSnapshot?: Record<string, string>;
  framework?: string | null;
  starterId?: string | null;
  source?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const RECODER_WEB_URL =
  process.env.RECODER_WEB_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://web.recoder.xyz' : 'http://localhost:5173');

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

function coerceFiles(files: unknown): Record<string, string> {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(files as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function coerceDirectories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)),
  ).sort();
}

function deriveDirectoriesFromFiles(files: Record<string, string>): string[] {
  return Array.from(
    new Set(
      Object.keys(files)
        .map((filePath) => filePath.split('/').slice(0, -1).join('/'))
        .filter(Boolean),
    ),
  ).sort();
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

export async function upsertProjectSnapshot(userId: string, project: LegacyProjectRecord): Promise<void> {
  if (!project.id) {
    return;
  }

  const files = coerceFiles(project.fileSnapshot);
  const directories = deriveDirectoriesFromFiles(files);
  const title = project.title || project.description || 'Untitled Project';
  const updatedAt = project.updatedAt ? new Date(project.updatedAt) : new Date();
  const createdAt = project.createdAt ? new Date(project.createdAt) : updatedAt;

  await upsertSnapshotRow({
    projectId: project.id,
    userId,
    urlId: project.urlId || null,
    title,
    description: project.description || null,
    files,
    directories,
    framework: project.framework || null,
    starterId: project.starterId || null,
    source: project.source || 'web',
    createdAt,
    updatedAt,
  });
}

async function fetchLegacyProjectsForUser(userId: string, limit: number): Promise<LegacyProjectRecord[]> {
  const url = new URL(`${RECODER_WEB_URL}/api/chat-history`);
  url.searchParams.set('userId', userId);
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    data?: LegacyProjectRecord[];
  } | null;

  if (!payload?.success || !Array.isArray(payload.data)) {
    return [];
  }

  return payload.data.filter((project): project is LegacyProjectRecord => Boolean(project && typeof project === 'object'));
}

export async function listProjectSnapshotsWithLegacyFallback(
  userId: string,
  limit: number,
  fallbackUserIds: string[] = [],
): Promise<ProjectSnapshotRecord[]> {
  const directSnapshots = await listProjectSnapshots(userId, limit);
  if (directSnapshots.length > 0) {
    return directSnapshots;
  }

  const candidateUserIds = Array.from(
    new Set([userId, ...fallbackUserIds].filter((candidate): candidate is string => Boolean(candidate && candidate.trim()))),
  );

  for (const candidateUserId of candidateUserIds) {
    const legacyProjects = await fetchLegacyProjectsForUser(candidateUserId, limit);
    if (legacyProjects.length === 0) {
      continue;
    }

    await Promise.all(legacyProjects.map((project) => upsertProjectSnapshot(userId, project)));
    return listProjectSnapshots(userId, limit);
  }

  return [];
}

export async function getProjectSnapshotWithLegacyFallback(
  projectIdOrUrlId: string,
  userId: string,
  fallbackUserIds: string[] = [],
): Promise<ProjectSnapshotRecord | null> {
  const directSnapshot = await getProjectSnapshot(projectIdOrUrlId, userId);
  if (directSnapshot) {
    return directSnapshot;
  }

  const candidateUserIds = Array.from(
    new Set([userId, ...fallbackUserIds].filter((candidate): candidate is string => Boolean(candidate && candidate.trim()))),
  );

  for (const candidateUserId of candidateUserIds) {
    const legacyProjects = await fetchLegacyProjectsForUser(candidateUserId, 200);
    const legacyProject = legacyProjects.find(
      (project) => project?.id === projectIdOrUrlId || project?.urlId === projectIdOrUrlId,
    );

    if (!legacyProject) {
      continue;
    }

    await upsertProjectSnapshot(userId, legacyProject);
    return getProjectSnapshot(projectIdOrUrlId, userId);
  }

  return null;
}

export async function userOwnsProjectSnapshotWithLegacyFallback(
  userId: string,
  projectIdOrUrlId: string,
): Promise<boolean> {
  if (await userOwnsProjectSnapshot(userId, projectIdOrUrlId)) {
    return true;
  }

  const snapshot = await getProjectSnapshotWithLegacyFallback(projectIdOrUrlId, userId);
  return Boolean(snapshot);
}

export async function patchProjectSnapshotFiles(
  userId: string,
  projectId: string,
  input: SnapshotPatchInput,
): Promise<ProjectSnapshotRecord> {
  const existing = await getProjectSnapshot(projectId, userId);
  const mergedFiles: Record<string, string> = { ...(existing?.files || {}) };
  const mergedDirectories = new Set(existing?.directories || []);

  if (input.files) {
    for (const [path, content] of Object.entries(input.files)) {
      if (typeof content === 'string') {
        mergedFiles[path] = content;
        const parent = path.split('/').slice(0, -1).join('/');
        if (parent) mergedDirectories.add(parent);
      }
    }
  }

  for (const path of input.removePaths || []) {
    delete mergedFiles[path];
  }

  for (const prefix of input.removePathPrefixes || []) {
    for (const path of Object.keys(mergedFiles)) {
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        delete mergedFiles[path];
      }
    }
    for (const dir of Array.from(mergedDirectories)) {
      if (dir === prefix || dir.startsWith(`${prefix}/`)) {
        mergedDirectories.delete(dir);
      }
    }
  }

  for (const rename of input.renamePaths || []) {
    const nextFiles: Record<string, string> = {};
    for (const [path, content] of Object.entries(mergedFiles)) {
      if (path === rename.from || path.startsWith(`${rename.from}/`)) {
        nextFiles[`${rename.to}${path.slice(rename.from.length)}`] = content;
      } else {
        nextFiles[path] = content;
      }
    }
    Object.keys(mergedFiles).forEach((path) => delete mergedFiles[path]);
    Object.assign(mergedFiles, nextFiles);

    const nextDirectories = new Set<string>();
    for (const dir of mergedDirectories) {
      if (dir === rename.from || dir.startsWith(`${rename.from}/`)) {
        nextDirectories.add(`${rename.to}${dir.slice(rename.from.length)}`);
      } else {
        nextDirectories.add(dir);
      }
    }
    mergedDirectories.clear();
    nextDirectories.forEach((dir) => mergedDirectories.add(dir));
  }

  for (const dir of input.addDirectories || []) {
    if (dir) mergedDirectories.add(dir);
  }

  for (const dir of input.removeDirectories || []) {
    mergedDirectories.delete(dir);
  }

  const now = new Date();
  return upsertSnapshotRow({
    projectId,
    userId,
    urlId: input.urlId ?? existing?.urlId ?? null,
    title: input.title ?? existing?.title ?? null,
    description: input.description ?? existing?.description ?? null,
    files: mergedFiles,
    directories: Array.from(mergedDirectories).sort(),
    framework: input.framework ?? existing?.framework ?? null,
    starterId: existing?.starterId ?? null,
    source: input.source ?? existing?.source ?? 'web',
    createdAt: existing?.createdAt ? new Date(existing.createdAt) : now,
    updatedAt: now,
  });
}
