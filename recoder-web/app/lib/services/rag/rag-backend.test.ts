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
    const { isVectorModeAvailable } = await import('./rag-backend');
    expect(isVectorModeAvailable('sk-test-key')).toBe(false);
  });

  it('isVectorModeAvailable returns false when embedder key is missing', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    const { isVectorModeAvailable } = await import('./rag-backend');
    expect(isVectorModeAvailable()).toBe(false);
  });

  it('isVectorModeAvailable returns true when DATABASE_URL and a BYOK key are set', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    const { isVectorModeAvailable } = await import('./rag-backend');
    expect(isVectorModeAvailable('sk-test-key')).toBe(true);
  });

  it('exposes the configured embedding provider', async () => {
    process.env.RAG_EMBEDDING_PROFILE = 'google-gemini-embedding-001';
    const { getVectorProvider } = await import('./rag-backend');
    expect(getVectorProvider()).toBe('google');
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
    const { queryRag } = await import('./rag-backend');
    await expect(queryRag('proj1', 'hello')).rejects.toThrow('No embedding API key');
  });
});
