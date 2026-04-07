"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scratchpadSet = scratchpadSet;
exports.scratchpadGet = scratchpadGet;
exports.scratchpadList = scratchpadList;
exports.scratchpadDelete = scratchpadDelete;
exports.scratchpadClear = scratchpadClear;
exports.scratchpadStats = scratchpadStats;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const logger_js_1 = require("../logger.js");
const DATA_DIR = process.env.DATA_DIR ?? '/data';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_ENTRY_SIZE = 1_000_000; // 1 MB per entry
const MAX_ENTRIES_PER_SESSION = 200;
// In-memory store: sessionId → { key → entry }
const sessions = new Map();
// ── TTL eviction ──────────────────────────────────────────────────────────────
function evictStale() {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [sessionId, store] of sessions) {
        if (store.lastAccess < cutoff) {
            sessions.delete(sessionId);
            logger_js_1.logger.debug({ sessionId }, '[scratchpad] Evicted stale session');
        }
    }
}
setInterval(evictStale, 10 * 60 * 1000).unref(); // sweep every 10 min
function getOrCreateSession(sessionId) {
    let store = sessions.get(sessionId);
    if (!store) {
        store = { entries: new Map(), lastAccess: Date.now() };
        sessions.set(sessionId, store);
        // Try to load from disk if available
        loadFromDisk(sessionId, store).catch(() => { });
    }
    store.lastAccess = Date.now();
    return store;
}
// ── Disk persistence (best-effort) ───────────────────────────────────────────
function sessionDir(sessionId) {
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    return node_path_1.default.join(DATA_DIR, 'lance', safe);
}
async function loadFromDisk(sessionId, store) {
    const file = node_path_1.default.join(sessionDir(sessionId), 'scratchpad.json');
    try {
        const raw = node_fs_1.default.readFileSync(file, 'utf-8');
        const entries = JSON.parse(raw);
        for (const e of entries)
            store.entries.set(e.key, e);
        logger_js_1.logger.debug({ sessionId, count: entries.length }, '[scratchpad] Loaded from disk');
    }
    catch {
        // No file yet — that's fine
    }
}
function persistToDisk(sessionId, store) {
    const dir = sessionDir(sessionId);
    try {
        node_fs_1.default.mkdirSync(dir, { recursive: true });
        const entries = [...store.entries.values()];
        node_fs_1.default.writeFileSync(node_path_1.default.join(dir, 'scratchpad.json'), JSON.stringify(entries), 'utf-8');
    }
    catch (err) {
        logger_js_1.logger.warn({ err, sessionId }, '[scratchpad] Disk persist failed');
    }
}
// ── Public API ────────────────────────────────────────────────────────────────
/** Write a key/value pair to the scratchpad. */
function scratchpadSet(params) {
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
    const entry = {
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
function scratchpadGet(params) {
    const store = getOrCreateSession(params.sessionId);
    return store.entries.get(params.key);
}
/** List all keys in a session scratchpad. */
function scratchpadList(params) {
    const store = getOrCreateSession(params.sessionId);
    return [...store.entries.values()];
}
/** Delete a key. Returns true if it existed. */
function scratchpadDelete(params) {
    const store = getOrCreateSession(params.sessionId);
    const existed = store.entries.delete(params.key);
    if (existed)
        persistToDisk(params.sessionId, store);
    return existed;
}
/** Clear all keys for a session (call when session ends). */
function scratchpadClear(sessionId) {
    sessions.delete(sessionId);
    const dir = sessionDir(sessionId);
    try {
        node_fs_1.default.rmSync(dir, { recursive: true, force: true });
    }
    catch {
        // Best effort
    }
    logger_js_1.logger.debug({ sessionId }, '[scratchpad] Cleared session');
}
/** Snapshot stats for health/debug endpoints. */
function scratchpadStats() {
    let totalEntries = 0;
    for (const s of sessions.values())
        totalEntries += s.entries.size;
    return { sessions: sessions.size, totalEntries };
}
