/**
 * SessionTranscriptService — bounded search over Claude Code session transcripts.
 *
 * Claude lays sessions out as `~/.claude/projects/<slug>/<session-id>.jsonl`.
 * This service globs that ONE-level tree, parses each file with the pure
 * {@link parseClaudeSessionJsonl}, and runs {@link searchTranscript} — powering
 * the palette's "search my sessions by message content" (the recoder-8d06 gap).
 *
 * Bounded + degrade-truthful: scans at most MAX_FILES files and returns at most
 * MAX_HITS hits so a huge history can't stall the edge; an absent sessions dir is
 * a truthful `available:false` (never an error); a single unreadable file is
 * skipped, not fatal. Never throws.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import type { Logger } from '../../../shared/logger.js';
import {
  parseClaudeSessionJsonl,
  searchTranscript,
  type TranscriptMatch,
  type TranscriptMessage,
} from './claude-session-parser.js';

const MAX_FILES = 200;
const MAX_HITS = 100;
/** Cap a hydrated workspace transcript to its most recent turns (bounded edge). */
const MAX_MESSAGES = 500;
const NO_WORKSPACE_SESSION = 'no session file for this workspace';

export interface TranscriptSearchHit extends TranscriptMatch {
  /** The session id (jsonl basename) the hit came from. */
  readonly sessionId: string;
}

/** The `GET /api/conductor/transcript/search` read-model. */
export interface TranscriptSearchView {
  /** False when there is no Claude sessions dir to search (a truthful, benign state). */
  readonly available: boolean;
  readonly reason?: string;
  readonly query: string;
  readonly hits: readonly TranscriptSearchHit[];
  /** How many session files were actually scanned (may be capped — see MAX_FILES). */
  readonly filesScanned: number;
}

/** The per-workspace read-model (`GET …/workspaces/:id/transcript`). */
export interface WorkspaceTranscriptView {
  /** False when this workspace has no Claude session file yet (a truthful, benign state). */
  readonly available: boolean;
  readonly reason?: string;
  /** The hydrated turn stream (bounded to the last MAX_MESSAGES), oldest → newest. */
  readonly messages: readonly TranscriptMessage[];
}

/** Injectable fs seam (tests pass fakes; default = real node fs under ~/.claude/projects). */
export interface SessionTranscriptFs {
  readdir(dir: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  /**
   * Optional recency probe. When present, the newest session file is chosen by
   * mtime; when absent (headless/fake fs), selection falls back to lexical-max
   * basename so the read still resolves a single file deterministically.
   */
  stat?(path: string): Promise<{ mtimeMs: number }>;
}

export interface SessionTranscriptDeps {
  readonly logger: Logger;
  readonly fs?: SessionTranscriptFs;
  /** Root sessions dir; defaults to ~/.claude/projects. */
  readonly baseDir?: string;
}

export class SessionTranscriptService {
  private readonly log: Logger;
  private readonly fs: SessionTranscriptFs;
  private readonly baseDir: string;

  constructor(deps: SessionTranscriptDeps) {
    this.log = deps.logger;
    this.fs = deps.fs ?? {
      readdir,
      readFile: (p) => readFile(p, 'utf8'),
      stat: async (p) => ({ mtimeMs: (await stat(p)).mtimeMs }),
    };
    this.baseDir = deps.baseDir ?? join(homedir(), '.claude', 'projects');
  }

  async search(rawQuery: string): Promise<TranscriptSearchView> {
    const query = (rawQuery ?? '').trim();
    if (query === '') {
      return { available: true, query: '', hits: [], filesScanned: 0 };
    }
    let files: string[];
    try {
      files = await this.listSessionFiles();
    } catch {
      return { available: false, reason: 'no Claude sessions directory found', query, hits: [], filesScanned: 0 };
    }
    if (files.length === 0) {
      return { available: true, query, hits: [], filesScanned: 0 };
    }
    const hits: TranscriptSearchHit[] = [];
    let scanned = 0;
    for (const file of files) {
      if (hits.length >= MAX_HITS) break;
      let content: string;
      try {
        content = await this.fs.readFile(file);
      } catch {
        continue; // a single unreadable session is skipped, never fatal
      }
      scanned += 1;
      const sessionId = basename(file).replace(/\.jsonl$/i, '');
      for (const m of searchTranscript(parseClaudeSessionJsonl(content), query)) {
        hits.push({ ...m, sessionId });
        if (hits.length >= MAX_HITS) break;
      }
    }
    return { available: true, query, hits, filesScanned: scanned };
  }

  /**
   * Hydrate ONE workspace's transcript for the Session view: derive Claude's slug
   * from the worktree path (`/[/.]/g` → `-`, the same mangling Claude applies when
   * it lays out `~/.claude/projects/<slug>/`), read that dir, parse the NEWEST
   * `.jsonl`, and return the last MAX_MESSAGES turns. Degrade-truthful: no dir /
   * no `.jsonl` / all files unreadable ⇒ `available:false`, never a throw.
   */
  async getWorkspaceTranscript(worktreePath: string): Promise<WorkspaceTranscriptView> {
    const slug = worktreePath.replace(/[/.]/g, '-');
    const dir = join(this.baseDir, slug);
    let entries: string[];
    try {
      entries = await this.fs.readdir(dir);
    } catch {
      return { available: false, reason: NO_WORKSPACE_SESSION, messages: [] };
    }
    const files = entries.filter((e) => e.toLowerCase().endsWith('.jsonl'));
    if (files.length === 0) {
      return { available: false, reason: NO_WORKSPACE_SESSION, messages: [] };
    }
    const ordered = await this.orderByRecencyDesc(dir, files);
    for (const file of ordered) {
      let content: string;
      try {
        content = await this.fs.readFile(join(dir, file));
      } catch {
        continue; // an unreadable newest file is skipped — fall back to the next
      }
      const messages = parseClaudeSessionJsonl(content);
      return { available: true, messages: messages.slice(-MAX_MESSAGES) };
    }
    return { available: false, reason: NO_WORKSPACE_SESSION, messages: [] };
  }

  /**
   * Order session basenames newest-first: by mtime when the stat seam exists,
   * else by lexical-max basename (a deterministic headless fallback). A stat
   * failure sinks that file to the back rather than aborting the whole read.
   */
  private async orderByRecencyDesc(dir: string, files: readonly string[]): Promise<string[]> {
    const statFn = this.fs.stat;
    if (statFn == null) {
      return [...files].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    }
    const withMtime = await Promise.all(
      files.map(async (file) => {
        try {
          const s = await statFn(join(dir, file));
          return { file, mtimeMs: s.mtimeMs };
        } catch {
          return { file, mtimeMs: Number.NEGATIVE_INFINITY };
        }
      }),
    );
    return withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs).map((x) => x.file);
  }

  /** List up to MAX_FILES `<slug>/<session>.jsonl` paths under the base dir. */
  private async listSessionFiles(): Promise<string[]> {
    const slugs = await this.fs.readdir(this.baseDir);
    const files: string[] = [];
    for (const slug of slugs) {
      if (files.length >= MAX_FILES) break;
      let entries: string[];
      try {
        entries = await this.fs.readdir(join(this.baseDir, slug));
      } catch {
        continue; // not a dir / unreadable — skip
      }
      for (const entry of entries) {
        if (files.length >= MAX_FILES) break;
        if (entry.toLowerCase().endsWith('.jsonl')) {
          files.push(join(this.baseDir, slug, entry));
        }
      }
    }
    return files;
  }
}
