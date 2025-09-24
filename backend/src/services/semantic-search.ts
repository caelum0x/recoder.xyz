// Semantic Search Service
// Advanced code understanding and context retrieval using RAG 

import { EventEmitter } from 'events';
import { prisma } from '../database/prisma';
import { vectorDatabase } from './vector-database';
import { logger } from '../utils/logger';

interface SearchQuery {
  query: string;
  knowledgeBaseId: string;
  userId: string;
  queryType?: 'search' | 'explain' | 'generate' | 'refactor';
  filters?: {
    language?: string;
    framework?: string;
    contentType?: string[];
    complexity?: 'simple' | 'medium' | 'complex';
    filePath?: string;
  };
  options?: {
    maxResults?: number;
    threshold?: number;
    includeContext?: boolean;
    contextWindow?: number;
    rerank?: boolean;
  };
}

interface SearchResult {
  id: string;
  content: string;
  contentType: string;
  filePath: string;
  fileName: string;
  language: string;
  functionName?: string;
  className?: string;
  similarity: number;
  relevanceScore: number;
  rank: number;
  contextWindow?: string;
  explanation?: string;
  metadata: Record<string, any>;
}

interface SearchResponse {
  results: SearchResult[];
  totalResults: number;
  query: string;
  processingTime: number;
  suggestions?: string[];
  relatedQueries?: string[];
  context?: {
    knowledgeBaseName: string;
    totalChunks: number;
    searchStrategy: string;
  };
}

interface IntentClassification {
  intent: string;
  confidence: number;
  extractedEntities: {
    language?: string;
    framework?: string;
    taskType?: string;
    codeElements?: string[];
  };
}

export class SemanticSearchService extends EventEmitter {
  private readonly intentPatterns = {
    search: [
      /find|search|look for|show me|where is/i,
      /function|method|class|interface|variable/i
    ],
    explain: [
      /explain|how does|what does|understand|describe/i,
      /why|purpose|meaning|definition/i
    ],
    generate: [
      /create|generate|write|implement|build/i,
      /code|function|class|component|api/i
    ],
    refactor: [
      /refactor|improve|optimize|clean up|restructure/i,
      /better|performance|maintainable/i
    ]
  };

  private readonly languageKeywords = {
    typescript: ['typescript', 'ts', 'tsx', 'angular', 'react', 'vue'],
    javascript: ['javascript', 'js', 'jsx', 'node', 'express', 'react'],
    python: ['python', 'py', 'django', 'flask', 'fastapi', 'pandas'],
    go: ['golang', 'go', 'gin', 'fiber', 'goroutine'],
    rust: ['rust', 'rs', 'tokio', 'actix', 'serde'],
    java: ['java', 'spring', 'hibernate', 'maven'],
    csharp: ['c#', 'csharp', 'dotnet', '.net', 'asp.net']
  };

  constructor() {
    super();
  }

