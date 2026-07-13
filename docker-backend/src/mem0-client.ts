/**
 * @module mem0-client
 *
 * Fail-safe wrapper over Recoder-owned mem0 (`@recoder/mem0`) for intelligent agent memory — the
 * "agent memory" pillar. mem0 adds an LLM layer over a vector store that
 * extracts durable facts from a conversation, dedupes them, and updates
 * existing memories instead of blindly appending.
 *
 * Two modes, auto-selected (mem0 is open source, so self-hosting needs no SaaS):
 *  - **OSS (default when self-hostable):** runs locally against the Qdrant the
 *    platform already operates, with an OpenAI-compatible LLM/embedder
 *    (OpenAI, OpenRouter, or local Ollama). No MEM0_API_KEY required.
 *  - **Platform:** managed mem0 via `MEM0_API_KEY` (used if that key is set). The
 *    base URL is `MEM0_BASE_URL` when set, so the SAME platform client can be
 *    pointed at a self-hosted `py/mem0` FastAPI server (`/memories`, `/search`,
 *    …) instead of `https://api.mem0.ai`. Absent → the SaaS default.
 *
 * Fail-safe: if neither mode can be configured, calls report a truthful
 * unavailable status and recall returns empty — it never fabricates memories.
 */

import { createLogger } from './logger';

const logger = createLogger('mem0-client');

const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

export type Mem0Mode = 'platform' | 'oss' | 'none';

export interface Mem0Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Mem0Health {
  available: boolean;
  mode: Mem0Mode;
  vectorStore?: string;
  llmProvider?: string;
  embedderProvider?: string;
  reason?: string;
}

export interface Mem0Scope {
  userId: string;
  agentId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
}

export interface Mem0MemoryRecord {
  id: string;
  memory: string;
  [key: string]: unknown;
}

// ── Mode + OSS config resolution ────────────────────────────────────────────

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const MEM0_COLLECTION = process.env.MEM0_COLLECTION || 'recoder_mem0';

/**
 * Optional base URL for the platform mem0 client. When set, the `@recoder/mem0`
 * `MemoryClient` is pointed here (its `host`) instead of the SaaS default, so the
 * backend genuinely connects to a self-hosted `py/mem0` server. Trimmed; empty →
 * undefined (the client falls back to `https://api.mem0.ai`).
 */
export function mem0BaseUrl(): string | undefined {
  return process.env.MEM0_BASE_URL?.trim() || undefined;
}

export interface ProviderBlock {
  provider: string;
  config: Record<string, unknown>;
}

function googleKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

/**
 * Resolve an OSS LLM provider from available BYO/self-hosted config. Cloud-first
 * (OpenAI / OpenRouter / Google) so it runs on servers without local inference;
 * Ollama only when explicitly chosen or it's the only thing configured.
 */
function resolveOssLlm(): ProviderBlock | null {
  const override = process.env.MEM0_LLM_PROVIDER;
  const google = googleKey();
  const noCloud = !process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY && !google;

  if (override === 'ollama' || (!override && process.env.OLLAMA_BASE_URL && noCloud)) {
    return { provider: 'ollama', config: { baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434', model: process.env.MEM0_LLM_MODEL || 'llama3.1' } };
  }
  if (override === 'google' || (!override && google && !process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY)) {
    if (google) return { provider: 'google', config: { apiKey: google, model: process.env.MEM0_LLM_MODEL || 'gemini-2.0-flash' } };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', config: { apiKey: process.env.OPENAI_API_KEY, model: process.env.MEM0_LLM_MODEL || 'gpt-4o-mini' } };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: 'openai', config: { apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1', model: process.env.MEM0_LLM_MODEL || 'openai/gpt-4o-mini' } };
  }
  if (google) {
    return { provider: 'google', config: { apiKey: google, model: process.env.MEM0_LLM_MODEL || 'gemini-2.0-flash' } };
  }
  return null;
}

/**
 * Resolve an OSS embedder. OpenRouter has NO embeddings API, so embeddings come
 * from OpenAI, Google/Gemini, or Ollama — letting servers use a cloud key.
 */
