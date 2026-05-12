"use strict";
/**
 * Agent Memory Store — Qdrant-backed persistent memory for A2A agents.
 *
 * Provides semantic memory that survives process restarts and is searchable
 * across sessions. Each user gets their own Qdrant collection.
 *
 * Embedding model: text-embedding-ada-002 via OpenRouter (1536 dims).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rememberEntry = rememberEntry;
exports.recallEntries = recallEntries;
exports.forgetEntry = forgetEntry;
exports.getRecentContext = getRecentContext;
const node_crypto_1 = __importDefault(require("node:crypto"));
const logger_js_1 = require("../logger.js");
const byok_js_1 = require("./byok.js");
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const EMBED_MODEL = 'openai/text-embedding-ada-002';
const VECTOR_SIZE = 1536;
// ── Qdrant REST helpers ──────────────────────────────────────────────────────
async function qdrantRequest(method, path, body) {
    const res = await fetch(`${QDRANT_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Qdrant ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json();
}
async function ensureCollection(collectionName) {
    try {
        await qdrantRequest('GET', `/collections/${collectionName}`);
    }
    catch {
        // Collection doesn't exist — create it with scalar quantization
        await qdrantRequest('PUT', `/collections/${collectionName}`, {
            vectors: {
                size: VECTOR_SIZE,
                distance: 'Cosine',
            },
            quantization_config: {
                scalar: {
                    type: 'int8',
                    always_ram: true,
                },
            },
        });
        logger_js_1.logger.info({ collectionName }, '[memory] Created Qdrant collection');
    }
}
function collectionFor(userId) {
    // Sanitize userId for use as collection name
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    return `agent-memory-${safe}`;
}
// ── Embedding ────────────────────────────────────────────────────────────────
async function embed(text, userId) {
    const openRouterKey = await (0, byok_js_1.getOpenRouterByokKey)(userId);
    if (!openRouterKey) {
        throw new Error('No BYOK OpenRouter key available — cannot embed memory');
    }
    const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openRouterKey}`,
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: text }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Embed API error ${res.status}: ${text}`);
    }
    const data = (await res.json());
    return data.data[0].embedding;
}
// ── Public API ───────────────────────────────────────────────────────────────
async function rememberEntry(params) {
    const { content, type, tags, agentId, userId } = params;
    const id = node_crypto_1.default.randomUUID();
    const createdAt = new Date().toISOString();
    const vector = await embed(content, userId);
    const collection = collectionFor(userId);
    await ensureCollection(collection);
    await qdrantRequest('PUT', `/collections/${collection}/points`, {
        points: [
            {
                id,
                vector,
                payload: { content, type, tags, agentId, userId, createdAt },
            },
        ],
    });
    logger_js_1.logger.debug({ id, type, agentId }, '[memory] Stored memory entry');
    return { id, content, type, tags, agentId, userId, createdAt };
}
async function recallEntries(params) {
    const { query, userId, limit = 10, type } = params;
    const collection = collectionFor(userId);
    try {
        await qdrantRequest('GET', `/collections/${collection}`);
    }
    catch {
        return []; // Collection doesn't exist yet
    }
    const vector = await embed(query, userId);
    const filter = type
        ? { must: [{ key: 'type', match: { value: type } }] }
        : undefined;
    const result = (await qdrantRequest('POST', `/collections/${collection}/points/search`, {
        vector,
        limit,
        with_payload: true,
        score_threshold: 0.5,
        ...(filter ? { filter } : {}),
    }));
    return result.result.map((r) => ({
        id: r.id,
        content: r.payload.content,
        type: r.payload.type,
        tags: r.payload.tags ?? [],
        agentId: r.payload.agentId,
        userId: r.payload.userId,
        createdAt: r.payload.createdAt,
        score: r.score,
    }));
}
async function forgetEntry(params) {
    const { id, userId } = params;
    const collection = collectionFor(userId);
    try {
        await qdrantRequest('POST', `/collections/${collection}/points/delete`, {
            points: [id],
        });
        logger_js_1.logger.debug({ id }, '[memory] Deleted memory entry');
        return true;
    }
    catch (err) {
        logger_js_1.logger.warn({ err, id }, '[memory] Failed to delete memory entry');
        return false;
    }
}
/**
 * Fetch the most recent memories for a user to inject as agent context.
 * Called by the bridge when sending a task payload to an agent.
 */
async function getRecentContext(params) {
    try {
        return await recallEntries({ ...params, limit: params.limit ?? 10 });
    }
    catch (err) {
        logger_js_1.logger.warn({ err }, '[memory] getRecentContext failed — skipping context injection');
        return [];
    }
}
