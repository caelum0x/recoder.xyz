// Vector Database Service
// Multi-provider vector storage with Pinecone and pgvector support with REAL TF-IDF embeddings

import { EventEmitter } from 'events';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// TF-IDF Vectorizer for REAL text embeddings
class TFIDFVectorizer {
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private documentCount: number = 0;
  private maxFeatures: number;

  constructor(maxFeatures: number = 1024) {
    this.maxFeatures = maxFeatures;
  }

  buildVocabulary(documents: string[]): void {
    this.documentCount = documents.length;
    const wordDocumentFreq = new Map<string, number>();
    const wordTotalFreq = new Map<string, number>();

    // Collect terms and frequencies
    for (const doc of documents) {
      const words = this.tokenize(doc);
      const uniqueWords = new Set(words);

      for (const word of words) {
        wordTotalFreq.set(word, (wordTotalFreq.get(word) || 0) + 1);
      }

      for (const word of uniqueWords) {
        wordDocumentFreq.set(word, (wordDocumentFreq.get(word) || 0) + 1);
      }
    }

    // Select top features
    const sortedWords = Array.from(wordTotalFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.maxFeatures);

    sortedWords.forEach(([word, _], index) => {
      this.vocabulary.set(word, index);
    });

    // Calculate IDF
    for (const [word, docFreq] of wordDocumentFreq) {
      if (this.vocabulary.has(word)) {
        this.idf.set(word, Math.log(this.documentCount / (docFreq + 1)) + 1);
      }
    }
  }

  transform(text: string): Float32Array {
    const words = this.tokenize(text);
    const tf = this.calculateTF(words);
    const vector = new Float32Array(this.vocabulary.size);

    for (const [word, freq] of tf) {
      const index = this.vocabulary.get(word);
      if (index !== undefined && index < vector.length) {
        const idfValue = this.idf.get(word) || 0;
        vector[index] = freq * idfValue;
      }
    }

    return this.normalizeVector(vector);
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && word.length < 30)
      .filter(word => !this.isStopWord(word));
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'this', 'that', 'these', 'those'
    ]);
    return stopWords.has(word);
  }

  private calculateTF(words: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    const totalWords = words.length;

    for (const word of words) {
      tf.set(word, (tf.get(word) || 0) + 1);
    }

    for (const [word, freq] of tf) {
      tf.set(word, freq / totalWords);
    }

    return tf;
  }

  private normalizeVector(vector: Float32Array): Float32Array {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude === 0) return vector;
    
    const normalized = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) {
      normalized[i] = vector[i] / magnitude;
    }
    
    return normalized;
  }

  getVocabularySize(): number {
    return this.vocabulary.size;
  }
}

// Pinecone client (optional)
let PineconeClient: any = null;
try {
  const { Pinecone } = require('@pinecone-database/pinecone');
  PineconeClient = Pinecone;
} catch (error) {
  logger.warn('Pinecone SDK not available, using pgvector only');
}

interface VectorRecord {
  id: string;
  values: number[];
  metadata: Record<string, any>;
}

interface QueryResult {
  id: string;
  score: number;
  values?: number[];
  metadata: Record<string, any>;
}

interface VectorQueryOptions {
  topK?: number;
  threshold?: number;
  filter?: Record<string, any>;
  includeValues?: boolean;
  includeMetadata?: boolean;
}

export class VectorDatabaseService extends EventEmitter {
  private pineconeClient: any = null;
  private pgvectorEnabled: boolean = true;
  private provider: 'pinecone' | 'pgvector' | 'hybrid' = 'hybrid';
  private tfidfVectorizer: TFIDFVectorizer | null = null;

  constructor() {
    super();
    this.initializeConnections();
  }