function resolveOssEmbedder(): ProviderBlock | null {
  const override = process.env.MEM0_EMBEDDER_PROVIDER;
  const google = googleKey();

  if (override === 'ollama' || (!override && process.env.OLLAMA_BASE_URL && !process.env.OPENAI_API_KEY && !google)) {
    return { provider: 'ollama', config: { baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434', model: process.env.MEM0_EMBED_MODEL || 'nomic-embed-text' } };
  }
  if (override === 'google' || (!override && google && !process.env.OPENAI_API_KEY)) {
    if (google) return { provider: 'google', config: { apiKey: google, model: process.env.MEM0_EMBED_MODEL || 'gemini-embedding-001' } };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', config: { apiKey: process.env.OPENAI_API_KEY, model: process.env.MEM0_EMBED_MODEL || 'text-embedding-3-small' } };
  }
  if (google) {
    return { provider: 'google', config: { apiKey: google, model: process.env.MEM0_EMBED_MODEL || 'gemini-embedding-001' } };
  }
  return null;
}

function resolveMode(): Mem0Mode {
  if (process.env.MEM0_API_KEY) return 'platform';
  if (resolveOssLlm() && resolveOssEmbedder()) return 'oss';
  return 'none';
}

/**
 * Output dimensions for the embedding models this client configures. Used to set
 * an EXPLICIT vector-store dimension so `@recoder/mem0` OSS skips its network
 * "dimension probe" on init. Without this, OSS init throws
 * "Failed to auto-detect embedding dimension ... (401)" when the embedder key is
 * absent/invalid, and the failure surfaces on every memory call. By pinning a
 * known dimension we let the store be created and let real auth errors degrade
 * per-call instead of poisoning init.
 */
const KNOWN_EMBED_DIMS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'gemini-embedding-001': 3072,
  'text-embedding-004': 768,
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
};

/**
 * Resolve an explicit embedding dimension. Prefers an operator override
 * (`MEM0_EMBED_DIMS`), then a known dimension for the configured model. Returns
 * undefined only when the model is unknown and no override is set, in which case
 * the OSS library falls back to its own (probe-based) auto-detection.
 */
export function resolveEmbedDimension(embedder: ProviderBlock): number | undefined {
  const override = process.env.MEM0_EMBED_DIMS;
  if (override) {
    const parsed = Number.parseInt(override, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  const model = embedder.config.model;
  if (typeof model === 'string' && KNOWN_EMBED_DIMS[model]) {
    return KNOWN_EMBED_DIMS[model];
  }
  return undefined;
}

function buildOssConfig(llm: ProviderBlock, embedder: ProviderBlock): Record<string, unknown> {
  const dimension = resolveEmbedDimension(embedder);
  const vectorConfig: Record<string, unknown> = { url: QDRANT_URL, collectionName: MEM0_COLLECTION };
  if (dimension) vectorConfig.dimension = dimension;
  return {
    vectorStore: { provider: 'qdrant', config: vectorConfig },
    llm,
    embedder,
  };
}

// ── Client cache ─────────────────────────────────────────────────────────────

interface ResolvedClient {
  mode: Mem0Mode;
  client: any;
}

let cached: Promise<ResolvedClient | null> | null = null;

async function getClient(): Promise<ResolvedClient | null> {
  if (cached) return cached;
  const mode = resolveMode();
  if (mode === 'none') return null;

  cached = (async () => {
    try {
      if (mode === 'platform') {
        const mod = await dynamicImport('@recoder/mem0');
        const MemoryClient = mod.default || mod.MemoryClient;
        if (!MemoryClient) throw new Error('MemoryClient export missing');
        const host = mem0BaseUrl();
        // `host` points the platform client at a self-hosted py/mem0 server when
        // MEM0_BASE_URL is set; omitted → the client's SaaS default.
        return {
          mode,
          client: new MemoryClient({ apiKey: process.env.MEM0_API_KEY, ...(host ? { host } : {}) }),
        };
      }
      // OSS mode
      const mod = await dynamicImport('@recoder/mem0/oss');
      const Memory = mod.Memory || mod.default;
      if (!Memory) throw new Error('OSS Memory export missing');
      const config = buildOssConfig(resolveOssLlm()!, resolveOssEmbedder()!);
      return { mode, client: new Memory(config) };
    } catch (err) {
      logger.warn({ err, mode }, 'mem0 client init failed; memory disabled');
      return null;
    }
  })();
  return cached;
}

/**
 * Map our scope to options for `add()`. Both modes of the owned `@recoder/mem0`
 * take entity identity as TOP-LEVEL camelCase params on add (`userId`/`agentId`/
 * `runId`), with `metadata` alongside. (mem0 OSS `AddMemoryOptions` and the
 * platform client `EntityOptions` both use this shape.)
 */
export function scopeToAddOptions(scope: Mem0Scope): Record<string, unknown> {
  const o: Record<string, unknown> = { userId: scope.userId };
  if (scope.agentId) o.agentId = scope.agentId;
  if (scope.runId) o.runId = scope.runId;
  if (scope.metadata) o.metadata = scope.metadata;
  return o;
}

/**
 * Map our scope to a `filters` block for `search()` / `getAll()`. The owned
 * `@recoder/mem0` (both OSS and platform) now REJECTS top-level entity params on
 * these methods and requires them under `filters` using snake_case keys
 * (`user_id`/`agent_id`/`run_id`) — see `rejectTopLevelEntityParams` and the
 * `SearchFilters` contract in `@recoder/mem0`. Passing them top-level throws
 * "Top-level entity parameters [...] are not supported in search()."
 */
export function scopeToFilters(scope: Mem0Scope): Record<string, unknown> {
  const filters: Record<string, unknown> = { user_id: scope.userId };
  if (scope.agentId) filters.agent_id = scope.agentId;
  if (scope.runId) filters.run_id = scope.runId;
  return filters;
}

/** Exact options object passed to `client.search(query, ...)` — `filters` + `topK`. */
export function buildSearchOptions(scope: Mem0Scope, limit: number): Record<string, unknown> {
  return { filters: scopeToFilters(scope), topK: limit };
}

/** Exact options object passed to `client.getAll(...)` — `filters` only. */
export function buildGetAllOptions(scope: Mem0Scope): Record<string, unknown> {
  return { filters: scopeToFilters(scope) };
}

function extractResults(response: any): Mem0MemoryRecord[] {
  if (Array.isArray(response?.results)) return response.results;
  if (Array.isArray(response)) return response;
  return [];
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function mem0Health(): Promise<Mem0Health> {
  const mode = resolveMode();
  if (mode === 'none') {
    return {
      available: false,
      mode,
      reason: 'No MEM0_API_KEY and no self-hostable LLM+embedder (set OPENAI_API_KEY, OPENROUTER_API_KEY, or OLLAMA_BASE_URL)',
    };
  }
  const resolved = await getClient();
  if (!resolved) {
    return { available: false, mode, reason: 'mem0 client init failed (is @recoder/mem0 built?)' };
  }
  if (mode === 'oss') {
    return {
      available: true,
      mode,
      vectorStore: `qdrant:${QDRANT_URL}`,
      llmProvider: resolveOssLlm()?.provider,
      embedderProvider: resolveOssEmbedder()?.provider,
    };
  }
  // Platform mode: report the resolved base URL so an operator can see whether
  // we're pointed at the SaaS default or a self-hosted py/mem0 server.
  return { available: true, mode, vectorStore: mem0BaseUrl() ?? 'https://api.mem0.ai' };
}

export async function mem0Add(
  messages: Mem0Message[],
  scope: Mem0Scope,
): Promise<{ available: boolean; reason?: string; memories?: Mem0MemoryRecord[] }> {
  const resolved = await getClient();
  if (!resolved) return { available: false, reason: (await mem0Health()).reason };
  try {
    const result = await resolved.client.add(messages, scopeToAddOptions(scope));
    return { available: true, memories: extractResults(result) };
  } catch (err) {
    logger.error({ err, userId: scope.userId }, 'mem0 add failed');
    return { available: true, reason: err instanceof Error ? err.message : 'mem0 add failed' };
  }
}

export async function mem0Search(
  query: string,
  scope: Mem0Scope,
  limit = 10,
): Promise<{ available: boolean; reason?: string; results: Mem0MemoryRecord[] }> {
  const resolved = await getClient();
  if (!resolved) return { available: false, reason: (await mem0Health()).reason, results: [] };
  try {
    const options = buildSearchOptions(scope, limit);
    const response = await resolved.client.search(query, options);
    return { available: true, results: extractResults(response) };
  } catch (err) {
    logger.error({ err, userId: scope.userId }, 'mem0 search failed');
    return { available: true, reason: err instanceof Error ? err.message : 'mem0 search failed', results: [] };
  }
}

export async function mem0GetAll(
  scope: Mem0Scope,
): Promise<{ available: boolean; reason?: string; results: Mem0MemoryRecord[] }> {
  const resolved = await getClient();
  if (!resolved) return { available: false, reason: (await mem0Health()).reason, results: [] };
  try {
    const response = await resolved.client.getAll(buildGetAllOptions(scope));
    return { available: true, results: extractResults(response) };
  } catch (err) {
    logger.error({ err, userId: scope.userId }, 'mem0 getAll failed');
    return { available: true, reason: err instanceof Error ? err.message : 'mem0 getAll failed', results: [] };
  }
}

export async function mem0Delete(memoryId: string): Promise<{ available: boolean; deleted: boolean; reason?: string }> {
  const resolved = await getClient();
  if (!resolved) return { available: false, deleted: false, reason: (await mem0Health()).reason };
  try {
    await resolved.client.delete(memoryId);
    return { available: true, deleted: true };
  } catch (err) {
    logger.error({ err, memoryId }, 'mem0 delete failed');
    return { available: true, deleted: false, reason: err instanceof Error ? err.message : 'mem0 delete failed' };
  }
}
