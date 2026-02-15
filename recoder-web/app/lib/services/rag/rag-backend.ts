/**
 * RAG Backend Adapter
 *
 * Thin adapter over the production RAG service layer (Postgres/pgvector + embedders).
 * When DATABASE_URL and an embedder API key are available, uses vector search.
 * Otherwise callers fall back to the existing lexical path.
 */

import type { EmbeddingProfileId } from './types';
import { EMBEDDING_PROFILES } from './types';
import { PoolManager, type NeonClient } from './database';
import { createPostgresChunkStore } from './chunk-store';
import { createPostgresQueryService } from './query-service';
import { createEmbedderFromProfile, getApiKeyForProfile } from './embedder';
import { createDefaultChunker } from './line-chunker';
import * as z from 'zod/v4';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RAG_TABLE = 'rag_chunks';

const DEFAULT_PROFILE_ID: EmbeddingProfileId = 'openai-text-embedding-3-small';

function getProfileId(): EmbeddingProfileId {
  const envProfile = process.env.RAG_EMBEDDING_PROFILE;
  if (envProfile && envProfile in EMBEDDING_PROFILES) {
    return envProfile as EmbeddingProfileId;
  }
  return DEFAULT_PROFILE_ID;
}

function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

function getEmbedderApiKey(profileId: EmbeddingProfileId): string | undefined {
  const profile = EMBEDDING_PROFILES[profileId];
  if (!profile) return undefined;
  return getApiKeyForProfile(profile);
}

// ---------------------------------------------------------------------------
// Metadata schema shared by chunk-store and query-service
// ---------------------------------------------------------------------------

const ragMetadataSchema = z.object({
  version: z.string().optional(),
  documentId: z.string().optional(),
  source: z.string().optional(),
});

type RagMetadata = z.infer<typeof ragMetadataSchema>;

// ---------------------------------------------------------------------------
// Schema setup (one-time per process)
// ---------------------------------------------------------------------------

let schemaReady = false;

async function ensureSchema(client: NeonClient): Promise<void> {
  if (schemaReady) return;

  const profileId = getProfileId();
  const profile = EMBEDDING_PROFILES[profileId];
  const dims = profile.dimensions;

  await client.query(`CREATE EXTENSION IF NOT EXISTS vector`, []);
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${RAG_TABLE} (
       id            BIGSERIAL PRIMARY KEY,
       project_id    TEXT NOT NULL,
       document_key  TEXT NOT NULL,
       chunk_content TEXT NOT NULL,
       chunk_index   INT  NOT NULL,
       version       TEXT,
       document_id   TEXT,
       source        TEXT,
       embedding     vector(${dims}),
       embedding_profile_id INT,
       embedding_dimensions INT,
       created_at    TIMESTAMPTZ DEFAULT now()
     )`,
    [],
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_rag_chunks_project ON ${RAG_TABLE} (project_id)`,
    [],
  );

  schemaReady = true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true when both a DATABASE_URL and an embedding API key are available.
 */
export function isVectorModeAvailable(): boolean {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) return false;
  const profileId = getProfileId();
  const apiKey = getEmbedderApiKey(profileId);
  return Boolean(apiKey);
}

export interface IngestDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IngestStats {
  documents: number;
  chunksAdded: number;
}

/**
 * Ingest documents into the vector store for a given project.
 * Throws if vector mode is not available.
 */
export async function ingestDocuments(
  projectId: string,
  documents: IngestDocument[],
  replace?: boolean,
): Promise<IngestStats> {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const profileId = getProfileId();
  const apiKey = getEmbedderApiKey(profileId);
  if (!apiKey) throw new Error('No embedding API key available');

  const client = PoolManager.getConnection({ connectionString: dbUrl });
  await ensureSchema(client);

  const embedder = createEmbedderFromProfile(profileId, apiKey);
  const chunker = createDefaultChunker();

  if (replace) {
    // Delete existing chunks for this project
    await client.query(`DELETE FROM ${RAG_TABLE} WHERE project_id = $1`, [projectId]);
  }

  let totalChunks = 0;

  for (const doc of documents) {
    const docKey = doc.id;
    const chunks = chunker(doc.content);
    if (chunks.length === 0) continue;

    // Embed all chunks
    const embeddings = await embedder.embedMany(chunks);

    const profile = EMBEDDING_PROFILES[profileId];
    const profileNumericId = Object.keys(EMBEDDING_PROFILES).indexOf(profileId);

    // Insert into DB in a single batch
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO ${RAG_TABLE}
           (project_id, document_key, chunk_content, chunk_index, version, document_id, source,
            embedding, embedding_profile_id, embedding_dimensions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          projectId,
          docKey,
          chunks[i],
          i,
          '1',
          doc.id,
          (doc.metadata?.source as string) || null,
          `[${embeddings[i].join(',')}]`,
          profileNumericId,
          profile.dimensions,
        ],
      );
    }

    totalChunks += chunks.length;
  }

  return { documents: documents.length, chunksAdded: totalChunks };
}

export interface RagQueryResult {
  content: string;
  documentId?: string;
  source?: string;
  similarity: number;
  chunkIndex: number;
}

/**
 * Query the vector store for a given project.
 * Returns top-K results ordered by cosine similarity.
 */
export async function queryRag(
  projectId: string,
  query: string,
  topK = 5,
): Promise<RagQueryResult[]> {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const profileId = getProfileId();
  const apiKey = getEmbedderApiKey(profileId);
  if (!apiKey) throw new Error('No embedding API key available');

  const client = PoolManager.getConnection({ connectionString: dbUrl });
  await ensureSchema(client);

  const embedder = createEmbedderFromProfile(profileId, apiKey);
  const queryEmbedding = await embedder.embed(query);

  const profile = EMBEDDING_PROFILES[profileId];
  const dims = profile.dimensions;

  const rows = await client.query<{
    chunk_content: string;
    document_id: string | null;
    source: string | null;
    chunk_index: number;
    similarity: number;
  }>(
    `SELECT
       chunk_content,
       document_id,
       source,
       chunk_index,
       1 - (embedding::vector(${dims}) <=> $1::vector) AS similarity
     FROM ${RAG_TABLE}
     WHERE project_id = $2
     ORDER BY embedding::vector(${dims}) <=> $1::vector
     LIMIT $3`,
    [`[${queryEmbedding.join(',')}]`, projectId, topK],
  );

  return rows.map((row) => ({
    content: row.chunk_content,
    documentId: row.document_id ?? undefined,
    source: row.source ?? undefined,
    similarity: Number(row.similarity),
    chunkIndex: Number(row.chunk_index),
  }));
}

/**
 * Reset schema-ready flag (for testing).
 */
export function _resetSchemaReady(): void {
  schemaReady = false;
}
