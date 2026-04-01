/**
 * @module scratchpad
 *
 * In-process, session-scoped scratchpad for agent state sharing within a session.
 *
 * Zero infra — runs in-memory with optional JSON persistence to /data/lance/{sessionId}/.
 * Entries are automatically evicted when the session expires (TTL default: 2h).
 *
 * Use cases:
 * - Share intermediate task results between agents in a session
 * - Store structured data too large for the task payload
 * - Cache tool call results within a session to avoid re-fetching
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger.js';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_ENTRY_SIZE = 1_000_000; // 1 MB per entry
const MAX_ENTRIES_PER_SESSION = 200;

export interface ScratchpadEntry {
  key: string;
  value: unknown;
  sessionId: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
}

interface SessionStore {
  entries: Map<string, ScratchpadEntry>;
  lastAccess: number;
}

// In-memory store: sessionId → { key → entry }
const sessions = new Map<string, SessionStore>();

// ── TTL eviction ──────────────────────────────────────────────────────────────

function evictStale(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [sessionId, store] of sessions) {
    if (store.lastAccess < cutoff) {
      sessions.delete(sessionId);
      logger.debug({ sessionId }, '[scratchpad] Evicted stale session');
    }
  }
}

setInterval(evictStale, 10 * 60 * 1000).unref(); // sweep every 10 min

function getOrCreateSession(sessionId: string): SessionStore {
  let store = sessions.get(sessionId);
  if (!store) {
    store = { entries: new Map(), lastAccess: Date.now() };
    sessions.set(sessionId, store);
    // Try to load from disk if available
    loadFromDisk(sessionId, store).catch(() => {});
  }
  store.lastAccess = Date.now();
  return store;
}

// ── Disk persistence (best-effort) ───────────────────────────────────────────

function sessionDir(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return path.join(DATA_DIR, 'lance', safe);
}

async function loadFromDisk(sessionId: string, store: SessionStore): Promise<void> {
  const file = path.join(sessionDir(sessionId), 'scratchpad.json');
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const entries: ScratchpadEntry[] = JSON.parse(raw);
    for (const e of entries) store.entries.set(e.key, e);
    logger.debug({ sessionId, count: entries.length }, '[scratchpad] Loaded from disk');
  } catch {
    // No file yet — that's fine
  }
}

function persistToDisk(sessionId: string, store: SessionStore): void {
  const dir = sessionDir(sessionId);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const entries = [...store.entries.values()];
    fs.writeFileSync(path.join(dir, 'scratchpad.json'), JSON.stringify(entries), 'utf-8');
  } catch (err) {
    logger.warn({ err, sessionId }, '[scratchpad] Disk persist failed');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Write a key/value pair to the scratchpad. */
export function scratchpadSet(params: {
  sessionId: string;
  agentId: string;
  key: string;
  value: unknown;
}): ScratchpadEntry {
  const { sessionId, agentId, key, value } = params;

  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_ENTRY_SIZE) {
    throw new Error(`Entry too large: ${serialized.length} bytes (max ${MAX_ENTRY_SIZE})`);
  }

  const store = getOrCreateSession(sessionId);

  if (!store.entries.has(key) && store.entries.size >= MAX_ENTRIES_PER_SESSION) {
    throw new Error(`Session scratchpad full (max ${MAX_ENTRIES_PER_SESSION} entries)`);
  }

  const now = new Date().toISOString();
  const existing = store.entries.get(key);
  const entry: ScratchpadEntry = {
    key,
    value,
    sessionId,
    agentId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  store.entries.set(key, entry);
  persistToDisk(sessionId, store);
  return entry;
}

/** Read a key from the scratchpad. Returns undefined if not found. */
export function scratchpadGet(params: {
  sessionId: string;
  key: string;
}): ScratchpadEntry | undefined {
  const store = getOrCreateSession(params.sessionId);
  return store.entries.get(params.key);
}

/** List all keys in a session scratchpad. */
export function scratchpadList(params: {
  sessionId: string;
}): ScratchpadEntry[] {
  const store = getOrCreateSession(params.sessionId);
  return [...store.entries.values()];
}

/** Delete a key. Returns true if it existed. */
export function scratchpadDelete(params: {
  sessionId: string;
  key: string;
}): boolean {
  const store = getOrCreateSession(params.sessionId);
  const existed = store.entries.delete(params.key);
  if (existed) persistToDisk(params.sessionId, store);
  return existed;
}

/** Clear all keys for a session (call when session ends). */
export function scratchpadClear(sessionId: string): void {
  sessions.delete(sessionId);
  const dir = sessionDir(sessionId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
  logger.debug({ sessionId }, '[scratchpad] Cleared session');
}

/** Snapshot stats for health/debug endpoints. */
export function scratchpadStats(): { sessions: number; totalEntries: number } {
  let totalEntries = 0;
  for (const s of sessions.values()) totalEntries += s.entries.size;
  return { sessions: sessions.size, totalEntries };
}