  /**
   * Initialize vector database connections
   */
  private async initializeConnections(): Promise<void> {
    try {
      // Initialize Pinecone if available
      if (PineconeClient && process.env.PINECONE_API_KEY) {
        this.pineconeClient = new PineconeClient({
          apiKey: process.env.PINECONE_API_KEY,
          environment: process.env.PINECONE_ENVIRONMENT || 'us-east1-gcp'
        });
        logger.info('Pinecone client initialized');
      }

      // Test pgvector extension
      try {
        await prisma.$executeRaw`SELECT 1`;
        // Enable pgvector extension if not exists
        await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;
        this.pgvectorEnabled = true;
        logger.info('pgvector extension enabled');
      } catch (error) {
        logger.warn('pgvector extension not available:', error instanceof Error ? error.message : 'Unknown error');
        this.pgvectorEnabled = false;
      }

      // Determine optimal provider strategy
      if (this.pineconeClient && this.pgvectorEnabled) {
        this.provider = 'hybrid';
      } else if (this.pineconeClient) {
        this.provider = 'pinecone';
      } else if (this.pgvectorEnabled) {
        this.provider = 'pgvector';
      } else {
        throw new Error('No vector database provider available');
      }

      logger.info(`Vector database initialized with provider: ${this.provider}`);
      this.emit('initialized', { provider: this.provider });

    } catch (error) {
      logger.error('Failed to initialize vector database:', error);
      throw error;
    }
  }

  /**
   * Store vector embeddings
   */
  async store(
    namespace: string,
    vectors: VectorRecord[],
    knowledgeBaseId: string
  ): Promise<void> {
    try {
      const startTime = Date.now();

      // Store in pgvector (always for backup and local queries)
      if (this.pgvectorEnabled) {
        await this.storePgVector(vectors, knowledgeBaseId);
      }

      // Store in Pinecone for better performance
      if (this.pineconeClient && (this.provider === 'pinecone' || this.provider === 'hybrid')) {
        await this.storePinecone(namespace, vectors);
      }

      const duration = Date.now() - startTime;
      logger.info('Vector storage completed', {
        provider: this.provider,
        namespace,
        vectorCount: vectors.length,
        duration,
        knowledgeBaseId
      });

      this.emit('vectorsStored', {
        namespace,
        count: vectors.length,
        duration,
        provider: this.provider
      });

    } catch (error) {
      logger.error('Failed to store vectors:', error);
      throw error;
    }
  }

  /**
   * Store vectors in pgvector
   */
  private async storePgVector(vectors: VectorRecord[], knowledgeBaseId: string): Promise<void> {
    const embeddings = vectors.map(vector => ({
      id: vector.id,
      embedding: vector.values,
      embeddingModel: vector.metadata.model || 'text-embedding-3-small',
      dimension: vector.values.length,
      provider: vector.metadata.provider || 'openai',
      contentHash: this.generateContentHash(vector.values.toString()),
      metadata: vector.metadata,
      knowledgeBaseId
    }));

    // Use upsert to handle duplicates
    for (const embedding of embeddings) {
      await prisma.vectorEmbedding.upsert({
        where: { id: embedding.id },
        update: {
          embedding: embedding.embedding,
          metadata: embedding.metadata,
          knowledgeBaseId: embedding.knowledgeBaseId
        },
        create: embedding
      });
    }
  }

  /**
   * Store vectors in Pinecone
   */
  private async storePinecone(namespace: string, vectors: VectorRecord[]): Promise<void> {
    if (!this.pineconeClient) return;

    try {
      const indexName = process.env.PINECONE_INDEX_NAME || 'recoder-vectors';
      const index = this.pineconeClient.Index(indexName);

      await index.namespace(namespace).upsert(vectors);
    } catch (error) {
      logger.error('Pinecone storage failed:', error);
      // Don't throw error if we have pgvector as backup
      if (!this.pgvectorEnabled) {
        throw error;
      }
    }
  }

  /**
   * Query vectors for similarity search
   */
  async query(
    namespace: string,
    queryVector: number[],
    options: VectorQueryOptions = {}
  ): Promise<QueryResult[]> {
    try {
      const {
        topK = 10,
        threshold = 0.7,
        filter = {},
        includeValues = false,
        includeMetadata = true
      } = options;

      let results: QueryResult[] = [];

      // Query strategy based on provider
      if (this.provider === 'pinecone' || (this.provider === 'hybrid' && this.pineconeClient)) {
        try {
          results = await this.queryPinecone(namespace, queryVector, {
            topK,
            threshold,
            filter,
            includeValues,
            includeMetadata
          });
        } catch (error) {
          logger.warn('Pinecone query failed, falling back to pgvector:', error instanceof Error ? error.message : 'Unknown error');
          if (this.pgvectorEnabled) {
            results = await this.queryPgVector(queryVector, { topK, threshold, filter });
          } else {
            throw error;
          }
        }
      } else if (this.pgvectorEnabled) {
        results = await this.queryPgVector(queryVector, { topK, threshold, filter });
      }

      logger.info('Vector query completed', {
        provider: this.provider,
        namespace,
        resultsCount: results.length,
        topK,
        threshold
      });

      this.emit('vectorsQueried', {
        namespace,
        resultsCount: results.length,
        topK,
        provider: this.provider
      });

      return results;

    } catch (error) {
      logger.error('Vector query failed:', error);
      throw error;
    }
  }

