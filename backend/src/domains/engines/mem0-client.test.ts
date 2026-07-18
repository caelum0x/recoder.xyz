/**
 * Provider-resolution + degrade tests for the in-proc mem0 client — the PRIMARY
 * memory truth the packaged desktop runs (add / search / embeddings / health).
 *
 * Owner decision: mem0 DEFAULTS to Google/Gemini for BOTH the LLM and the
 * embedder when `MEM0_LLM_PROVIDER` / `MEM0_EMBEDDER_PROVIDER` are unset — one
 * `GEMINI_API_KEY` powers both. Explicit overrides still win, and with no usable
 * key mem0 degrades truthfully to `down` (never a faked provider / never faked
 * up). No vector store, no `@recoder/mem0` package, and no network are touched:
 * the resolvers and the `none`-mode health path are pure over `process.env`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MEM0_PROVIDER,
  mem0Health,
  resolveOssEmbedder,
  resolveOssLlm,
} from './mem0-client.js';

const PROVIDER_ENV_KEYS = [
  'MEM0_API_KEY',
  'MEM0_LLM_PROVIDER',
  'MEM0_EMBEDDER_PROVIDER',
  'MEM0_LLM_MODEL',
  'MEM0_EMBED_MODEL',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'OLLAMA_BASE_URL',
] as const;

describe('mem0-client provider resolution', () => {
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = {};
    for (const key of PROVIDER_ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults to 'google' for the default provider constant", () => {
    expect(DEFAULT_MEM0_PROVIDER).toBe('google');
  });

  it('resolves google for BOTH LLM + embedder when the provider is unset (owner default)', () => {
    process.env.GEMINI_API_KEY = 'gm-test-key';

    const llm = resolveOssLlm();
    const embedder = resolveOssEmbedder();

    expect(llm?.provider).toBe('google');
    expect(llm?.config.apiKey).toBe('gm-test-key');
    expect(embedder?.provider).toBe('google');
    expect(embedder?.config.apiKey).toBe('gm-test-key');
  });

  it('honors GOOGLE_API_KEY as the google credential when GEMINI_API_KEY is absent', () => {
    process.env.GOOGLE_API_KEY = 'goog-test-key';

    expect(resolveOssLlm()?.provider).toBe('google');
    expect(resolveOssEmbedder()?.provider).toBe('google');
  });

  it('prefers google over openai when the provider is UNSET, even with both keys present', () => {
    process.env.GEMINI_API_KEY = 'gm-test-key';
    process.env.OPENAI_API_KEY = 'sk-openai';

    expect(resolveOssLlm()?.provider).toBe('google');
    expect(resolveOssEmbedder()?.provider).toBe('google');
  });

  it('lets an explicit MEM0_LLM_PROVIDER=openai override the google default', () => {
    process.env.MEM0_LLM_PROVIDER = 'openai';
    process.env.GEMINI_API_KEY = 'gm-test-key';
    process.env.OPENAI_API_KEY = 'sk-openai';

    const llm = resolveOssLlm();
    expect(llm?.provider).toBe('openai');
    expect(llm?.config.apiKey).toBe('sk-openai');
  });

  it('falls through to an available cloud key when google is the default but no gemini key is set', () => {
    process.env.OPENAI_API_KEY = 'sk-openai';

    expect(resolveOssLlm()?.provider).toBe('openai');
    expect(resolveOssEmbedder()?.provider).toBe('openai');
  });

  it('resolves null (no provider) when no usable key is configured', () => {
    expect(resolveOssLlm()).toBeNull();
    expect(resolveOssEmbedder()).toBeNull();
  });

  it("degrades truthfully to down with a GEMINI_API_KEY reason when no key is present", async () => {
    const health = await mem0Health();

    expect(health.available).toBe(false);
    expect(health.mode).toBe('none');
    expect(health.reason).toContain('GEMINI_API_KEY');
  });
});
