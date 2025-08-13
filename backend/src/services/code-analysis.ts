// Code Analysis Service
// Extract meaningful code chunks and generate embeddings for RAG system

import { EventEmitter } from 'events';
import { prisma } from '../database/prisma';
import { vectorDatabase } from './vector-database';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

interface CodeFile {
  path: string;
  content: string;
  language: string;
  extension: string;
}

interface CodeChunk {
  id: string;
  content: string;
  contentType: 'function' | 'class' | 'method' | 'variable' | 'comment' | 'import' | 'interface' | 'type';
  filePath: string;
  fileName: string;
  fileExtension: string;
  language: string;
  startLine?: number;
  endLine?: number;
  functionName?: string;
  className?: string;
  methodName?: string;
  variableName?: string;
  complexity?: 'simple' | 'medium' | 'complex';
  dependencies: string[];
  keywords: string[];
  summary?: string;
  metadata: Record<string, any>;
}

interface AnalysisOptions {
  chunkSize?: number;
  overlap?: number;
  includeComments?: boolean;
  includeImports?: boolean;
  minChunkLength?: number;
  maxChunkLength?: number;
  generateSummaries?: boolean;
}

export class CodeAnalysisService extends EventEmitter {
  private readonly languagePatterns = {
    typescript: {
      function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      class: /(?:export\s+)?class\s+(\w+)/g,
      method: /(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\(/g,
      interface: /(?:export\s+)?interface\s+(\w+)/g,
      type: /(?:export\s+)?type\s+(\w+)/g,
      variable: /(?:const|let|var)\s+(\w+)/g,
      import: /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g
    },
    javascript: {
      function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      class: /(?:export\s+)?class\s+(\w+)/g,
      method: /(?:async\s+)?(\w+)\s*\(/g,
      variable: /(?:const|let|var)\s+(\w+)/g,
      import: /(?:import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g
    },
    python: {
      function: /def\s+(\w+)/g,
      class: /class\s+(\w+)/g,
      method: /def\s+(\w+)\s*\(/g,
      variable: /(\w+)\s*=/g,
      import: /(?:from\s+(\S+)\s+import|import\s+(\S+))/g
    },
    go: {
      function: /func\s+(\w+)/g,
      struct: /type\s+(\w+)\s+struct/g,
      interface: /type\s+(\w+)\s+interface/g,
      variable: /var\s+(\w+)/g,
      import: /import\s+['"`]([^'"`]+)['"`]/g
    },
    rust: {
      function: /fn\s+(\w+)/g,
      struct: /struct\s+(\w+)/g,
      trait: /trait\s+(\w+)/g,
      impl: /impl\s+(?:\w+\s+for\s+)?(\w+)/g,
      variable: /let\s+(?:mut\s+)?(\w+)/g
    }
  };

  private readonly supportedExtensions = {
    '.ts': 'typescript',
    '.tsx': 'typescript', 
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.php': 'php',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala'
  };

  constructor() {
    super();
  }

  /**
   * Analyze and index a codebase
   */
  async analyzeCodebase(
    knowledgeBaseId: string,
    files: CodeFile[],
    options: AnalysisOptions = {}
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting codebase analysis', {
        knowledgeBaseId,
        fileCount: files.length,
        options
      });

      // Update knowledge base status
      await prisma.codebaseKnowledge.update({
        where: { id: knowledgeBaseId },
        data: {
          status: 'processing',
          totalFiles: files.length,
          processingMeta: { startTime, options }
        }
      });

      const allChunks: CodeChunk[] = [];
      let processedFiles = 0;

      // Process files in batches for better performance
      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (file) => {
          try {
            const chunks = await this.analyzeFile(file, options);
            processedFiles++;
            
            // Update progress
            await prisma.codebaseKnowledge.update({
              where: { id: knowledgeBaseId },
              data: { indexedFiles: processedFiles }
            });

            this.emit('fileProcessed', {
              knowledgeBaseId,
              filePath: file.path,
              chunkCount: chunks.length,
              progress: processedFiles / files.length
            });

            return chunks;
          } catch (error) {
            logger.error('Failed to analyze file:', {
              filePath: file.path,
              error: error.message
            });
            return [];
          }
        });

        const batchResults = await Promise.all(batchPromises);
        allChunks.push(...batchResults.flat());
      }

      // Generate summaries if requested
      if (options.generateSummaries) {
        await this.generateChunkSummaries(allChunks);
      }

      // Store code chunks in database
      await this.storeCodeChunks(knowledgeBaseId, allChunks);

      // Generate and store vector embeddings
      await this.generateEmbeddings(knowledgeBaseId, allChunks);

      // Update knowledge base completion status
      const duration = Date.now() - startTime;
      await prisma.codebaseKnowledge.update({
        where: { id: knowledgeBaseId },
        data: {
          status: 'indexed',
          lastIndexedAt: new Date(),
          processingMeta: {
            ...options,
            duration,
            totalChunks: allChunks.length,
            completedAt: new Date()
          }
        }
      });

      logger.info('Codebase analysis completed', {
        knowledgeBaseId,
        duration,
        filesProcessed: processedFiles,
        chunksGenerated: allChunks.length
      });

      this.emit('analysisCompleted', {
        knowledgeBaseId,
        duration,
        filesProcessed: processedFiles,
        chunksGenerated: allChunks.length
      });

    } catch (error) {
      logger.error('Codebase analysis failed:', error);
      
      // Update status to error
      await prisma.codebaseKnowledge.update({
        where: { id: knowledgeBaseId },
        data: {
          status: 'error',
          processingMeta: {
            error: error.message,
            failedAt: new Date()
          }
        }
      });

      throw error;
    }
  }

  /**
   * Analyze a single code file
   */
  async analyzeFile(file: CodeFile, options: AnalysisOptions = {}): Promise<CodeChunk[]> {
    const {
      chunkSize = 500,
      overlap = 50,
      includeComments = true,
      includeImports = true,
      minChunkLength = 50,
      maxChunkLength = 2000
    } = options;

    const chunks: CodeChunk[] = [];
    const lines = file.content.split('\n');
    
    // Extract structured code elements
    const structuredChunks = await this.extractStructuredChunks(file);
    chunks.push(...structuredChunks);

    // Extract semantic chunks for better context
    const semanticChunks = await this.extractSemanticChunks(file, {
      chunkSize,
      overlap,
      minChunkLength,
      maxChunkLength
    });
    chunks.push(...semanticChunks);

    // Filter chunks based on options
    return chunks.filter(chunk => {
      if (!includeComments && chunk.contentType === 'comment') return false;
      if (!includeImports && chunk.contentType === 'import') return false;
      if (chunk.content.length < minChunkLength) return false;
      if (chunk.content.length > maxChunkLength) return false;
      return true;
    });
  }

  /**
   * Extract structured code elements (functions, classes, etc.)
   */
  private async extractStructuredChunks(file: CodeFile): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const patterns = this.languagePatterns[file.language as keyof typeof this.languagePatterns];
    
    if (!patterns) {
      return chunks;
    }

    const lines = file.content.split('\n');

    // Extract functions
    if (patterns.function) {
      const functionMatches = Array.from(file.content.matchAll(patterns.function));
      for (const match of functionMatches) {
        const functionName = match[1];
        const functionCode = this.extractFunctionBody(file.content, match.index || 0);
        
        if (functionCode) {
          chunks.push({
            id: this.generateChunkId(file.path, functionName, 'function'),
            content: functionCode,
            contentType: 'function',
            filePath: file.path,
            fileName: path.basename(file.path),
            fileExtension: file.extension,
            language: file.language,
            functionName,
            complexity: this.calculateComplexity(functionCode),
            dependencies: this.extractDependencies(functionCode),
            keywords: this.extractKeywords(functionCode, file.language),
            metadata: {
              extractedAt: new Date(),
              extractionMethod: 'structured'
            }
          });
        }
      }
    }

    // Extract classes
    if (patterns.class) {
      const classMatches = Array.from(file.content.matchAll(patterns.class));
      for (const match of classMatches) {
        const className = match[1];
        const classCode = this.extractClassBody(file.content, match.index || 0);
        
        if (classCode) {
          chunks.push({
            id: this.generateChunkId(file.path, className, 'class'),
            content: classCode,
            contentType: 'class',
            filePath: file.path,
            fileName: path.basename(file.path),
            fileExtension: file.extension,
            language: file.language,
            className,
            complexity: this.calculateComplexity(classCode),
            dependencies: this.extractDependencies(classCode),
            keywords: this.extractKeywords(classCode, file.language),
            metadata: {
              extractedAt: new Date(),
              extractionMethod: 'structured'
            }
          });
        }
      }
    }

    // Extract interfaces (TypeScript)
    if (patterns.interface) {
      const interfaceMatches = Array.from(file.content.matchAll(patterns.interface));
      for (const match of interfaceMatches) {
        const interfaceName = match[1];
        const interfaceCode = this.extractInterfaceBody(file.content, match.index || 0);
        
        if (interfaceCode) {
          chunks.push({
            id: this.generateChunkId(file.path, interfaceName, 'interface'),
            content: interfaceCode,
            contentType: 'interface',
            filePath: file.path,
            fileName: path.basename(file.path),
            fileExtension: file.extension,
            language: file.language,
            className: interfaceName,
            complexity: 'simple',
            dependencies: this.extractDependencies(interfaceCode),
            keywords: this.extractKeywords(interfaceCode, file.language),
            metadata: {
              extractedAt: new Date(),
              extractionMethod: 'structured'
            }
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Extract semantic chunks with overlapping windows
   */
  private async extractSemanticChunks(
    file: CodeFile,
    options: { chunkSize: number; overlap: number; minChunkLength: number; maxChunkLength: number }
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = file.content.split('\n');
    const { chunkSize, overlap, minChunkLength, maxChunkLength } = options;

    for (let i = 0; i < lines.length; i += chunkSize - overlap) {
      const chunkLines = lines.slice(i, i + chunkSize);
      const chunkContent = chunkLines.join('\n').trim();
      
      if (chunkContent.length >= minChunkLength && chunkContent.length <= maxChunkLength) {
        chunks.push({
          id: this.generateChunkId(file.path, `chunk-${i}`, 'semantic'),
          content: chunkContent,
          contentType: 'comment', // Generic type for semantic chunks
          filePath: file.path,
          fileName: path.basename(file.path),
          fileExtension: file.extension,
          language: file.language,
          startLine: i + 1,
          endLine: Math.min(i + chunkSize, lines.length),
          complexity: this.calculateComplexity(chunkContent),
          dependencies: this.extractDependencies(chunkContent),
          keywords: this.extractKeywords(chunkContent, file.language),
          metadata: {
            extractedAt: new Date(),
            extractionMethod: 'semantic',
            chunkIndex: Math.floor(i / (chunkSize - overlap))
          }
        });
      }
    }

    return chunks;
  }

  /**
   * Extract function body from code
   */
  private extractFunctionBody(content: string, startIndex: number): string | null {
    // Simple implementation - find function declaration and extract body
    const lines = content.substring(startIndex).split('\n');
    let braceCount = 0;
    let inFunction = false;
    const functionLines: string[] = [];

    for (const line of lines) {
      functionLines.push(line);
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inFunction = true;
        } else if (char === '}') {
          braceCount--;
          if (inFunction && braceCount === 0) {
            return functionLines.join('\n');
          }
        }
      }
    }

    return functionLines.length > 1 ? functionLines.join('\n') : null;
  }

  /**
   * Extract class body from code
   */
  private extractClassBody(content: string, startIndex: number): string | null {
    // Similar to function extraction but for classes
    return this.extractFunctionBody(content, startIndex);
  }

  /**
   * Extract interface body from code
   */
  private extractInterfaceBody(content: string, startIndex: number): string | null {
    // Similar to function extraction but for interfaces
    return this.extractFunctionBody(content, startIndex);
  }

  /**
   * Calculate code complexity
   */
  private calculateComplexity(code: string): 'simple' | 'medium' | 'complex' {
    const lines = code.split('\n').length;
    const cyclomatic = (code.match(/if|for|while|switch|catch|&&|\|\|/g) || []).length;
    
    if (lines < 10 && cyclomatic < 3) return 'simple';
    if (lines < 50 && cyclomatic < 10) return 'medium';
    return 'complex';
  }

  /**
   * Extract dependencies from code
   */
  private extractDependencies(code: string): string[] {
    const dependencies: string[] = [];
    
    // Extract import statements
    const importMatches = code.match(/import.*?from\s+['"`]([^'"`]+)['"`]/g) || [];
    for (const match of importMatches) {
      const dep = match.match(/from\s+['"`]([^'"`]+)['"`]/)?.[1];
      if (dep) dependencies.push(dep);
    }

    // Extract require statements
    const requireMatches = code.match(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g) || [];
    for (const match of requireMatches) {
      const dep = match.match(/['"`]([^'"`]+)['"`]/)?.[1];
      if (dep) dependencies.push(dep);
    }

    return [...new Set(dependencies)]; // Remove duplicates
  }

  /**
   * Extract keywords from code
   */
  private extractKeywords(code: string, language: string): string[] {
    const keywords: string[] = [];
    
    // Language-specific keywords
    const languageKeywords = {
      typescript: ['async', 'await', 'Promise', 'interface', 'type', 'class', 'function'],
      javascript: ['async', 'await', 'Promise', 'class', 'function', 'const', 'let'],
      python: ['def', 'class', 'async', 'await', 'import', 'from'],
      go: ['func', 'struct', 'interface', 'go', 'defer', 'channel'],
      rust: ['fn', 'struct', 'impl', 'trait', 'async', 'await']
    };

    const langKeywords = languageKeywords[language as keyof typeof languageKeywords] || [];
    
    for (const keyword of langKeywords) {
      if (code.includes(keyword)) {
        keywords.push(keyword);
      }
    }

    return keywords;
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(filePath: string, identifier: string, type: string): string {
    const content = `${filePath}:${identifier}:${type}`;
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Generate summaries for code chunks using AI
   */
  private async generateChunkSummaries(chunks: CodeChunk[]): Promise<void> {
    // Placeholder for AI-generated summaries
    // This would integrate with the AI router to generate summaries
    for (const chunk of chunks) {
      if (chunk.contentType === 'function' || chunk.contentType === 'class') {
        chunk.summary = `${chunk.contentType} ${chunk.functionName || chunk.className} - auto-generated summary`;
      }
    }
  }

  /**
   * Store code chunks in database
   */
  private async storeCodeChunks(knowledgeBaseId: string, chunks: CodeChunk[]): Promise<void> {
    const batchSize = 100;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      const createData = batch.map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        contentType: chunk.contentType,
        filePath: chunk.filePath,
        fileName: chunk.fileName,
        fileExtension: chunk.fileExtension,
        language: chunk.language,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        functionName: chunk.functionName,
        className: chunk.className,
        methodName: chunk.methodName,
        variableName: chunk.variableName,
        complexity: chunk.complexity,
        dependencies: chunk.dependencies,
        keywords: chunk.keywords,
        summary: chunk.summary,
        metadata: chunk.metadata,
        knowledgeBaseId
      }));

      await prisma.codeChunk.createMany({
        data: createData,
        skipDuplicates: true
      });
    }
  }

  /**
   * Generate and store vector embeddings
   */
  private async generateEmbeddings(knowledgeBaseId: string, chunks: CodeChunk[]): Promise<void> {
    const vectors = [];
    
    for (const chunk of chunks) {
      try {
        // Prepare content for embedding
        const embeddingContent = this.prepareEmbeddingContent(chunk);
        
        // Generate embedding
        const embedding = await vectorDatabase.getOrCreateEmbedding(
          embeddingContent,
          'text-embedding-3-small',
          'openai'
        );

        vectors.push({
          id: chunk.id,
          values: embedding,
          metadata: {
            chunkId: chunk.id,
            contentType: chunk.contentType,
            filePath: chunk.filePath,
            language: chunk.language,
            functionName: chunk.functionName,
            className: chunk.className,
            complexity: chunk.complexity,
            keywords: chunk.keywords,
            summary: chunk.summary,
            model: 'text-embedding-3-small',
            provider: 'openai'
          }
        });

        // Store in batches
        if (vectors.length >= 50) {
          await vectorDatabase.store(`kb-${knowledgeBaseId}`, vectors, knowledgeBaseId);
          vectors.length = 0; // Clear array
        }

      } catch (error) {
        logger.error('Failed to generate embedding for chunk:', {
          chunkId: chunk.id,
          error: error.message
        });
      }
    }

    // Store remaining vectors
    if (vectors.length > 0) {
      await vectorDatabase.store(`kb-${knowledgeBaseId}`, vectors, knowledgeBaseId);
    }
  }

  /**
   * Prepare content for embedding generation
   */
  private prepareEmbeddingContent(chunk: CodeChunk): string {
    let content = chunk.content;
    
    // Add contextual information
    if (chunk.functionName) {
      content = `Function ${chunk.functionName}:\n${content}`;
    } else if (chunk.className) {
      content = `Class ${chunk.className}:\n${content}`;
    }

    // Add metadata context
    if (chunk.summary) {
      content = `${chunk.summary}\n\n${content}`;
    }

    // Add language context
    content = `${chunk.language} code:\n${content}`;

    return content;
  }

  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    return Object.keys(this.supportedExtensions);
  }

  /**
   * Check if file is supported
   */
  isFileSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext in this.supportedExtensions;
  }

  /**
   * Get language from file extension
   */
  getLanguageFromExtension(extension: string): string {
    return this.supportedExtensions[extension as keyof typeof this.supportedExtensions] || 'unknown';
  }
}

// Export singleton instance
export const codeAnalysis = new CodeAnalysisService();