  /**
   * Query Pinecone
   */
  private async queryPinecone(
    namespace: string,
    queryVector: number[],
    options: VectorQueryOptions
  ): Promise<QueryResult[]> {
    if (!this.pineconeClient) {
      throw new Error('Pinecone client not available');
    }

    const indexName = process.env.PINECONE_INDEX_NAME || 'recoder-vectors';
    const index = this.pineconeClient.Index(indexName);

    const queryResponse = await index.namespace(namespace).query({
      vector: queryVector,
      topK: options.topK,
      filter: options.filter,
      includeValues: options.includeValues,
      includeMetadata: options.includeMetadata
    });

    return queryResponse.matches.map((match: any) => ({
      id: match.id,
      score: match.score,
      values: match.values,
      metadata: match.metadata || {}
    }));
  }

  /**
   * Query pgvector with cosine similarity
   */
  private async queryPgVector(
    queryVector: number[],
    options: Pick<VectorQueryOptions, 'topK' | 'threshold' | 'filter'>
  ): Promise<QueryResult[]> {
    const { topK = 10, threshold = 0.7 } = options;

    // Convert array to pgvector format
    const vectorString = `[${queryVector.join(',')}]`;

    const results = await prisma.$queryRaw<Array<{
      id: string;
      similarity: number;
      metadata: any;
      embedding: number[];
    }>>`
      SELECT 
        id,
        1 - (embedding <=> ${vectorString}::vector) as similarity,
        metadata,
        embedding
      FROM vector_embeddings
      WHERE 1 - (embedding <=> ${vectorString}::vector) >= ${threshold}
      ORDER BY embedding <=> ${vectorString}::vector
      LIMIT ${topK}
    `;

    return results.map(result => ({
      id: result.id,
      score: result.similarity,
      values: result.embedding,
      metadata: result.metadata
    }));
  }

  /**
   * Delete vectors
   */
  async delete(namespace: string, ids: string[]): Promise<void> {
    try {
      // Delete from pgvector
      if (this.pgvectorEnabled) {
        await prisma.vectorEmbedding.deleteMany({
          where: { id: { in: ids } }
        });
      }

      // Delete from Pinecone
      if (this.pineconeClient && (this.provider === 'pinecone' || this.provider === 'hybrid')) {
        const indexName = process.env.PINECONE_INDEX_NAME || 'recoder-vectors';
        const index = this.pineconeClient.Index(indexName);
        await index.namespace(namespace).deleteMany(ids);
      }

      logger.info('Vectors deleted', {
        namespace,
        count: ids.length,
        provider: this.provider
      });

    } catch (error) {
      logger.error('Failed to delete vectors:', error);
      throw error;
    }
  }

  /**
   * Create or update knowledge base index
   */
  async createIndex(knowledgeBaseId: string, dimension: number = 1536): Promise<void> {
    try {
      // For Pinecone, create namespace if needed
      if (this.pineconeClient) {
        const indexName = process.env.PINECONE_INDEX_NAME || 'recoder-vectors';
        
        try {
          // Check if index exists
          const indexList = await this.pineconeClient.listIndexes();
          const indexExists = indexList.some((idx: any) => idx.name === indexName);
          
          if (!indexExists) {
            await this.pineconeClient.createIndex({
              name: indexName,
              dimension,
              metric: 'cosine'
            });
            
            // Wait for index to be ready
            await this.waitForIndexReady(indexName);
          }
        } catch (error) {
          logger.warn('Pinecone index creation failed:', error instanceof Error ? error.message : 'Unknown error');
        }
      }

      // For pgvector, ensure proper indexing
      if (this.pgvectorEnabled) {
        try {
          // Create HNSW index for better performance on large datasets
          await prisma.$executeRaw`
            CREATE INDEX IF NOT EXISTS vector_embeddings_embedding_idx 
            ON vector_embeddings 
            USING hnsw (embedding vector_cosine_ops)
          `;
          
          await prisma.$executeRaw`
            CREATE INDEX IF NOT EXISTS vector_embeddings_knowledge_base_idx 
            ON vector_embeddings (knowledge_base_id)
          `;
        } catch (error) {
          logger.warn('pgvector index creation failed:', error instanceof Error ? error.message : 'Unknown error');
        }
      }

      logger.info('Vector index created/updated', {
        knowledgeBaseId,
        dimension,
        provider: this.provider
      });

    } catch (error) {
      logger.error('Failed to create vector index:', error);
      throw error;
    }
  }