  /**
   * Perform semantic search on knowledge base
   */
  async search(searchQuery: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();

    try {
      logger.info('Starting semantic search', {
        query: searchQuery.query,
        knowledgeBaseId: searchQuery.knowledgeBaseId,
        userId: searchQuery.userId
      });

      // Classify user intent
      const intent = await this.classifyIntent(searchQuery.query);
      
      // Store query for analytics
      const queryRecord = await this.storeQuery(searchQuery, intent);

      // Generate query embedding
      const queryEmbedding = await vectorDatabase.getOrCreateEmbedding(
        this.enhanceQuery(searchQuery.query, intent),
        'text-embedding-3-small',
        'openai'
      );

      // Perform vector search
      const vectorResults = await vectorDatabase.query(
        `kb-${searchQuery.knowledgeBaseId}`,
        queryEmbedding,
        {
          topK: searchQuery.options?.maxResults || 20,
          threshold: searchQuery.options?.threshold || 0.7,
          filter: this.buildVectorFilter(searchQuery.filters),
          includeMetadata: true,
          includeValues: false
        }
      );

      // Get code chunks with additional metadata
      const enrichedResults = await this.enrichResults(vectorResults, searchQuery);

      // Apply post-processing filters
      const filteredResults = this.applyFilters(enrichedResults, searchQuery.filters);

      // Rerank results if requested
      const finalResults = searchQuery.options?.rerank 
        ? await this.rerankResults(filteredResults, searchQuery)
        : filteredResults;

      // Add context windows if requested
      if (searchQuery.options?.includeContext) {
        await this.addContextWindows(finalResults, searchQuery.options.contextWindow || 300);
      }

      // Generate explanations for top results
      await this.generateExplanations(finalResults.slice(0, 5), searchQuery);

      // Store search results
      await this.storeSearchResults(queryRecord.id, finalResults);

      const processingTime = Date.now() - startTime;

      // Update query record with results
      await prisma.semanticQuery.update({
        where: { id: queryRecord.id },
        data: {
          processingTime,
          totalResults: finalResults.length
        }
      });

      const response: SearchResponse = {
        results: finalResults.slice(0, searchQuery.options?.maxResults || 10),
        totalResults: finalResults.length,
        query: searchQuery.query,
        processingTime,
        suggestions: await this.generateSuggestions(searchQuery.query, intent),
        relatedQueries: await this.getRelatedQueries(searchQuery.knowledgeBaseId, searchQuery.query),
        context: await this.getSearchContext(searchQuery.knowledgeBaseId)
      };

      logger.info('Semantic search completed', {
        query: searchQuery.query,
        resultsCount: finalResults.length,
        processingTime,
        intent: intent.intent
      });

      this.emit('searchCompleted', {
        queryId: queryRecord.id,
        query: searchQuery.query,
        resultsCount: finalResults.length,
        processingTime,
        intent: intent.intent
      });

      return response;

    } catch (error) {
      logger.error('Semantic search failed:', error);
      throw error;
    }
  }

  /**
   * Classify user intent from natural language query
   */
  private async classifyIntent(query: string): Promise<IntentClassification> {
    const queryLower = query.toLowerCase();
    let bestIntent = 'search';
    let bestScore = 0;

    // Pattern-based intent classification
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      const score = patterns.reduce((sum, pattern) => {
        return sum + (pattern.test(queryLower) ? 1 : 0);
      }, 0) / patterns.length;

      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    // Extract language/framework entities
    const extractedEntities: any = {};
    
    for (const [language, keywords] of Object.entries(this.languageKeywords)) {
      for (const keyword of keywords) {
        if (queryLower.includes(keyword)) {
          extractedEntities.language = language;
          break;
        }
      }
      if (extractedEntities.language) break;
    }

    // Extract code elements
    const codeElementPatterns = [
      /function\s+(\w+)/g,
      /class\s+(\w+)/g,
      /interface\s+(\w+)/g,
      /method\s+(\w+)/g,
      /variable\s+(\w+)/g
    ];

    const codeElements: string[] = [];
    for (const pattern of codeElementPatterns) {
      const matches = Array.from(query.matchAll(pattern));
      for (const match of matches) {
        if (match[1]) codeElements.push(match[1]);
      }
    }

    if (codeElements.length > 0) {
      extractedEntities.codeElements = codeElements;
    }

    return {
      intent: bestIntent,
      confidence: Math.max(bestScore, 0.6), // Minimum confidence
      extractedEntities
    };
  }

  /**
   * Enhance query with intent and context
   */
  private enhanceQuery(query: string, intent: IntentClassification): string {
    let enhancedQuery = query;

    // Add intent context
    switch (intent.intent) {
      case 'explain':
        enhancedQuery = `Explain and describe: ${query}`;
        break;
      case 'generate':
        enhancedQuery = `Code implementation for: ${query}`;
        break;
      case 'refactor':
        enhancedQuery = `Refactoring and optimization: ${query}`;
        break;
      default:
        enhancedQuery = `Search code for: ${query}`;
    }

    // Add language context if detected
    if (intent.extractedEntities.language) {
      enhancedQuery += ` in ${intent.extractedEntities.language}`;
    }

    return enhancedQuery;
  }

