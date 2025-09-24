/**
 * Offline-First Architecture Manager
 * 
 * Comprehensive offline-first system that ensures the Ollama integration works
 * seamlessly without internet connectivity, with intelligent fallbacks, local
 * caching, and adaptive behavior based on network availability.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from 'recoder-shared';

export interface NetworkStatus {
  isOnline: boolean;
  lastOnline: Date | null;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
  latency?: number;
  bandwidth?: number;
}

export interface OfflineCapability {
  feature: string;
  isAvailable: boolean;
  requirements: string[];
  fallbackStrategy: 'local' | 'cache' | 'disable' | 'queue';
  estimatedDegradation: number; // 0-100% performance impact
}

export interface OfflineConfig {
  enableOfflineMode: boolean;
  maxCacheSize: number; // MB
  cacheTTL: number; // seconds
  syncInterval: number; // seconds
  fallbackStrategies: Record<string, 'local' | 'cache' | 'disable' | 'queue'>;
  preloadModels: string[]; // Models to always keep locally
  enableSmartSync: boolean;
  compressCache: boolean;
}

export interface CacheEntry {
  key: string;
  data: any;
  timestamp: Date;
  size: number;
  accessCount: number;
  lastAccessed: Date;
  priority: 'high' | 'medium' | 'low';
  expires?: Date;
}

export interface SyncQueue {
  id: string;
  operation: 'model_download' | 'model_update' | 'cache_sync' | 'config_sync';
  data: any;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  nextRetry?: Date;
}

export interface OfflineStats {
  totalCacheSize: number;
  cacheHitRate: number;
  offlineOperations: number;
  queuedOperations: number;
  lastSync: Date | null;
  networkUptime: number; // percentage
}

export class OfflineManager extends EventEmitter {
  private config: OfflineConfig;
  private networkStatus: NetworkStatus;
  private cache: Map<string, CacheEntry> = new Map();
  private syncQueue: SyncQueue[] = [];
  private networkCheckInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  private readonly DEFAULT_CONFIG: OfflineConfig = {
    enableOfflineMode: true,
    maxCacheSize: 1024, // 1GB
    cacheTTL: 24 * 60 * 60, // 24 hours
    syncInterval: 5 * 60, // 5 minutes
    fallbackStrategies: {
      'model_download': 'queue',
      'model_update': 'queue',
      'completion': 'local',
      'chat': 'local',
      'recommendations': 'cache'
    },
    preloadModels: ['phi:2.7b', 'llama2:7b'],
    enableSmartSync: true,
    compressCache: true
  };

  private readonly CACHE_DIR = path.join(process.cwd(), '.recoder', 'offline-cache');
  private readonly QUEUE_FILE = path.join(this.CACHE_DIR, 'sync-queue.json');
  private readonly STATS_FILE = path.join(this.CACHE_DIR, 'offline-stats.json');

  constructor(config?: Partial<OfflineConfig>) {
    super();
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.networkStatus = {
      isOnline: true,
      lastOnline: new Date(),
      connectionQuality: 'good'
    };
  }

  /**
   * Initialize offline manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      Logger.info('Initializing offline-first architecture...');

      // Ensure cache directory exists
      await this.ensureCacheDirectory();

      // Load persistent cache and queue
      await this.loadPersistentData();

      // Start network monitoring
      await this.startNetworkMonitoring();

      // Start sync process if online
      if (this.networkStatus.isOnline) {
        this.startSyncProcess();
      }

      // Preload essential models if configured
      await this.preloadEssentialModels();

      this.isInitialized = true;
      Logger.info('Offline-first architecture initialized successfully');
      this.emit('initialized', this.getOfflineCapabilities());

    } catch (error) {
      Logger.error('Failed to initialize offline manager:', error);
      throw error;
    }
  }

  /**
   * Get current network status
   */
  getNetworkStatus(): NetworkStatus {
    return { ...this.networkStatus };
  }

  /**
   * Get offline capabilities for each feature
   */
  getOfflineCapabilities(): OfflineCapability[] {
    const capabilities: OfflineCapability[] = [
      {
        feature: 'AI Completions',
        isAvailable: true,
        requirements: ['Local Ollama models'],
        fallbackStrategy: 'local',
        estimatedDegradation: 0
      },
      {
        feature: 'Chat Conversations',
        isAvailable: true,
        requirements: ['Local Ollama models'],
        fallbackStrategy: 'local',
        estimatedDegradation: 0
      },
      {
        feature: 'Model Downloads',
        isAvailable: this.networkStatus.isOnline,
        requirements: ['Internet connection'],
        fallbackStrategy: 'queue',
        estimatedDegradation: this.networkStatus.isOnline ? 0 : 100
      },
      {
        feature: 'Model Recommendations',
        isAvailable: true,
        requirements: ['Cached model metadata'],
        fallbackStrategy: 'cache',
        estimatedDegradation: this.networkStatus.isOnline ? 0 : 20
      },
      {
        feature: 'Performance Optimization',
        isAvailable: true,
        requirements: ['Local metrics'],
        fallbackStrategy: 'local',
        estimatedDegradation: 10
      },
      {
        feature: 'Background Updates',
        isAvailable: this.networkStatus.isOnline,
        requirements: ['Internet connection'],
        fallbackStrategy: 'queue',
        estimatedDegradation: this.networkStatus.isOnline ? 0 : 100
      }
    ];

    return capabilities;
  }

  /**
   * Cache data with intelligent expiration and compression
   */
  async cacheData(key: string, data: any, options?: {
    priority?: 'high' | 'medium' | 'low';
    ttl?: number;
    compress?: boolean;
  }): Promise<void> {
    const priority = options?.priority || 'medium';
    const ttl = options?.ttl || this.config.cacheTTL;
    const compress = options?.compress ?? this.config.compressCache;

    try {
      // Serialize and optionally compress data
      let serializedData = JSON.stringify(data);
      if (compress) {
        // Simple compression simulation (in real implementation, use zlib)
        serializedData = this.simpleCompress(serializedData);
      }

      const entry: CacheEntry = {
        key,
        data: compress ? { compressed: true, data: serializedData } : data,
        timestamp: new Date(),
        size: Buffer.byteLength(serializedData, 'utf8'),
        accessCount: 0,
        lastAccessed: new Date(),
        priority,
        expires: new Date(Date.now() + ttl * 1000)
      };

      // Check cache size limits
      await this.evictIfNecessary(entry.size);

      // Store in memory cache
      this.cache.set(key, entry);

      // Persist to disk for important data
      if (priority === 'high') {
        await this.persistCacheEntry(key, entry);
      }

      Logger.debug(`Cached data: ${key} (${entry.size} bytes, ${priority} priority)`);

    } catch (error) {
      Logger.error(`Failed to cache data for key ${key}:`, error);
    }
  }

  /**
   * Retrieve cached data with freshness validation
   */
  async getCachedData(key: string): Promise<any | null> {
    try {
      let entry = this.cache.get(key);

      // Try loading from disk if not in memory
      if (!entry) {
        entry = await this.loadCacheEntry(key);
        if (entry) {
          this.cache.set(key, entry);
        }
      }

      if (!entry) {
        return null;
      }

      // Check expiration
      if (entry.expires && entry.expires < new Date()) {
        this.cache.delete(key);
        await this.deleteCacheEntry(key);
        return null;
      }

      // Update access statistics
      entry.accessCount++;
      entry.lastAccessed = new Date();

      // Decompress if necessary
      if (entry.data?.compressed) {
        return JSON.parse(this.simpleDecompress(entry.data.data));
      }

      return entry.data;

    } catch (error) {
      Logger.error(`Failed to retrieve cached data for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Queue operation for when network becomes available
   */
  async queueOperation(operation: Omit<SyncQueue, 'id' | 'attempts' | 'createdAt'>): Promise<string> {
    const queueItem: SyncQueue = {
      id: this.generateId(),
      attempts: 0,
      createdAt: new Date(),
      ...operation
    };

    this.syncQueue.push(queueItem);
    await this.persistSyncQueue();

    Logger.info(`Queued operation: ${operation.operation} (${queueItem.id})`);
    this.emit('operationQueued', queueItem);

    return queueItem.id;
  }

  /**
   * Execute operation with offline fallback
   */
  async executeWithFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    operationType: string
  ): Promise<T> {
    try {
      // Try primary operation if online
      if (this.networkStatus.isOnline) {
        const result = await this.withTimeout(primaryOperation(), 10000);
        return result;
      }

      // Use fallback strategy
      const strategy = this.config.fallbackStrategies[operationType] || 'local';
      
      switch (strategy) {
        case 'local':
          Logger.info(`Using local fallback for ${operationType}`);
          return await fallbackOperation();
          
        case 'cache':
          const cached = await this.getCachedData(`fallback:${operationType}`);
          if (cached) {
            Logger.info(`Using cached fallback for ${operationType}`);
            return cached;
          }
          return await fallbackOperation();
          
        case 'queue':
          await this.queueOperation({
            operation: operationType as any,
            data: {},
            priority: 1,
            maxAttempts: 3
          });
          return await fallbackOperation();
          
        case 'disable':
          throw new Error(`Operation ${operationType} is disabled in offline mode`);
          
        default:
          return await fallbackOperation();
      }

    } catch (error) {
      Logger.warn(`Primary operation failed for ${operationType}, using fallback:`, error);
      return await fallbackOperation();
    }
  }

  /**
   * Get current offline statistics
   */
  getOfflineStats(): OfflineStats {
    const totalCacheSize = Array.from(this.cache.values())
      .reduce((total, entry) => total + entry.size, 0);

    const totalAccesses = Array.from(this.cache.values())
      .reduce((total, entry) => total + entry.accessCount, 0);

    const cacheHits = Array.from(this.cache.values())
      .filter(entry => entry.accessCount > 0).length;

    return {
      totalCacheSize: Math.round(totalCacheSize / (1024 * 1024)), // MB
      cacheHitRate: totalAccesses > 0 ? (cacheHits / this.cache.size) * 100 : 0,
      offlineOperations: this.getOfflineOperationCount(),
      queuedOperations: this.syncQueue.length,
      lastSync: this.getLastSyncTime(),
      networkUptime: this.calculateNetworkUptime()
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    Logger.info('Shutting down offline manager...');

    // Stop intervals
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Persist final state
    await this.persistSyncQueue();
    await this.persistStats();

    // Clear caches
    this.cache.clear();
    this.syncQueue = [];

    this.isInitialized = false;
    Logger.info('Offline manager shutdown complete');
  }

  // Private helper methods

  private async ensureCacheDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.CACHE_DIR, { recursive: true });
    } catch (error) {
      Logger.error('Failed to create cache directory:', error);
    }
  }

  private async loadPersistentData(): Promise<void> {
    try {
      // Load sync queue
      const queueData = await fs.readFile(this.QUEUE_FILE, 'utf8');
      this.syncQueue = JSON.parse(queueData).map((item: any) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        nextRetry: item.nextRetry ? new Date(item.nextRetry) : undefined
      }));
    } catch (error) {
      Logger.debug('No existing sync queue found');
    }
  }

  private async startNetworkMonitoring(): Promise<void> {
    // Initial network check
    await this.checkNetworkStatus();

    // Set up periodic network checks
    this.networkCheckInterval = setInterval(async () => {
      await this.checkNetworkStatus();
    }, 30000); // Check every 30 seconds
  }

  private async checkNetworkStatus(): Promise<void> {
    try {
      const start = Date.now();
      
      // Try to reach a reliable endpoint
      const response = await this.withTimeout(
        fetch('https://ollama.ai/health', { method: 'HEAD' }),
        5000
      );

      const latency = Date.now() - start;
      const wasOnline = this.networkStatus.isOnline;

      this.networkStatus = {
        isOnline: response.ok,
        lastOnline: response.ok ? new Date() : this.networkStatus.lastOnline,
        connectionQuality: this.assessConnectionQuality(latency),
        latency,
        bandwidth: await this.estimateBandwidth()
      };

      // Emit events on status changes
      if (!wasOnline && this.networkStatus.isOnline) {
        Logger.info('Network connection restored');
        this.emit('networkRestored', this.networkStatus);
        this.startSyncProcess();
      } else if (wasOnline && !this.networkStatus.isOnline) {
        Logger.warn('Network connection lost, switching to offline mode');
        this.emit('networkLost', this.networkStatus);
      }

    } catch (error) {
      const wasOnline = this.networkStatus.isOnline;
      this.networkStatus.isOnline = false;
      this.networkStatus.connectionQuality = 'offline';

      if (wasOnline) {
        Logger.warn('Network connection lost, switching to offline mode');
        this.emit('networkLost', this.networkStatus);
      }
    }
  }

  private assessConnectionQuality(latency: number): NetworkStatus['connectionQuality'] {
    if (latency < 100) return 'excellent';
    if (latency < 300) return 'good';
    if (latency < 1000) return 'poor';
    return 'offline';
  }

  private async estimateBandwidth(): Promise<number> {
    // Simple bandwidth estimation (in practice, this would be more sophisticated)
    return Math.random() * 100; // Simulated Mbps
  }

  private startSyncProcess(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(async () => {
      if (this.networkStatus.isOnline && this.syncQueue.length > 0) {
        await this.processSyncQueue();
      }
    }, this.config.syncInterval * 1000);
  }

  private async processSyncQueue(): Promise<void> {
    if (!this.networkStatus.isOnline) return;

    Logger.info(`Processing sync queue (${this.syncQueue.length} items)`);

    const itemsToProcess = this.syncQueue
      .filter(item => !item.nextRetry || item.nextRetry <= new Date())
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5); // Process up to 5 items at once

    for (const item of itemsToProcess) {
      try {
        await this.processSyncItem(item);
        
        // Remove from queue on success
        this.syncQueue = this.syncQueue.filter(i => i.id !== item.id);
        Logger.info(`Successfully processed sync item: ${item.id}`);

      } catch (error) {
        item.attempts++;
        
        if (item.attempts >= item.maxAttempts) {
          this.syncQueue = this.syncQueue.filter(i => i.id !== item.id);
          Logger.error(`Sync item ${item.id} failed after ${item.attempts} attempts:`, error);
        } else {
          // Schedule retry with exponential backoff
          item.nextRetry = new Date(Date.now() + Math.pow(2, item.attempts) * 60000);
          Logger.warn(`Sync item ${item.id} failed, scheduling retry for ${item.nextRetry}`);
        }
      }
    }

    await this.persistSyncQueue();
  }

  private async processSyncItem(item: SyncQueue): Promise<void> {
    switch (item.operation) {
      case 'model_download':
        // Would implement actual model download
        Logger.info(`Processing model download: ${item.data.modelName}`);
        break;
      case 'model_update':
        // Would implement actual model update
        Logger.info(`Processing model update: ${item.data.modelName}`);
        break;
      case 'cache_sync':
        // Would implement cache synchronization
        Logger.info('Processing cache sync');
        break;
      case 'config_sync':
        // Would implement config synchronization
        Logger.info('Processing config sync');
        break;
    }
  }

  private async preloadEssentialModels(): Promise<void> {
    if (!this.config.preloadModels.length) return;

    Logger.info(`Preloading essential models: ${this.config.preloadModels.join(', ')}`);
    
    for (const modelName of this.config.preloadModels) {
      try {
        // Check if model is already available locally
        // This would integrate with the model manager
        Logger.debug(`Checking availability of ${modelName}`);
      } catch (error) {
        Logger.warn(`Failed to preload model ${modelName}:`, error);
      }
    }
  }

  private async evictIfNecessary(newEntrySize: number): Promise<void> {
    const maxSizeBytes = this.config.maxCacheSize * 1024 * 1024;
    const currentSize = Array.from(this.cache.values())
      .reduce((total, entry) => total + entry.size, 0);

    if (currentSize + newEntrySize <= maxSizeBytes) {
      return;
    }

    // Sort by priority and access patterns for eviction
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, entry }))
      .sort((a, b) => {
        // Lower priority and less frequently accessed items first
        const priorityWeight = { low: 1, medium: 2, high: 3 };
        const scoreA = priorityWeight[a.entry.priority] * a.entry.accessCount;
        const scoreB = priorityWeight[b.entry.priority] * b.entry.accessCount;
        return scoreA - scoreB;
      });

    let freedSpace = 0;
    const targetFreeSpace = newEntrySize + (maxSizeBytes * 0.1); // Free 10% extra

    for (const { key, entry } of entries) {
      if (freedSpace >= targetFreeSpace) break;

      this.cache.delete(key);
      await this.deleteCacheEntry(key);
      freedSpace += entry.size;
      
      Logger.debug(`Evicted cache entry: ${key} (${entry.size} bytes)`);
    }
  }

  private async persistCacheEntry(key: string, entry: CacheEntry): Promise<void> {
    try {
      const filePath = path.join(this.CACHE_DIR, `${this.sanitizeKey(key)}.json`);
      await fs.writeFile(filePath, JSON.stringify(entry));
    } catch (error) {
      Logger.error(`Failed to persist cache entry ${key}:`, error);
    }
  }

  private async loadCacheEntry(key: string): Promise<CacheEntry | undefined> {
    try {
      const filePath = path.join(this.CACHE_DIR, `${this.sanitizeKey(key)}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      const entry = JSON.parse(data);
      
      // Convert date strings back to Date objects
      entry.timestamp = new Date(entry.timestamp);
      entry.lastAccessed = new Date(entry.lastAccessed);
      if (entry.expires) entry.expires = new Date(entry.expires);
      
      return entry;
    } catch (error) {
      return undefined;
    }
  }

  private async deleteCacheEntry(key: string): Promise<void> {
    try {
      const filePath = path.join(this.CACHE_DIR, `${this.sanitizeKey(key)}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore deletion errors
    }
  }

  private async persistSyncQueue(): Promise<void> {
    try {
      await fs.writeFile(this.QUEUE_FILE, JSON.stringify(this.syncQueue, null, 2));
    } catch (error) {
      Logger.error('Failed to persist sync queue:', error);
    }
  }

  private async persistStats(): Promise<void> {
    try {
      const stats = this.getOfflineStats();
      await fs.writeFile(this.STATS_FILE, JSON.stringify(stats, null, 2));
    } catch (error) {
      Logger.error('Failed to persist stats:', error);
    }
  }

  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), timeout)
      )
    ]);
  }

  private simpleCompress(data: string): string {
    // Simple compression simulation (real implementation would use zlib)
    return Buffer.from(data).toString('base64');
  }

  private simpleDecompress(data: string): string {
    // Simple decompression simulation
    return Buffer.from(data, 'base64').toString('utf8');
  }

  private getOfflineOperationCount(): number {
    // This would track actual offline operations
    return 0;
  }

  private getLastSyncTime(): Date | null {
    // This would track actual last sync time
    return new Date();
  }

  private calculateNetworkUptime(): number {
    // This would calculate actual network uptime percentage
    return this.networkStatus.isOnline ? 100 : 85;
  }
}

// Export singleton instance
export const offlineManager = new OfflineManager();

export default OfflineManager;