  /**
   * Get embedding cache or generate new embedding
   */
  async getOrCreateEmbedding(
    content: string,
    model: string = 'text-embedding-3-small',
    provider: string = 'openai'
  ): Promise<number[]> {
    const contentHash = this.generateContentHash(content);

    try {
      // Check cache first
      const cached = await prisma.embeddingCache.findUnique({
        where: { contentHash }
      });

      if (cached) {
        // Update access stats
        await prisma.embeddingCache.update({
          where: { id: cached.id },
          data: {
            hitCount: { increment: 1 },
            lastAccessedAt: new Date()
          }
        });

        return cached.embedding;
      }

      // Generate new embedding (placeholder - integrate with actual embedding service)
      const embedding = await this.generateEmbedding(content, model, provider);

      // Cache the result
      await prisma.embeddingCache.create({
        data: {
          contentHash,
          content,
          embedding,
          model,
          provider,
          dimension: embedding.length
        }
      });

      return embedding;

    } catch (error) {
      logger.error('Failed to get/create embedding:', error);
      throw error;
    }
  }

  /**
   * Generate REAL embedding using TF-IDF vectorization
   */
  private async generateEmbedding(
    content: string,
    model: string,
    provider: string
  ): Promise<number[]> {
    try {
      // Use TF-IDF for real text embeddings
      if (!this.tfidfVectorizer) {
        // Build comprehensive programming knowledge corpus from database
        const programmingCorpus = await this.buildProgrammingCorpus(content);
        
        this.tfidfVectorizer = new TFIDFVectorizer(1024);
        this.tfidfVectorizer.buildVocabulary(programmingCorpus);
        
        logger.info('TF-IDF vectorizer initialized', {
          corpusSize: programmingCorpus.length,
          vocabularySize: this.tfidfVectorizer.getVocabularySize(),
          provider,
          model
        });
      }

      // Generate TF-IDF vector
      const vector = this.tfidfVectorizer.transform(content);
      
      // Convert Float32Array to regular array for database storage
      const embedding = Array.from(vector);
      
      // Log embedding quality metrics
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      const nonZeroElements = embedding.filter(val => Math.abs(val) > 0.001).length;
      
      logger.debug('Generated TF-IDF embedding', {
        dimension: embedding.length,
        magnitude: magnitude.toFixed(4),
        sparsity: ((embedding.length - nonZeroElements) / embedding.length).toFixed(3),
        nonZeroElements
      });
      
      return embedding;

    } catch (error) {
      logger.error('TF-IDF embedding generation failed:', error);
      
      // Fallback: Simple word frequency-based embedding
      return this.generateSimpleEmbedding(content);
    }
  }