  /**
   * Store query for analytics and learning
   */
  private async storeQuery(searchQuery: SearchQuery, intent: IntentClassification): Promise<any> {
    return await prisma.semanticQuery.create({
      data: {
        query: searchQuery.query,
        queryType: searchQuery.queryType || intent.intent,
        intent: intent.intent,
        language: searchQuery.filters?.language || intent.extractedEntities.language,
        framework: searchQuery.filters?.framework,
        complexity: searchQuery.filters?.complexity,
        maxResults: searchQuery.options?.maxResults || 10,
        threshold: searchQuery.options?.threshold || 0.7,
        metadata: {
          intent: {
            intent: intent.intent,
            confidence: intent.confidence,
            extractedEntities: intent.extractedEntities
          },
          filters: searchQuery.filters,
          options: searchQuery.options
        } as any,
        userId: searchQuery.userId,
        knowledgeBaseId: searchQuery.knowledgeBaseId
      }
    });
  }

  /**
   * Build vector search filter
   */
  private buildVectorFilter(filters?: SearchQuery['filters']): Record<string, any> {
    const vectorFilter: Record<string, any> = {};

    if (filters?.language) {
      vectorFilter.language = filters.language;
    }

    if (filters?.contentType && filters.contentType.length > 0) {
      vectorFilter.contentType = { $in: filters.contentType };
    }

    if (filters?.complexity) {
      vectorFilter.complexity = filters.complexity;
    }

    if (filters?.filePath) {
      vectorFilter.filePath = { $regex: filters.filePath };
    }

    return vectorFilter;
  }

  /**
   * Enrich vector results with database metadata
   */
  private async enrichResults(vectorResults: any[], searchQuery: SearchQuery): Promise<SearchResult[]> {
    const chunkIds = vectorResults.map(result => result.id);
    
    const codeChunks = await prisma.codeChunk.findMany({
      where: { id: { in: chunkIds } },
      include: {
        knowledgeBase: {
          select: { name: true, language: true, framework: true }
        }
      }
    });

    const chunkMap = new Map(codeChunks.map(chunk => [chunk.id, chunk]));

    return vectorResults.map((result, index) => {
      const chunk = chunkMap.get(result.id);
      if (!chunk) {
        logger.warn('Code chunk not found for vector result:', result.id);
        return null;
      }

      // Type assertion since we know the structure from Prisma
      const typedChunk = chunk as typeof chunk & {
        content: string;
        contentType: string;
        filePath: string;
        fileName: string;
        language: string;
        functionName: string | null;
        className: string | null;
        startLine: number | null;
        endLine: number | null;
        complexity: string | null;
        dependencies: string[];
        keywords: string[];
        summary: string | null;
      };

      return {
        id: result.id,
        content: typedChunk.content,
        contentType: typedChunk.contentType,
        filePath: typedChunk.filePath,
        fileName: typedChunk.fileName,
        language: typedChunk.language,
        functionName: typedChunk.functionName || undefined,
        className: typedChunk.className || undefined,
        similarity: result.score,
        relevanceScore: result.score, // Will be updated by reranking
        rank: index + 1,
        metadata: {
          ...result.metadata,
          startLine: typedChunk.startLine,
          endLine: typedChunk.endLine,
          complexity: typedChunk.complexity,
          dependencies: typedChunk.dependencies,
          keywords: typedChunk.keywords,
          summary: typedChunk.summary
        }
      };
    }).filter(Boolean) as SearchResult[];
  }

