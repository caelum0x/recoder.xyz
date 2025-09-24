/**
 * Component Library and Template Caching Service
 * Intelligent caching system for reusable code patterns and components
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

interface ComponentTemplate {
  id: string;
  name: string;
  description: string;
  category: string; // 'react', 'vue', 'angular', 'nodejs', 'python', etc.
  framework: string; // 'nextjs', 'express', 'fastapi', etc.
  type: string; // 'component', 'hook', 'utility', 'api', 'config', etc.
  tags: string[];
  code: string;
  dependencies: string[];
  usageCount: number;
  quality: number; // 0-1 quality score
  createdAt: Date;
  lastUsedAt: Date;
  metadata: any;
}

interface ComponentPattern {
  id: string;
  pattern: string;
  frequency: number;
  variations: string[];
  template: ComponentTemplate;
  avgGenerationTime: number;
  avgCost: number;
}

interface LibraryMetrics {
  totalComponents: number;
  totalUsage: number;
  averageGenerationTime: number;
  costSavings: number;
  popularCategories: Record<string, number>;
  qualityDistribution: Record<string, number>;
}

export class ComponentLibraryService extends EventEmitter {
  private static instance: ComponentLibraryService;
  private redis: Redis;
  private libraryMetrics: LibraryMetrics;
  private patternMatcher: Map<string, ComponentPattern> = new Map();
  
  // Library configuration
  private readonly CACHE_TTL = 7 * 24 * 60 * 60; // 7 days
  private readonly MAX_LIBRARY_SIZE = 50000; // Maximum cached components
  private readonly SIMILARITY_THRESHOLD = 0.8; // Pattern matching threshold
  private readonly QUALITY_THRESHOLD = 0.7; // Minimum quality for caching
  private readonly USAGE_THRESHOLD = 3; // Minimum usage for pattern recognition

  constructor(redisClient?: Redis) {
    super();
    this.redis = redisClient || new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.libraryMetrics = {
      totalComponents: 0,
      totalUsage: 0,
      averageGenerationTime: 0,
      costSavings: 0,
      popularCategories: {},
      qualityDistribution: {}
    };
    
    this.initializeLibrary();
  }

  public static getInstance(redisClient?: Redis): ComponentLibraryService {
    if (!ComponentLibraryService.instance) {
      ComponentLibraryService.instance = new ComponentLibraryService(redisClient);
    }
    return ComponentLibraryService.instance;
  }

  /**
   * Initialize component library system
   */
  private async initializeLibrary(): Promise<void> {
    try {
      // Load built-in component templates
      await this.loadBuiltInTemplates();
      
      // Load existing library statistics
      await this.loadLibraryMetrics();
      
      // Load popular patterns from database
      await this.loadPopularPatterns();
      
      // Start pattern analysis background job
      this.startPatternAnalysis();
      
      logger.info('Component library initialized', {
        maxSize: this.MAX_LIBRARY_SIZE,
        ttl: this.CACHE_TTL,
        similarityThreshold: this.SIMILARITY_THRESHOLD
      });
    } catch (error) {
      logger.error('Failed to initialize component library:', error);
    }
  }

  /**
   * Find matching component template
   */
  async findComponent(
    description: string,
    category?: string,
    framework?: string,
    type?: string
  ): Promise<ComponentTemplate | null> {
    try {
      // Normalize search criteria
      const normalizedDesc = this.normalizeDescription(description);
      const searchKey = this.generateSearchKey(normalizedDesc, category, framework, type);
      
      // Check Redis cache first
      const cached = await this.getFromRedis(searchKey);
      if (cached) {
        await this.updateUsageStats(cached);
        return cached;
      }
      
      // Search database with similarity matching
      const dbResult = await this.searchDatabase(normalizedDesc, category, framework, type);
      if (dbResult) {
        // Cache result for faster future access
        await this.storeInRedis(searchKey, dbResult);
        await this.updateUsageStats(dbResult);
        return dbResult;
      }
      
      // Use pattern matching for similar components
      const patternMatch = await this.findSimilarPattern(normalizedDesc, category, framework);
      if (patternMatch) {
        await this.updateUsageStats(patternMatch.template);
        return patternMatch.template;
      }
      
      return null;
      
    } catch (error) {
      logger.error('Component search error:', error);
      return null;
    }
  }

  /**
   * Store new component template
   */
  async storeComponent(
    name: string,
    description: string,
    category: string,
    framework: string,
    type: string,
    code: string,
    dependencies: string[] = [],
    tags: string[] = [],
    quality: number = 1,
    metadata: any = {}
  ): Promise<void> {
    try {
      // Skip if quality is too low
      if (quality < this.QUALITY_THRESHOLD) {
        logger.debug('Skipping component due to low quality', { quality, threshold: this.QUALITY_THRESHOLD });
        return;
      }
      
      // Generate component ID
      const componentId = this.generateComponentId(name, category, framework);
      
      const component: ComponentTemplate = {
        id: componentId,
        name,
        description,
        category,
        framework,
        type,
        tags,
        code,
        dependencies,
        usageCount: 0,
        quality,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        metadata
      };
      
      // Store in Redis
      const searchKey = this.generateSearchKey(description, category, framework, type);
      await this.storeInRedis(searchKey, component);
      
      // Store in database for persistence
      await this.storeInDatabase(component);
      
      // Update pattern analysis
      await this.updatePatternAnalysis(description, component);
      
      logger.debug('Stored component template', {
        name,
        category,
        framework,
        type,
        quality,
        dependencies: dependencies.length
      });
      
    } catch (error) {
      logger.error('Component storage error:', error);
    }
  }

  /**
   * Get popular component categories
   */
  async getPopularCategories(limit: number = 10): Promise<Array<{category: string, count: number}>> {
    try {
      const categories = await prisma.componentTemplate.groupBy({
        by: ['category'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      
      return categories.map(cat => ({
        category: cat.category,
        count: cat._count.id
      }));
    } catch (error) {
      logger.error('Failed to get popular categories:', error);
      return [];
    }
  }

  /**
   * Get component suggestions based on context
   */
  async getSuggestions(
    context: {
      projectType?: string;
      framework?: string;
      recentlyUsed?: string[];
      userPreferences?: string[];
    }
  ): Promise<ComponentTemplate[]> {
    try {
      const whereClause: any = {};
      
      if (context.framework) {
        whereClause.framework = context.framework;
      }
      
      if (context.projectType) {
        whereClause.category = { contains: context.projectType, mode: 'insensitive' };
      }
      
      const suggestions = await prisma.componentTemplate.findMany({
        where: whereClause,
        orderBy: [
          { usageCount: 'desc' },
          { quality: 'desc' }
        ],
        take: 20
      });
      
      return suggestions.map(this.convertToComponentTemplate);
    } catch (error) {
      logger.error('Failed to get suggestions:', error);
      return [];
    }
  }

  /**
   * Generate search key for caching
   */
  private generateSearchKey(description: string, category?: string, framework?: string, type?: string): string {
    const keyParts = [
      this.normalizeDescription(description),
      category || 'any',
      framework || 'any',
      type || 'any'
    ];
    return this.generateHash(keyParts.join(':'));
  }

  /**
   * Generate component ID
   */
  private generateComponentId(name: string, category: string, framework: string): string {
    const idString = `${category}:${framework}:${name.toLowerCase().replace(/\s+/g, '-')}`;
    return this.generateHash(idString);
  }

  /**
   * Generate SHA-256 hash
   */
  private generateHash(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Normalize description for consistent searching
   */
  private normalizeDescription(description: string): string {
    return description
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '')
      .substring(0, 500);
  }

  /**
   * Get component from Redis cache
   */
  private async getFromRedis(searchKey: string): Promise<ComponentTemplate | null> {
    try {
      const cached = await this.redis.get(`component:${searchKey}`);
      if (cached) {
        return JSON.parse(cached) as ComponentTemplate;
      }
      return null;
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  }

  /**
   * Store component in Redis cache
   */
  private async storeInRedis(searchKey: string, component: ComponentTemplate): Promise<void> {
    try {
      const serialized = JSON.stringify(component);
      await this.redis.setex(`component:${searchKey}`, this.CACHE_TTL, serialized);
    } catch (error) {
      logger.error('Redis set error:', error);
    }
  }

  /**
   * Search database for matching components
   */
  private async searchDatabase(
    description: string,
    category?: string,
    framework?: string,
    type?: string
  ): Promise<ComponentTemplate | null> {
    try {
      const whereClause: any = {
        OR: [
          { description: { contains: description, mode: 'insensitive' } },
          { name: { contains: description, mode: 'insensitive' } },
          { tags: { hasSome: description.split(' ') } }
        ]
      };
      
      if (category) {
        whereClause.category = category;
      }
      
      if (framework) {
        whereClause.framework = framework;
      }
      
      if (type) {
        whereClause.type = type;
      }
      
      const component = await prisma.componentTemplate.findFirst({
        where: whereClause,
        orderBy: [
          { usageCount: 'desc' },
          { quality: 'desc' }
        ]
      });
      
      return component ? this.convertToComponentTemplate(component) : null;
    } catch (error) {
      logger.error('Database search error:', error);
      return null;
    }
  }

  /**
   * Store component in database
   */
  private async storeInDatabase(component: ComponentTemplate): Promise<void> {
    try {
      await prisma.componentTemplate.upsert({
        where: { id: component.id },
        update: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date()
        },
        create: {
          id: component.id,
          name: component.name,
          description: component.description,
          category: component.category,
          framework: component.framework,
          type: component.type,
          tags: component.tags,
          code: component.code,
          dependencies: component.dependencies,
          usageCount: component.usageCount,
          quality: component.quality,
          createdAt: component.createdAt,
          lastUsedAt: component.lastUsedAt,
          metadata: component.metadata
        }
      });
    } catch (error) {
      logger.error('Database storage error:', error);
    }
  }

  /**
   * Find similar pattern using text similarity
   */
  private async findSimilarPattern(
    description: string,
    category?: string,
    framework?: string
  ): Promise<ComponentPattern | null> {
    try {
      for (const [patternKey, pattern] of this.patternMatcher) {
        const similarity = this.calculateTextSimilarity(description, pattern.pattern);
        
        if (similarity >= this.SIMILARITY_THRESHOLD) {
          // Check category and framework match if specified
          if (category && pattern.template.category !== category) continue;
          if (framework && pattern.template.framework !== framework) continue;
          
          logger.debug('Found similar component pattern', {
            similarity,
            pattern: pattern.pattern,
            template: pattern.template.name
          });
          
          return pattern;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Pattern matching error:', error);
      return null;
    }
  }

  /**
   * Calculate text similarity using Jaccard index
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Update usage statistics
   */
  private async updateUsageStats(component: ComponentTemplate): Promise<void> {
    try {
      await prisma.componentTemplate.update({
        where: { id: component.id },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date()
        }
      });
      
      // Update metrics
      this.libraryMetrics.totalUsage++;
      
    } catch (error) {
      logger.error('Failed to update usage stats:', error);
    }
  }

  /**
   * Load library metrics from database
   */
  private async loadLibraryMetrics(): Promise<void> {
    try {
      const stats = await prisma.componentTemplate.aggregate({
        _count: { id: true },
        _sum: { usageCount: true },
        _avg: { quality: true }
      });
      
      this.libraryMetrics.totalComponents = stats._count.id || 0;
      this.libraryMetrics.totalUsage = stats._sum.usageCount || 0;
      
    } catch (error) {
      logger.error('Failed to load library metrics:', error);
    }
  }

  /**
   * Load popular patterns from database
   */
  private async loadPopularPatterns(): Promise<void> {
    try {
      const popularComponents = await prisma.componentTemplate.findMany({
        where: {
          usageCount: { gte: this.USAGE_THRESHOLD }
        },
        orderBy: { usageCount: 'desc' },
        take: 100
      });
      
      for (const component of popularComponents) {
        const pattern = this.extractPattern(component.description);
        this.patternMatcher.set(pattern, {
          id: pattern,
          pattern,
          frequency: component.usageCount,
          variations: [component.description],
          template: this.convertToComponentTemplate(component),
          avgGenerationTime: 0,
          avgCost: 0
        });
      }
      
      logger.info(`Loaded ${this.patternMatcher.size} component patterns`);
    } catch (error) {
      logger.error('Failed to load patterns:', error);
    }
  }

  /**
   * Extract pattern from description
   */
  private extractPattern(description: string): string {
    return description
      .replace(/\b\d+\b/g, '[NUMBER]')
      .replace(/\b[A-Z][a-z]+\b/g, '[WORD]')
      .replace(/[\"'].*?[\"']/g, '[STRING]')
      .substring(0, 100);
  }

  /**
   * Update pattern analysis
   */
  private async updatePatternAnalysis(description: string, component: ComponentTemplate): Promise<void> {
    const pattern = this.extractPattern(description);
    
    if (this.patternMatcher.has(pattern)) {
      const existing = this.patternMatcher.get(pattern)!;
      existing.frequency++;
      existing.variations.push(description);
    } else {
      this.patternMatcher.set(pattern, {
        id: pattern,
        pattern,
        frequency: 1,
        variations: [description],
        template: component,
        avgGenerationTime: 0,
        avgCost: 0
      });
    }
  }

  /**
   * Start pattern analysis background job
   */
  private startPatternAnalysis(): void {
    setInterval(async () => {
      try {
        await this.analyzePatterns();
      } catch (error) {
        logger.error('Pattern analysis error:', error);
      }
    }, 300000); // Run every 5 minutes
  }

  /**
   * Analyze patterns for optimization opportunities
   */
  private async analyzePatterns(): Promise<void> {
    const highFrequencyPatterns = Array.from(this.patternMatcher.values())
      .filter(pattern => pattern.frequency >= this.USAGE_THRESHOLD)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20);
    
    if (highFrequencyPatterns.length > 0) {
      this.emit('patternsIdentified', {
        patterns: highFrequencyPatterns,
        optimizationOpportunity: highFrequencyPatterns.length
      });
    }
  }

  /**
   * Load built-in component templates
   */
  private async loadBuiltInTemplates(): Promise<void> {
    const templates = [
      // React Components
      {
        name: 'React Button Component',
        description: 'reusable button component with props',
        category: 'react',
        framework: 'nextjs',
        type: 'component',
        tags: ['button', 'ui', 'interactive'],
        code: `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  className = ''
}) => {
  const baseClasses = 'px-4 py-2 rounded-md font-medium transition-colors';
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={\`\${baseClasses} \${variantClasses[variant]} \${className} \${disabled ? 'opacity-50 cursor-not-allowed' : ''}\`}
    >
      {children}
    </button>
  );
};`,
        dependencies: ['react'],
        quality: 0.9
      },
      {
        name: 'React Form Input',
        description: 'form input component with validation',
        category: 'react',
        framework: 'nextjs',
        type: 'component',
        tags: ['input', 'form', 'validation'],
        code: `import React, { useState } from 'react';

interface InputProps {
  label: string;
  type?: 'text' | 'email' | 'password' | 'number';
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  className?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  required = false,
  error,
  className = ''
}) => {
  return (
    <div className={\`mb-4 \${className}\`}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={\`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 \${error ? 'border-red-500' : 'border-gray-300'}\`}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};`,
        dependencies: ['react'],
        quality: 0.9
      },
      // API Utilities
      {
        name: 'API Client Hook',
        description: 'react hook for api calls with loading states',
        category: 'react',
        framework: 'nextjs',
        type: 'hook',
        tags: ['api', 'fetch', 'loading', 'hook'],
        code: `import { useState, useEffect } from 'react';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T>(url: string, options?: RequestInit): ApiState<T> & {
  refetch: () => Promise<void>;
} {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: true,
    error: null
  });

  const fetchData = async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers
        },
        ...options
      });
      
      if (!response.ok) {
        throw new Error(\`HTTP error! status: \${response.status}\`);
      }
      
      const data = await response.json();
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : 'An error occurred'
      });
    }
  };

  useEffect(() => {
    fetchData();
  }, [url]);

  return {
    ...state,
    refetch: fetchData
  };
}`,
        dependencies: ['react'],
        quality: 0.9
      },
      // Node.js Utilities
      {
        name: 'Express Middleware Logger',
        description: 'express middleware for request logging',
        category: 'nodejs',
        framework: 'express',
        type: 'middleware',
        tags: ['logging', 'middleware', 'express'],
        code: `import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface LoggerOptions {
  includeBody?: boolean;
  excludePaths?: string[];
  logLevel?: 'info' | 'debug';
}

export const requestLogger = (options: LoggerOptions = {}) => {
  const {
    includeBody = false,
    excludePaths = ['/health', '/ping'],
    logLevel = 'info'
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    // Skip logging for excluded paths
    if (excludePaths.includes(req.path)) {
      return next();
    }

    // Capture response end
    const originalEnd = res.end;
    res.end = function(chunk?: any) {
      const duration = Date.now() - start;
      
      const logData = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: \`\${duration}ms\`,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        ...(includeBody && req.body && { body: req.body })
      };

      if (logLevel === 'debug') {
        logger.debug('HTTP Request', logData);
      } else {
        logger.info('HTTP Request', logData);
      }

      originalEnd.call(this, chunk);
    };

    next();
  };
};`,
        dependencies: ['express'],
        quality: 0.9
      }
    ];

    // Store built-in templates
    for (const template of templates) {
      await this.storeComponent(
        template.name,
        template.description,
        template.category,
        template.framework,
        template.type,
        template.code,
        template.dependencies,
        template.tags,
        template.quality
      );
    }

    logger.info(`Loaded ${templates.length} built-in component templates`);
  }

  /**
   * Convert database record to ComponentTemplate
   */
  private convertToComponentTemplate(record: any): ComponentTemplate {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      category: record.category,
      framework: record.framework,
      type: record.type,
      tags: record.tags,
      code: record.code,
      dependencies: record.dependencies,
      usageCount: record.usageCount,
      quality: record.quality,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      metadata: record.metadata
    };
  }

  /**
   * Get library statistics
   */
  getLibraryMetrics(): LibraryMetrics {
    return { ...this.libraryMetrics };
  }

  /**
   * Get identified patterns
   */
  getPatterns(): ComponentPattern[] {
    return Array.from(this.patternMatcher.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Clear cached components by category
   */
  async clearByCategory(category: string): Promise<number> {
    try {
      const deleted = await prisma.componentTemplate.deleteMany({
        where: { category }
      });
      
      // Clear from Redis
      const keys = await this.redis.keys(`component:*`);
      let redisDeleted = 0;
      
      for (const key of keys) {
        const component = await this.redis.get(key);
        if (component && JSON.parse(component).category === category) {
          await this.redis.del(key);
          redisDeleted++;
        }
      }
      
      logger.info(`Cleared ${deleted.count} components from category: ${category}`);
      return deleted.count;
    } catch (error) {
      logger.error('Failed to clear components by category:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const componentLibrary = ComponentLibraryService.getInstance();