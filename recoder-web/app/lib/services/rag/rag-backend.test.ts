import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('rag-backend adapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('isVectorModeAvailable returns false when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.OPENAI_API_KEY;
    const { isVectorModeAvailable } = await import('./rag-backend');
    expect(isVectorModeAvailable()).toBe(false);
  });

  it('isVectorModeAvailable returns false when embedder key is missing', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const { isVectorModeAvailable } = await import('./rag-backend');
    expect(isVectorModeAvailable()).toBe(false);
  });

  it('isVectorModeAvailable returns true when DATABASE_URL and OPENAI_API_KEY are set', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const { isVectorModeAvailable } = await import('./rag-backend');
    expect(isVectorModeAvailable()).toBe(true);
  });

  it('respects RAG_EMBEDDING_PROFILE env var for Google profile', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'AItest';
    process.env.RAG_EMBEDDING_PROFILE = 'google-gemini-embedding-001';
    delete process.env.OPENAI_API_KEY;
    const { isVectorModeAvailable } = await import('./rag-backend');
    expect(isVectorModeAvailable()).toBe(true);
  });

  it('ingestDocuments throws when DATABASE_URL is not set', async () => {
    delete process.env.DATABASE_URL;
    const { ingestDocuments } = await import('./rag-backend');
    await expect(
      ingestDocuments('proj1', [{ id: 'd1', content: 'hello' }]),
    ).rejects.toThrow('DATABASE_URL not set');
  });

  it('queryRag throws when embedder key is missing', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    delete process.env.OPENAI_API_KEY;
    const { queryRag } = await import('./rag-backend');
    await expect(queryRag('proj1', 'hello')).rejects.toThrow('No embedding API key');
  });
});