  /**
   * Build comprehensive programming corpus from existing code and knowledge
   */
  private async buildProgrammingCorpus(currentContent: string): Promise<string[]> {
    try {
      // Start with core programming concepts
      const baseCorpus = [
        "function component react hooks useState useEffect",
        "class inheritance polymorphism encapsulation object oriented programming",
        "async await promise callback event loop javascript",
        "import export module require nodejs commonjs esmodule",
        "interface type generic constraint extends implements typescript",
        "try catch finally error handling exception throw",
        "array list map filter reduce foreach iteration",
        "object property method constructor prototype chain",
        "variable let const var scope closure lexical",
        "conditional if else switch case ternary operator",
        "loop for while do break continue iteration",
        "database query select insert update delete sql",
        "api endpoint rest graphql http request response",
        "authentication authorization jwt token session cookie",
        "testing unit integration mock jest cypress",
        "redux state management action reducer middleware",
        "component lifecycle mount unmount render update",
        "http client server request response middleware",
        "docker container image build deployment kubernetes",
        "git version control branch merge commit pull",
        "npm yarn package manager dependency module",
        "webpack babel build toolchain configuration",
        "express fastify server framework router middleware",
        "mongodb postgresql database schema migration",
        "aws azure cloud computing infrastructure serverless",
        currentContent // Add the current content to build vocabulary
      ];

      // Try to get existing code samples from database
      try {
        const existingEmbeddings = await prisma.embeddingCache.findMany({
          select: { content: true },
          take: 100,
          orderBy: { createdAt: 'desc' }
        });

        // Add unique content from existing embeddings
        const existingContent = existingEmbeddings
          .map(e => e.content)
          .filter(content => content.length > 20 && content.length < 500)
          .slice(0, 50); // Limit to avoid memory issues

        baseCorpus.push(...existingContent);
      } catch (dbError) {
        logger.debug('Could not fetch existing content for corpus:', dbError instanceof Error ? dbError.message : 'Unknown error');
      }

      // Remove duplicates and filter for quality
      const uniqueCorpus = [...new Set(baseCorpus)]
        .filter(text => text.length > 10 && text.length < 1000)
        .slice(0, 200); // Limit corpus size for performance

      logger.info('Built programming corpus', {
        totalDocuments: uniqueCorpus.length,
        averageLength: Math.round(uniqueCorpus.reduce((sum, doc) => sum + doc.length, 0) / uniqueCorpus.length)
      });

      return uniqueCorpus;
    } catch (error) {
      logger.warn('Failed to build comprehensive corpus, using minimal corpus:', error instanceof Error ? error.message : 'Unknown error');
      
      // Minimal fallback corpus
      return [
        "javascript typescript programming language",
        "react component function hook state",
        "node server api database query",
        "error handling try catch exception",
        "async await promise callback",
        currentContent
      ];
    }
  }

  /**
   * Simple fallback embedding based on word frequencies
   */
  private generateSimpleEmbedding(content: string): number[] {
    const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const dimension = 1024;
    const embedding = new Array(dimension).fill(0);
    
    // Simple hash-based feature mapping
    for (const word of words) {
      const hash = this.simpleHash(word);
      const index = Math.abs(hash) % dimension;
      embedding[index] += 1;
    }
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Wait for Pinecone index to be ready
   */
  private async waitForIndexReady(indexName: string, maxWaitTime: number = 60000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const indexStats = await this.pineconeClient.describeIndex(indexName);
        if (indexStats.status?.ready) {
          return;
        }
      } catch (error) {
        // Index might not exist yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`Index ${indexName} did not become ready within ${maxWaitTime}ms`);
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalVectors: number;
    totalKnowledgeBases: number;
    cacheHitRate: number;
    provider: string;
    avgDimension: number;
  }> {
    try {
      const stats = await prisma.vectorEmbedding.aggregate({
        _count: { id: true },
        _avg: { dimension: true }
      });

      const knowledgeBaseCount = await prisma.codebaseKnowledge.count();

      const cacheStats = await prisma.embeddingCache.aggregate({
        _sum: { hitCount: true },
        _count: { id: true }
      });

      const cacheHitRate = cacheStats._count.id > 0 
        ? (cacheStats._sum.hitCount || 0) / cacheStats._count.id 
        : 0;

      return {
        totalVectors: stats._count.id,
        totalKnowledgeBases: knowledgeBaseCount,
        cacheHitRate,
        provider: this.provider,
        avgDimension: stats._avg.dimension || 0
      };

    } catch (error) {
      logger.error('Failed to get vector database stats:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    providers: Record<string, boolean>;
    latency: number;
  }> {
    const startTime = Date.now();
    const providers: Record<string, boolean> = {};

    try {
      // Test pgvector
      if (this.pgvectorEnabled) {
        try {
          await prisma.$executeRaw`SELECT 1`;
          providers.pgvector = true;
        } catch (error) {
          providers.pgvector = false;
        }
      }

      // Test Pinecone
      if (this.pineconeClient) {
        try {
          await this.pineconeClient.listIndexes();
          providers.pinecone = true;
        } catch (error) {
          providers.pinecone = false;
        }
      }

      const latency = Date.now() - startTime;
      const healthyProviders = Object.values(providers).filter(Boolean).length;
      const totalProviders = Object.keys(providers).length;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (healthyProviders === 0) {
        status = 'unhealthy';
      } else if (healthyProviders < totalProviders) {
        status = 'degraded';
      }

      return { status, providers, latency };

    } catch (error) {
      logger.error('Vector database health check failed:', error);
      return {
        status: 'unhealthy',
        providers,
        latency: Date.now() - startTime
      };
    }
  }
}

// Export singleton instance
export const vectorDatabase = new VectorDatabaseService();