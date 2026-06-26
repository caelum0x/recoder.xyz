/**
 * Secure GitHub clone helpers for the user-facing code-graph connect flow.
 *
 * SECURITY CONTRACT (binding — .claude/rules/security.md):
 * - A private-repo token NEVER appears in the git `clone` argv, NEVER in the
 *   clone URL, and is NEVER logged. The token is handed to git out-of-band via
 *   a transient GIT_ASKPASS helper script that reads it from the child process
 *   ENV (not argv, not the URL). The temp helper is removed in `finally`.
 * - GIT_TERMINAL_PROMPT=0 ensures a missing/invalid token fails fast instead of
 *   hanging on an interactive prompt.
 * - Error messages are redacted so a token can never leak through stderr.
 *
 * All IO (the `git` spawn) is INJECTABLE so tests can assert the exact argv/URL
 * passed to git WITHOUT the token ever appearing, and without a real network.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { repoIdFromFullName } from './recodergit-service';

const CODE_GRAPH_FLAG_ENV = 'RECODER_CODE_GRAPH_ENABLED';
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/** GitHub username used with a token over HTTPS. Not a secret. */
export const GIT_TOKEN_USERNAME = 'x-access-token';

/** True when RECODER_CODE_GRAPH_ENABLED is truthy. Default OFF. */
export function isCodeGraphEnabled(): boolean {
  const raw = process.env[CODE_GRAPH_FLAG_ENV]?.trim().toLowerCase();
  return raw !== undefined && TRUTHY.has(raw);
}

export interface CloneSpawnResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Injectable git spawn. Default shells `git`; tests pass a recording fake. */
export type CloneSpawn = (
  command: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<CloneSpawnResult>;

export interface AuthenticatedCloneInput {
  /** Clean clone URL — MUST NOT contain credentials. */
  cloneUrl: string;
  /** Absolute destination directory for the clone. */
  dest: string;
  /** Optional branch/ref to clone. */
  ref?: string;
  /** The logged-in user's GitHub token, or null for an unauthenticated (public) clone. */
  token: string | null;
}

/** Performs a clone. Token (when present) is supplied via ENV, never argv/URL. */
export type AuthenticatedClone = (input: AuthenticatedCloneInput) => Promise<void>;

function defaultSpawn(): CloneSpawn {
  return (command, args, opts) =>
    new Promise<CloneSpawnResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: opts.cwd,
        env: opts.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    });
}

/** Replace any occurrence of the token in a string with a fixed redaction. */
function redact(text: string, token: string | null): string {
  if (!token) return text;
  return text.split(token).join('***');
}

/**
 * Write a transient, owner-only GIT_ASKPASS helper. The helper prints the
 * username for "Username" prompts and the token for password prompts, both read
 * from ENV — so the token never touches argv, the URL, or any log line. Returns
 * the helper directory (caller removes it) and the env to merge into the spawn.
 */
function makeAskpass(token: string): { dir: string; script: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'recoder-gitaskpass-'));
  const script = path.join(dir, 'askpass.sh');
  // $1 is the full git prompt, e.g. "Username for 'https://github.com': ".
  const body = [
    '#!/bin/sh',
    'case "$1" in',
    "  Username*|username*) printf '%s' \"${RECODER_GH_USER:-x-access-token}\" ;;",
    "  *) printf '%s' \"${RECODER_GH_TOKEN:-}\" ;;",
    'esac',
    '',
  ].join('\n');
  writeFileSync(script, body, { mode: 0o700 });
  return {
    dir,
    script,
    env: {
      GIT_ASKPASS: script,
      RECODER_GH_USER: GIT_TOKEN_USERNAME,
      RECODER_GH_TOKEN: token,
    },
  };
}

/**
 * Default secure clone. Builds `git clone --depth 1 [--branch ref] <cleanUrl> <dest>`
 * (NO token in argv/URL) and, when a token is present, supplies it via a transient
 * GIT_ASKPASS helper through ENV. Rejects on non-zero exit with a redacted message.
 */
export function createAuthenticatedClone(spawnFn: CloneSpawn = defaultSpawn()): AuthenticatedClone {
  return async ({ cloneUrl, dest, ref, token }) => {
    if (containsCredentials(cloneUrl)) {
      throw new Error('cloneUrl must not embed credentials');
    }
    mkdirSync(path.dirname(dest), { recursive: true });

    const args = ['clone', '--depth', '1'];
    if (ref) {
      args.push('--branch', ref);
    }
    args.push(cloneUrl, dest);

    const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    let askpassDir: string | null = null;
    if (token) {
      const askpass = makeAskpass(token);
      askpassDir = askpass.dir;
      Object.assign(env, askpass.env);
    }

    try {
      const result = await spawnFn('git', args, { cwd: path.dirname(dest), env });
      if (result.code !== 0) {
        const detail = redact(result.stderr.trim(), token).slice(0, 200);
        throw new Error(
          token
            ? `git clone failed (${result.code}): ${detail}`
            : `git clone failed (${result.code}); the repository may be private (authentication required): ${detail}`,
        );
      }
    } finally {
      if (askpassDir) {
        try {
          rmSync(askpassDir, { recursive: true, force: true });
        } catch {
          // best-effort cleanup; never throw from cleanup
        }
      }
    }
  };
}

/** True when a URL embeds userinfo credentials (user:pass@host). */
function containsCredentials(url: string): boolean {
  try {
    if (/^https?:\/\//i.test(url)) {
      const parsed = new URL(url);
      return parsed.password.length > 0;
    }
  } catch {
    return false;
  }
  return false;
}

export interface ParsedRepoInput {
  /** Path-safe identifier derived from the full name (or URL). */
  repoId: string;
  /** Clean https clone URL with NO credentials. */
  cloneUrl: string;
  /** `owner/name` when resolvable, else null. */
  fullName: string | null;
}

/**
 * Resolve a user-supplied repo reference into a clean clone URL + path-safe id.
 * Accepts `owner/name` (-> https://github.com/owner/name.git) or a clone URL.
 * Rejects URLs that embed credentials so a token can never be persisted/logged.
 */
export function parseRepoInput(repo: string): ParsedRepoInput {
  const trimmed = repo.trim();
  if (trimmed.length === 0) {
    throw new Error('repo is required ("owner/name" or a clone URL)');
  }

  const isUrl = /^https?:\/\//i.test(trimmed) || /^git@/i.test(trimmed) || /^ssh:\/\//i.test(trimmed);
  if (isUrl) {
    if (containsCredentials(trimmed)) {
      throw new Error('do not embed credentials in the clone URL; pass the token separately');
    }
    const fullName = extractFullName(trimmed);
    return {
      cloneUrl: trimmed,
      repoId: repoIdFromFullName(fullName ?? trimmed),
      fullName,
    };
  }

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    const fullName = trimmed.replace(/\.git$/i, '');
    return {
      cloneUrl: `https://github.com/${fullName}.git`,
      repoId: repoIdFromFullName(fullName),
      fullName,
    };
  }

  throw new Error('repo must be "owner/name" or a clone URL');
}

/** Best-effort `owner/name` extraction from a git/https/ssh URL. */
function extractFullName(url: string): string | null {
  const match = url
    .replace(/^git@[^:]+:/i, '')
    .replace(/^ssh:\/\/[^/]+\//i, '')
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/\.git$/i, '')
    .match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
  return match ? match[1] : null;
}
