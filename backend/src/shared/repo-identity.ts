import { createHash } from 'node:crypto';
import path from 'node:path';

export interface RepositoryRemoteIdentity {
  readonly host: string;
  readonly owner: string;
  readonly repo: string;
}

export interface CanonicalRepositoryIdentity {
  readonly repoId: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly remote?: RepositoryRemoteIdentity;
  readonly source: 'remote' | 'ghq' | 'project' | 'local';
}

function safePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '__').replace(/^__+|__+$/g, '');
}

/** The legacy path-safe normalization used by RecoderGit and Conductor. */
export function legacyRepoId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '__');
}

function validRemotePart(value: string): boolean {
  return value.length > 0 && /^[A-Za-z0-9_.-]+$/.test(value);
}

/** Parse HTTPS, ssh/scp, PR URLs, or an owner/repo full name. */
export function parseRepositoryRemote(value: string | undefined): RepositoryRemoteIdentity | null {
  const input = value?.trim();
  if (!input) return null;
  let host = '';
  let segments: string[] = [];
  const scp = input.match(/^(?:[^@\s]+@)?([^:/\s]+):([^\s]+)$/);
  if (scp?.[1] && scp[2] && !input.includes('://')) {
    host = scp[1];
    segments = scp[2].split('/').filter(Boolean);
  } else if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(input)) {
    host = 'github.com';
    segments = input.split('/');
  } else {
    try {
      const url = new URL(input);
      if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return null;
      host = url.hostname;
      segments = url.pathname.split('/').filter(Boolean);
    } catch {
      return null;
    }
  }
  const owner = segments[0] ?? '';
  const repo = (segments[1] ?? '').replace(/\.git$/i, '');
  if (!validRemotePart(host) || !validRemotePart(owner) || !validRemotePart(repo)) return null;
  return { host: host.toLowerCase(), owner: owner.toLowerCase(), repo: repo.toLowerCase() };
}

function parseGhqRemote(repoPath: string | undefined): RepositoryRemoteIdentity | null {
  const segments = (repoPath ?? '').trim().replace(/\\/g, '/').split('/').filter(Boolean);
  for (let index = 0; index + 2 < segments.length; index += 1) {
    const host = segments[index] ?? '';
    const owner = segments[index + 1] ?? '';
    const repo = (segments[index + 2] ?? '').replace(/\.git$/i, '');
    if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(host) && validRemotePart(owner) && validRemotePart(repo)) {
      return { host: host.toLowerCase(), owner: owner.toLowerCase(), repo: repo.toLowerCase() };
    }
  }
  return null;
}

export function repoIdFromRemote(remote: RepositoryRemoteIdentity): string {
  const owner = safePart(remote.owner) || 'owner';
  const repo = safePart(remote.repo) || 'repo';
  return remote.host === 'github.com'
    ? `${owner}__${repo}`
    : `${safePart(remote.host) || 'host'}__${owner}__${repo}`;
}

function localRepoId(repoPath: string): string {
  const normalized = repoPath.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const basename = safePart(path.posix.basename(normalized)) || 'repo';
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `local__${basename}__${digest}`;
}

function uniqueAliases(values: readonly (string | null | undefined)[], canonical: string): string[] {
  const aliases = new Set<string>();
  for (const value of values) {
    const candidate = value?.trim();
    if (candidate && candidate !== canonical) aliases.add(candidate);
  }
  return [...aliases];
}

/**
 * Derive one identity for code indexes, snapshots, PR review, and run metadata.
 * Remote identity wins; ghq layout avoids a git subprocess; explicit project
 * identity preserves non-git callers; the local fallback is collision-safe.
 */
export function canonicalRepositoryIdentity(input: {
  readonly repoPath?: string;
  readonly projectId?: string;
  readonly remoteUrl?: string;
}): CanonicalRepositoryIdentity {
  const explicitRemote = parseRepositoryRemote(input.remoteUrl);
  const remote = explicitRemote ?? parseGhqRemote(input.repoPath);
  if (remote) {
    const repoId = repoIdFromRemote(remote);
    const desktopProjectId = legacyRepoId(`${remote.owner}-${remote.repo}`);
    return {
      repoId,
      displayName: `${remote.owner}/${remote.repo}`,
      aliases: uniqueAliases([
        input.projectId ? legacyRepoId(input.projectId) : null,
        desktopProjectId,
        input.repoPath ? legacyRepoId(input.repoPath) : null,
        input.repoPath ? legacyRepoId(path.basename(input.repoPath.replace(/[\\/]+$/, ''))) : null,
      ], repoId),
      remote,
      source: explicitRemote ? 'remote' : 'ghq',
    };
  }

  const project = input.projectId?.trim();
  if (project) {
    const repoId = legacyRepoId(project) || 'repo';
    return {
      repoId,
      displayName: project,
      aliases: uniqueAliases([
        input.repoPath ? legacyRepoId(input.repoPath) : null,
        input.repoPath ? legacyRepoId(path.basename(input.repoPath.replace(/[\\/]+$/, ''))) : null,
      ], repoId),
      source: 'project',
    };
  }

  const repoPath = input.repoPath?.trim() || 'repo';
  const repoId = localRepoId(repoPath);
  return {
    repoId,
    displayName: path.basename(repoPath.replace(/[\\/]+$/, '')) || 'repo',
    aliases: uniqueAliases([legacyRepoId(repoPath), legacyRepoId(path.basename(repoPath))], repoId),
    source: 'local',
  };
}
