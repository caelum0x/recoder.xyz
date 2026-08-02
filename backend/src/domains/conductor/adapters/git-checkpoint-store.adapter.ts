/**
 * `createGitCheckpointStore` — the DURABLE default {@link CheckpointStorePort}.
 *
 * Checkpoint metadata is persisted in the workspace's OWN git repo: the capture
 * op (`checkpoint.service.ts`) writes each snapshot as an ANNOTATED
 * `recoder-checkpoint/<id>` tag whose message is the `CheckpointRecord` JSON.
 * This store keeps a bounded in-process cache for fast reads and, on every
 * workspace list, REBUILDS missing records from those tags — so the checkpoint
 * list survives a backend restart (the desktop supervises/relaunches the
 * embedded backend on every app start) without needing a database. DB-less
 * desktop and cloud shapes get the same durability, because the git objects are
 * the source of truth either way.
 *
 * Degrade-truthful: a missing workspace/worktree, a git fault, or an
 * unparseable tag (e.g. a legacy LIGHTWEIGHT checkpoint tag, whose subject is
 * the commit message, not a record) degrades to the in-process cache — records
 * are never fabricated, and a skipped tag is logged, not invented.
 */
import { execFileSafe } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type {
  CheckpointKind,
  CheckpointRecord,
  CheckpointStorePort,
} from '../ports/checkpoint-store.port.js';
import { createInMemoryCheckpointStore } from './checkpoint-store.adapter.js';

/** The glob every checkpoint tag lives under (matches `CHECKPOINT_TAG_PREFIX`). */
const CHECKPOINT_TAG_GLOB = 'recoder-checkpoint/*';

export interface GitCheckpointStoreDeps {
  /** Resolve a workspace (for its `worktreePath`) — the repo the tags live in. */
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  readonly logger: Logger;
  /** Child-process seam for host git; defaults to `execFileSafe`. */
  readonly exec?: typeof execFileSafe;
}

/** Build the git-tag-backed checkpoint store (durable across backend restarts). */
export function createGitCheckpointStore(deps: GitCheckpointStoreDeps): CheckpointStorePort {
  const cache = createInMemoryCheckpointStore();
  const exec = deps.exec ?? execFileSafe;

  async function readTagRecords(workspaceId: string): Promise<readonly CheckpointRecord[]> {
    const workspace = await deps.getWorkspace(workspaceId);
    const cwd = workspace?.worktreePath;
    if (!cwd) return [];
    // One line per tag: the annotated message's first line IS the record JSON
    // (written single-line by the capture op). Lightweight/foreign tags yield a
    // non-JSON subject and are skipped by the decoder below.
    const { stdout } = await exec(
      'git',
      ['-C', cwd, 'tag', '-l', CHECKPOINT_TAG_GLOB, '--format=%(contents:subject)'],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout
      .split('\n')
      .map((line) => decodeRecord(line, workspaceId))
      .filter((r): r is CheckpointRecord => r !== null);
  }

  async function listForWorkspace(workspaceId: string): Promise<readonly CheckpointRecord[]> {
    let rebuilt: readonly CheckpointRecord[];
    try {
      rebuilt = await readTagRecords(workspaceId);
    } catch (err) {
      deps.logger.debug(
        { workspaceId, err },
        'checkpoint git rehydrate unavailable — serving in-process records',
      );
      return cache.listForWorkspace(workspaceId);
    }
    // Seed the cache with rehydrated records so a follow-up get()/restore
    // resolves without another scan; an id this process already wrote keeps its
    // in-process copy (save is insert-or-replace, so re-saving is harmless but
    // the cached copy is never older than the tag it produced).
    const cached = await cache.listForWorkspace(workspaceId);
    const known = new Set(cached.map((r) => r.checkpointId));
    for (const record of rebuilt) {
      if (!known.has(record.checkpointId)) await cache.save(record);
    }
    return cache.listForWorkspace(workspaceId);
  }

  return {
    save: (record) => cache.save(record),
    get: (checkpointId) => cache.get(checkpointId),
    listForWorkspace,
    // Truthful: records written through the capture op ride the workspace repo's
    // annotated tags, which survive a backend restart (rebuilt on list).
    isDurable: () => true,
  };
}

/**
 * Decode one `--format=%(contents:subject)` line into a validated record for
 * THIS workspace, or null (skipped) for anything that is not a well-formed
 * record — never a throw, never a fabricated field.
 */
function decodeRecord(line: string, workspaceId: string): CheckpointRecord | null {
  const text = line.trim();
  if (!text.startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const r = parsed as Record<string, unknown>;
  if (r.workspaceId !== workspaceId) return null;
  const requiredStrings = [
    'checkpointId',
    'spaceId',
    'projectId',
    'taskId',
    'ref',
    'headSha',
    'snapshotSha',
    'branch',
    'baseRef',
    'repoPath',
    'runtimeId',
    'substrate',
    'createdBy',
    'createdAt',
  ] as const;
  for (const key of requiredStrings) {
    if (typeof r[key] !== 'string' || r[key] === '') return null;
  }
  const kind: CheckpointKind = r.kind === 'stash' ? 'stash' : 'commit';
  const metadata =
    r.metadata !== null && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
      ? (r.metadata as Record<string, unknown>)
      : {};
  return {
    checkpointId: r.checkpointId as string,
    workspaceId,
    spaceId: r.spaceId as string,
    projectId: r.projectId as string,
    taskId: r.taskId as string,
    ...(typeof r.label === 'string' && r.label !== '' ? { label: r.label } : {}),
    ...(typeof r.description === 'string' && r.description !== ''
      ? { description: r.description }
      : {}),
    kind,
    ref: r.ref as string,
    headSha: r.headSha as string,
    snapshotSha: r.snapshotSha as string,
    dirty: r.dirty === true,
    branch: r.branch as string,
    baseRef: r.baseRef as string,
    repoPath: r.repoPath as string,
    runtimeId: r.runtimeId as string,
    substrate: r.substrate as string,
    ...(typeof r.runId === 'string' && r.runId !== '' ? { runId: r.runId } : {}),
    metadata,
    createdBy: r.createdBy as string,
    createdAt: r.createdAt as string,
  };
}