  /**
   * Apply post-processing filters
   */
  private applyFilters(results: SearchResult[], filters?: SearchQuery['filters']): SearchResult[] {
    let filteredResults = results;

    if (filters?.language) {
      filteredResults = filteredResults.filter(result => 
        result.language.toLowerCase() === filters.language!.toLowerCase()
      );
    }

    if (filters?.framework) {
      filteredResults = filteredResults.filter(result =>
        result.metadata.dependencies?.some((dep: string) => 
          dep.toLowerCase().includes(filters.framework!.toLowerCase())
        ) || 
        result.metadata.keywords?.some((keyword: string) => 
          keyword.toLowerCase().includes(filters.framework!.toLowerCase())
        )
      );
    }

    if (filters?.contentType && filters.contentType.length > 0) {
      filteredResults = filteredResults.filter(result =>
        filters.contentType!.includes(result.contentType)
      );
    }

    if (filters?.complexity) {
      filteredResults = filteredResults.filter(result =>
        result.metadata.complexity === filters.complexity
      );
    }

    if (filters?.filePath) {
      filteredResults = filteredResults.filter(result =>
        result.filePath.includes(filters.filePath!)
      );
    }

    return filteredResults;
  }

  /**
   * Rerank results using additional relevance signals
   */
  private async rerankResults(results: SearchResult[], searchQuery: SearchQuery): Promise<SearchResult[]> {
    // Simple reranking based on multiple factors
    return results.map(result => {
      let relevanceScore = result.similarity;

      // Boost based on content type
      const contentTypeBoosts = {
        'function': 1.2,
        'class': 1.1,
        'interface': 1.05,
        'method': 1.15,
        'variable': 0.9,
        'comment': 0.8,
        'import': 0.7
      };

      relevanceScore *= contentTypeBoosts[result.contentType as keyof typeof contentTypeBoosts] || 1.0;

      // Boost based on complexity match
      if (searchQuery.filters?.complexity) {
        if (result.metadata.complexity === searchQuery.filters.complexity) {
          relevanceScore *= 1.1;
        }
      }

      // Boost if function/class name matches query terms
      const queryTerms = searchQuery.query.toLowerCase().split(/\s+/);
      const nameMatch = queryTerms.some(term => 
        result.functionName?.toLowerCase().includes(term) ||
        result.className?.toLowerCase().includes(term)
      );

      if (nameMatch) {
        relevanceScore *= 1.3;
      }

      // Boost if keywords match
      const keywordMatch = queryTerms.some(term =>
        result.metadata.keywords?.some((keyword: string) =>
          keyword.toLowerCase().includes(term)
        )
      );

      if (keywordMatch) {
        relevanceScore *= 1.1;
      }

      return {
        ...result,
        relevanceScore
      };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore)
      .map((result, index) => ({ ...result, rank: index + 1 }));
  }

  /**
   * Add context windows around code chunks
   */
  private async addContextWindows(results: SearchResult[], windowSize: number): Promise<void> {
    for (const result of results) {
      try {
        // Get surrounding context from the same file
        const surroundingChunks = await prisma.codeChunk.findMany({
          where: {
            filePath: result.filePath,
            knowledgeBaseId: result.metadata.knowledgeBaseId
          },
          orderBy: { startLine: 'asc' }
        });

        const currentIndex = surroundingChunks.findIndex(chunk => chunk.id === result.id);
        if (currentIndex === -1) continue;

        const contextChunks = surroundingChunks.slice(
          Math.max(0, currentIndex - 1),
          Math.min(surroundingChunks.length, currentIndex + 2)
        );

        result.contextWindow = contextChunks.map(chunk => chunk.content).join('\n\n');

      } catch (error) {
        logger.warn('Failed to add context window:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Generate AI explanations for search results
   */
  private async generateExplanations(results: SearchResult[], searchQuery: SearchQuery): Promise<void> {
    // Placeholder for AI-generated explanations
    // This would integrate with the AI router
    for (const result of results) {
      if (result.contentType === 'function' || result.contentType === 'class') {
        result.explanation = `This ${result.contentType} appears relevant to your query "${searchQuery.query}" because it contains related functionality and patterns.`;
      }
    }
  }

  /**
   * Store search results for analytics
   */
  private async storeSearchResults(queryId: string, results: SearchResult[]): Promise<void> {
    const searchResultsData = results.map((result, index) => ({
      queryId,
      chunkId: result.id,
      vectorId: result.id, // Assuming vector ID matches chunk ID
      rank: index + 1,
      similarity: result.similarity,
      relevanceScore: result.relevanceScore,
      contextWindow: result.contextWindow,
      explanation: result.explanation,
      metadata: {
        contentType: result.contentType,
        language: result.language,
        filePath: result.filePath
      }
    }));

    await prisma.semanticSearchResult.createMany({
      data: searchResultsData,
      skipDuplicates: true
    });
  }

  /**
   * Generate query suggestions
   */
  private async generateSuggestions(query: string, intent: IntentClassification): Promise<string[]> {
    const suggestions: string[] = [];

    // Based on intent, suggest related queries
    switch (intent.intent) {
      case 'search':
        suggestions.push(
          `Find implementations of ${query}`,
          `Show examples of ${query}`,
          `List all ${query} functions`
        );
        break;
      case 'explain':
        suggestions.push(
          `How to use ${query}`,
          `Examples of ${query}`,
          `Best practices for ${query}`
        );
        break;
      case 'generate':
        suggestions.push(
          `Create tests for ${query}`,
          `Implement ${query} with error handling`,
          `Add documentation for ${query}`
        );
        break;
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Get related queries from search history
   */
  private async getRelatedQueries(knowledgeBaseId: string, currentQuery: string): Promise<string[]> {
    const recentQueries = await prisma.semanticQuery.findMany({
      where: {
        knowledgeBaseId,
        query: { not: currentQuery },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      },
      select: { query: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    return recentQueries.map(q => q.query).slice(0, 3);
  }

  /**
   * Get search context information
   */
  private async getSearchContext(knowledgeBaseId: string): Promise<SearchResponse['context']> {
    const knowledgeBase = await prisma.codebaseKnowledge.findUnique({
      where: { id: knowledgeBaseId },
      include: {
        _count: {
          select: { codeChunks: true }
        }
      }
    });

    if (!knowledgeBase) {
      throw new Error('Knowledge base not found');
    }

    return {
      knowledgeBaseName: knowledgeBase.name,
      totalChunks: knowledgeBase._count.codeChunks,
      searchStrategy: 'semantic_vector_search'
    };
  }

  /**
   * Get search analytics
   */
  async getAnalytics(knowledgeBaseId: string, timeRange: number = 7): Promise<any> {
    const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);

    const [queryStats, popularQueries, intentDistribution] = await Promise.all([
      // Query statistics
      prisma.semanticQuery.aggregate({
        where: {
          knowledgeBaseId,
          createdAt: { gte: startDate }
        },
        _count: { id: true },
        _avg: { processingTime: true, totalResults: true }
      }),

      // Popular queries
      prisma.semanticQuery.groupBy({
        by: ['query'],
        where: {
          knowledgeBaseId,
          createdAt: { gte: startDate }
        },
        _count: { query: true },
        orderBy: { _count: { query: 'desc' } },
        take: 10
      }),

      // Intent distribution
      prisma.semanticQuery.groupBy({
        by: ['queryType'],
        where: {
          knowledgeBaseId,
          createdAt: { gte: startDate }
        },
        _count: { queryType: true }
      })
    ]);

    return {
      summary: {
        totalQueries: queryStats._count.id,
        avgProcessingTime: queryStats._avg.processingTime,
        avgResultsPerQuery: queryStats._avg.totalResults
      },
      popularQueries: popularQueries.map(q => ({
        query: q.query,
        count: q._count.query
      })),
      intentDistribution: intentDistribution.map(i => ({
        intent: i.queryType,
        count: i._count.queryType
      }))
    };
  }
}

// Export singleton instance
export const semanticSearch = new SemanticSearchService();