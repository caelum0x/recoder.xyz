/**
 * @module mem0-client
 *
 * Fail-safe wrapper over mem0 (`mem0ai`) for intelligent agent memory — the
 * "agent memory" pillar. mem0 adds an LLM layer over a vector store that
 * extracts durable facts from a conversation, dedupes them, and updates
 * existing memories instead of blindly appending.
 *
 * Two modes, auto-selected (mem0 is open source, so self-hosting needs no SaaS):
 *  - **OSS (default when self-hostable):** runs locally against the Qdrant the
 *    platform already operates, with an OpenAI-compatible LLM/embedder
 *    (OpenAI, OpenRouter, or local Ollama). No MEM0_API_KEY required.
 *  - **Platform:** managed mem0 via `MEM0_API_KEY` (used if that key is set).
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

interface ProviderBlock {
  provider: string;
  config: Record<string, unknown>;
}

/** Resolve an OSS LLM provider from available self-hosted/BYO config. */
function resolveOssLlm(): ProviderBlock | null {
  const override = process.env.MEM0_LLM_PROVIDER;
  if ((override === 'ollama') || (!override && process.env.OLLAMA_BASE_URL && !process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY)) {
    return { provider: 'ollama', config: { baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434', model: process.env.MEM0_LLM_MODEL || 'llama3.1' } };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', config: { apiKey: process.env.OPENAI_API_KEY, model: process.env.MEM0_LLM_MODEL || 'gpt-4o-mini' } };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: 'openai', config: { apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1', model: process.env.MEM0_LLM_MODEL || 'openai/gpt-4o-mini' } };
  }
  return null;
}

/** Resolve an OSS embedder. Note: OpenRouter has no embeddings API, so embeddings need OpenAI or Ollama. */
function resolveOssEmbedder(): ProviderBlock | null {
  const override = process.env.MEM0_EMBEDDER_PROVIDER;
  if (override === 'ollama' || (!override && process.env.OLLAMA_BASE_URL && !process.env.OPENAI_API_KEY)) {
    return { provider: 'ollama', config: { baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434', model: process.env.MEM0_EMBED_MODEL || 'nomic-embed-text' } };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', config: { apiKey: process.env.OPENAI_API_KEY, model: process.env.MEM0_EMBED_MODEL || 'text-embedding-3-small' } };
  }
  return null;
}

function resolveMode(): Mem0Mode {
  if (process.env.MEM0_API_KEY) return 'platform';
  if (resolveOssLlm() && resolveOssEmbedder()) return 'oss';
  return 'none';
}

function buildOssConfig(llm: ProviderBlock, embedder: ProviderBlock): Record<string, unknown> {
  return {
    vectorStore: { provider: 'qdrant', config: { url: QDRANT_URL, collectionName: MEM0_COLLECTION } },
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
        const mod = await dynamicImport('mem0ai');
        const MemoryClient = mod.default || mod.MemoryClient;
        if (!MemoryClient) throw new Error('MemoryClient export missing');
        return { mode, client: new MemoryClient({ apiKey: process.env.MEM0_API_KEY }) };
      }
      // OSS mode
      const mod = await dynamicImport('mem0ai/oss');
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

/** Map our scope to the option casing each mode expects (platform: snake_case, oss: camelCase). */
function scopeToOptions(mode: Mem0Mode, scope: Mem0Scope): Record<string, unknown> {
  if (mode === 'platform') {
    const o: Record<string, unknown> = { user_id: scope.userId };
    if (scope.agentId) o.agent_id = scope.agentId;
    if (scope.runId) o.run_id = scope.runId;
    if (scope.metadata) o.metadata = scope.metadata;
    return o;
  }
  const o: Record<string, unknown> = { userId: scope.userId };
  if (scope.agentId) o.agentId = scope.agentId;
  if (scope.runId) o.runId = scope.runId;
  if (scope.metadata) o.metadata = scope.metadata;
  return o;
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
    return { available: false, mode, reason: 'mem0 client init failed (is mem0ai installed?)' };
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
  return { available: true, mode };
}

export async function mem0Add(
  messages: Mem0Message[],
  scope: Mem0Scope,
): Promise<{ available: boolean; reason?: string; memories?: Mem0MemoryRecord[] }> {
  const resolved = await getClient();
  if (!resolved) return { available: false, reason: (await mem0Health()).reason };
  try {
    const result = await resolved.client.add(messages, scopeToOptions(resolved.mode, scope));
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
    const options = { ...scopeToOptions(resolved.mode, scope), ...(resolved.mode === 'oss' ? { topK: limit } : { limit }) };
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
    const response = await resolved.client.getAll(scopeToOptions(resolved.mode, scope));
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
