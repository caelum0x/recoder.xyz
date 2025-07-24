/**
 * Real-Time State Synchronizer for Recoder.xyz
 * 
 * Handles real-time synchronization of application state across multiple platforms
 * Uses WebSocket connections and Redis pub/sub for instant updates
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import Redis from 'redis';
import { SessionManager, UserSession, SyncEvent } from './session-manager';

export interface StateChange {
  id: string;
  sessionId: string;
  timestamp: Date;
  path: string; // JSONPath to the changed property
  oldValue: any;
  newValue: any;
  operation: 'set' | 'delete' | 'push' | 'splice' | 'merge';
  metadata: {
    userId: string;
    platform: string;
    deviceId: string;
    version: number;
  };
}

export interface SyncPolicy {
  conflictResolution: 'last-writer-wins' | 'merge' | 'manual';
  syncDelay: number; // milliseconds to batch changes
  maxRetries: number;
  enableCompression: boolean;
  enableEncryption: boolean;
  syncPaths: string[]; // Which state paths to sync
  excludePaths: string[]; // Which paths to exclude from sync
}

export interface SyncStatus {
  sessionId: string;
  lastSyncTime: Date;
  pendingChanges: number;
  syncErrors: number;
  isOnline: boolean;
  latency: number;
  version: number;
}

export interface SyncConflict {
  id: string;
  sessionId: string;
  path: string;
  localValue: any;
  remoteValue: any;
  timestamp: Date;
  resolution?: 'local' | 'remote' | 'merged' | 'manual';
  resolvedValue?: any;
}

export class StateSynchronizer extends EventEmitter {
  private static instance: StateSynchronizer;
  private sessionManager: SessionManager;
  private redis: Redis.RedisClientType;
  private redisPub: Redis.RedisClientType;
  private redisSub: Redis.RedisClientType;
  private syncPolicies: Map<string, SyncPolicy> = new Map();
  private pendingChanges: Map<string, StateChange[]> = new Map();
  private syncStatus: Map<string, SyncStatus> = new Map();
  private conflicts: Map<string, SyncConflict[]> = new Map();
  private syncTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor(redisUrl?: string) {
    super();
    this.sessionManager = SessionManager.getInstance(redisUrl);
    this.redis = Redis.createClient({ url: redisUrl || process.env.REDIS_URL });
    this.redisPub = this.redis.duplicate();
    this.redisSub = this.redis.duplicate();
    this.initializeRedis();
    this.setupSubscriptions();
  }

  static getInstance(redisUrl?: string): StateSynchronizer {
    if (!StateSynchronizer.instance) {
      StateSynchronizer.instance = new StateSynchronizer(redisUrl);
    }
    return StateSynchronizer.instance;
  }

  /**
   * Initialize a sync policy for a session
   */
  setSyncPolicy(sessionId: string, policy: Partial<SyncPolicy>): void {
    const defaultPolicy: SyncPolicy = {
      conflictResolution: 'last-writer-wins',
      syncDelay: 500, // 500ms batching
      maxRetries: 3,
      enableCompression: true,
      enableEncryption: false,
      syncPaths: ['*'], // Sync everything by default
      excludePaths: ['temp', 'cache', 'local'] // Exclude temporary data
    };

    const mergedPolicy = { ...defaultPolicy, ...policy };
    this.syncPolicies.set(sessionId, mergedPolicy);

    // Initialize sync status
    this.syncStatus.set(sessionId, {
      sessionId,
      lastSyncTime: new Date(),
      pendingChanges: 0,
      syncErrors: 0,
      isOnline: true,
      latency: 0,
      version: 1
    });
  }

  /**
   * Apply a state change and synchronize it
   */
  async applyStateChange(change: Omit<StateChange, 'id' | 'timestamp'>): Promise<void> {
    const stateChange: StateChange = {
      id: this.generateChangeId(),
      timestamp: new Date(),
      ...change
    };

    // Validate the change
    if (!this.isValidChange(stateChange)) {
      throw new Error(`Invalid state change: ${JSON.stringify(stateChange)}`);
    }

    // Check if this path should be synchronized
    if (!this.shouldSyncPath(stateChange.sessionId, stateChange.path)) {
      return;
    }

    // Apply change locally first
    await this.applyLocalChange(stateChange);

    // Queue for synchronization
    await this.queueForSync(stateChange);

    this.emit('state-changed', stateChange);
  }

  /**
   * Synchronize state changes across all user sessions
   */
  private async queueForSync(change: StateChange): Promise<void> {
    const sessionId = change.sessionId;
    const policy = this.syncPolicies.get(sessionId);
    
    if (!policy) {
      console.warn(`No sync policy found for session ${sessionId}`);
      return;
    }

    // Add to pending changes
    if (!this.pendingChanges.has(sessionId)) {
      this.pendingChanges.set(sessionId, []);
    }
    this.pendingChanges.get(sessionId)!.push(change);

    // Update sync status
    const status = this.syncStatus.get(sessionId);
    if (status) {
      status.pendingChanges++;
      this.syncStatus.set(sessionId, status);
    }

    // Clear existing timer and set new one for batching
    const existingTimer = this.syncTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      await this.flushPendingChanges(sessionId);
    }, policy.syncDelay);

    this.syncTimers.set(sessionId, timer);
  }

  /**
   * Flush pending changes for a session
   */
  private async flushPendingChanges(sessionId: string): Promise<void> {
    const changes = this.pendingChanges.get(sessionId);
    if (!changes || changes.length === 0) {
      return;
    }

    try {
      // Get all user sessions for broadcasting
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        console.error(`Session ${sessionId} not found`);
        return;
      }

      const userSessions = await this.sessionManager.getUserSessions(session.userId);
      
      // Create sync batch
      const syncBatch = {
        batchId: this.generateBatchId(),
        sessionId,
        userId: session.userId,
        changes,
        timestamp: new Date(),
        version: this.incrementVersion(sessionId)
      };

      // Broadcast to other sessions via Redis pub/sub
      await this.broadcastSyncBatch(syncBatch, userSessions);

      // Clear pending changes
      this.pendingChanges.set(sessionId, []);
      
      // Update sync status
      const status = this.syncStatus.get(sessionId);
      if (status) {
        status.pendingChanges = 0;
        status.lastSyncTime = new Date();
        this.syncStatus.set(sessionId, status);
      }

      this.emit('sync-completed', { sessionId, batchId: syncBatch.batchId, changeCount: changes.length });

    } catch (error) {
      console.error('Failed to flush pending changes:', error);
      
      // Update error count
      const status = this.syncStatus.get(sessionId);
      if (status) {
        status.syncErrors++;
        this.syncStatus.set(sessionId, status);
      }

      this.emit('sync-error', { sessionId, error });
    }
  }

  /**
   * Broadcast sync batch to other user sessions
   */
  private async broadcastSyncBatch(syncBatch: any, userSessions: UserSession[]): Promise<void> {
    const policy = this.syncPolicies.get(syncBatch.sessionId);
    if (!policy) return;

    let payload = JSON.stringify(syncBatch);

    // Apply compression if enabled
    if (policy.enableCompression) {
      payload = await this.compressData(payload);
    }

    // Apply encryption if enabled
    if (policy.enableEncryption) {
      payload = await this.encryptData(payload);
    }

    // Broadcast via Redis pub/sub
    const channel = `sync:${syncBatch.userId}`;
    await this.redisPub.publish(channel, payload);

    // Also send directly via WebSocket for immediate delivery
    for (const session of userSessions) {
      if (session.sessionId === syncBatch.sessionId) continue; // Skip source session

      try {
        await this.sendDirectSync(session.sessionId, syncBatch);
      } catch (error) {
        // Fallback to Redis queue
        console.warn(`Direct sync failed for ${session.sessionId}, using Redis queue`);
        await this.redis.lpush(`sync_queue:${session.sessionId}`, payload);
      }
    }
  }

  /**
   * Send sync data directly via WebSocket
   */
  private async sendDirectSync(sessionId: string, syncBatch: any): Promise<void> {
    // This would integrate with the WebSocket connections from SessionManager
    // For now, we'll emit an event that can be handled by the WebSocket layer
    this.emit('direct-sync', { sessionId, syncBatch });
  }

  /**
   * Apply incoming sync batch from another session
   */
  async applyIncomingSyncBatch(batchData: string, targetSessionId: string): Promise<void> {
    try {
      const policy = this.syncPolicies.get(targetSessionId);
      if (!policy) return;

      let payload = batchData;

      // Decrypt if needed
      if (policy.enableEncryption) {
        payload = await this.decryptData(payload);
      }

      // Decompress if needed  
      if (policy.enableCompression) {
        payload = await this.decompressData(payload);
      }

      const syncBatch = JSON.parse(payload);

      // Detect conflicts
      const conflicts = await this.detectConflicts(targetSessionId, syncBatch.changes);
      
      if (conflicts.length > 0) {
        await this.handleConflicts(targetSessionId, conflicts);
      } else {
        // Apply changes directly
        for (const change of syncBatch.changes) {
          await this.applyRemoteChange(targetSessionId, change);
        }
      }

      // Update version
      const status = this.syncStatus.get(targetSessionId);
      if (status) {
        status.version = Math.max(status.version, syncBatch.version);
        status.lastSyncTime = new Date();
        this.syncStatus.set(targetSessionId, status);
      }

      this.emit('sync-applied', { 
        sessionId: targetSessionId, 
        batchId: syncBatch.batchId,
        conflicts: conflicts.length 
      });

    } catch (error) {
      console.error('Failed to apply incoming sync batch:', error);
      this.emit('sync-error', { sessionId: targetSessionId, error });
    }
  }

  /**
   * Detect conflicts between local and remote changes
   */
  private async detectConflicts(sessionId: string, remoteChanges: StateChange[]): Promise<SyncConflict[]> {
    const conflicts: SyncConflict[] = [];
    const localChanges = this.pendingChanges.get(sessionId) || [];

    for (const remoteChange of remoteChanges) {
      // Find local changes to the same path
      const conflictingLocal = localChanges.find(local => 
        local.path === remoteChange.path && 
        local.timestamp > remoteChange.timestamp
      );

      if (conflictingLocal) {
        const conflict: SyncConflict = {
          id: this.generateConflictId(),
          sessionId,
          path: remoteChange.path,
          localValue: conflictingLocal.newValue,
          remoteValue: remoteChange.newValue,
          timestamp: new Date()
        };

        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  /**
   * Handle sync conflicts based on policy
   */
  private async handleConflicts(sessionId: string, conflicts: SyncConflict[]): Promise<void> {
    const policy = this.syncPolicies.get(sessionId);
    if (!policy) return;

    // Store conflicts for potential manual resolution
    if (!this.conflicts.has(sessionId)) {
      this.conflicts.set(sessionId, []);
    }
    this.conflicts.get(sessionId)!.push(...conflicts);

    for (const conflict of conflicts) {
      switch (policy.conflictResolution) {
        case 'last-writer-wins':
          conflict.resolution = 'remote';
          conflict.resolvedValue = conflict.remoteValue;
          await this.applyConflictResolution(conflict);
          break;

        case 'merge':
          const mergedValue = await this.mergeConflictValues(conflict);
          conflict.resolution = 'merged';
          conflict.resolvedValue = mergedValue;
          await this.applyConflictResolution(conflict);
          break;

        case 'manual':
          // Emit event for manual resolution
          this.emit('conflict-detected', conflict);
          break;
      }
    }
  }

  /**
   * Merge conflicting values intelligently
   */
  private async mergeConflictValues(conflict: SyncConflict): Promise<any> {
    const { localValue, remoteValue, path } = conflict;

    // Handle different data types
    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      // Merge arrays (union)
      return [...new Set([...localValue, ...remoteValue])];
    }

    if (typeof localValue === 'object' && typeof remoteValue === 'object') {
      // Deep merge objects
      return { ...remoteValue, ...localValue };
    }

    // For primitive values, prefer local (user's current work)
    return localValue;
  }

  /**
   * Apply conflict resolution
   */
  private async applyConflictResolution(conflict: SyncConflict): Promise<void> {
    const change: StateChange = {
      id: this.generateChangeId(),
      sessionId: conflict.sessionId,
      timestamp: new Date(),
      path: conflict.path,
      oldValue: conflict.localValue,
      newValue: conflict.resolvedValue,
      operation: 'set',
      metadata: {
        userId: '',
        platform: 'sync-resolver',
        deviceId: 'conflict-resolution',
        version: this.getVersion(conflict.sessionId)
      }
    };

    await this.applyLocalChange(change);
    this.emit('conflict-resolved', conflict);
  }

  /**
   * Apply a local state change
   */
  private async applyLocalChange(change: StateChange): Promise<void> {
    // This would integrate with the actual application state management
    // For now, we'll store it in Redis for persistence
    await this.redis.lpush(`changes:${change.sessionId}`, JSON.stringify(change));
    await this.redis.expire(`changes:${change.sessionId}`, 24 * 60 * 60); // 24 hours
  }

  /**
   * Apply a remote state change
   */
  private async applyRemoteChange(sessionId: string, change: StateChange): Promise<void> {
    // Apply the change and emit event for the UI to update
    await this.applyLocalChange(change);
    this.emit('remote-change-applied', { sessionId, change });
  }

  /**
   * Check if a path should be synchronized
   */
  private shouldSyncPath(sessionId: string, path: string): boolean {
    const policy = this.syncPolicies.get(sessionId);
    if (!policy) return false;

    // Check exclude paths first
    for (const excludePath of policy.excludePaths) {
      if (path.startsWith(excludePath)) {
        return false;
      }
    }

    // Check include paths
    if (policy.syncPaths.includes('*')) {
      return true;
    }

    return policy.syncPaths.some(syncPath => path.startsWith(syncPath));
  }

  /**
   * Validate state change
   */
  private isValidChange(change: StateChange): boolean {
    return !!(change.sessionId && change.path && change.metadata);
  }

  /**
   * Initialize Redis connections
   */
  private async initializeRedis(): Promise<void> {
    try {
      await Promise.all([
        this.redis.connect(),
        this.redisPub.connect(),
        this.redisSub.connect()
      ]);
      console.log('State synchronizer Redis connections established');
    } catch (error) {
      console.error('Redis connection failed:', error);
    }
  }

  /**
   * Setup Redis pub/sub subscriptions
   */
  private setupSubscriptions(): void {
    this.redisSub.pSubscribe('sync:*', (message, channel) => {
      const userId = channel.split(':')[1];
      this.handleIncomingSyncMessage(userId, message);
    });
  }

  /**
   * Handle incoming sync message from Redis pub/sub
   */
  private async handleIncomingSyncMessage(userId: string, message: string): Promise<void> {
    try {
      // Find all active sessions for this user
      const userSessions = await this.sessionManager.getUserSessions(userId);
      
      for (const session of userSessions) {
        await this.applyIncomingSyncBatch(message, session.sessionId);
      }
    } catch (error) {
      console.error('Failed to handle incoming sync message:', error);
    }
  }

  /**
   * Get sync status for a session
   */
  getSyncStatus(sessionId: string): SyncStatus | null {
    return this.syncStatus.get(sessionId) || null;
  }

  /**
   * Get pending conflicts for a session
   */
  getConflicts(sessionId: string): SyncConflict[] {
    return this.conflicts.get(sessionId) || [];
  }

  /**
   * Manually resolve a conflict
   */
  async resolveConflict(conflictId: string, resolution: 'local' | 'remote' | 'custom', customValue?: any): Promise<void> {
    // Find the conflict
    let targetConflict: SyncConflict | null = null;
    let sessionId: string | null = null;

    for (const [sId, conflicts] of this.conflicts) {
      const conflict = conflicts.find(c => c.id === conflictId);
      if (conflict) {
        targetConflict = conflict;
        sessionId = sId;
        break;
      }
    }

    if (!targetConflict || !sessionId) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    // Apply resolution
    targetConflict.resolution = resolution;
    switch (resolution) {
      case 'local':
        targetConflict.resolvedValue = targetConflict.localValue;
        break;
      case 'remote':
        targetConflict.resolvedValue = targetConflict.remoteValue;
        break;
      case 'custom':
        targetConflict.resolvedValue = customValue;
        break;
    }

    await this.applyConflictResolution(targetConflict);

    // Remove from conflicts list
    const conflicts = this.conflicts.get(sessionId)!;
    const index = conflicts.findIndex(c => c.id === conflictId);
    if (index >= 0) {
      conflicts.splice(index, 1);
    }
  }

  // Utility methods
  private generateChangeId(): string {
    return `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBatchId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateConflictId(): string {
    return `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private incrementVersion(sessionId: string): number {
    const status = this.syncStatus.get(sessionId);
    if (status) {
      status.version++;
      return status.version;
    }
    return 1;
  }

  private getVersion(sessionId: string): number {
    const status = this.syncStatus.get(sessionId);
    return status ? status.version : 1;
  }

  // Placeholder methods for compression/encryption (would implement actual logic)
  private async compressData(data: string): Promise<string> {
    // Implement compression logic (e.g., using zlib)
    return data;
  }

  private async decompressData(data: string): Promise<string> {
    // Implement decompression logic
    return data;
  }

  private async encryptData(data: string): Promise<string> {
    // Implement encryption logic (e.g., using crypto)
    return data;
  }

  private async decryptData(data: string): Promise<string> {
    // Implement decryption logic
    return data;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    // Clear all timers
    for (const timer of this.syncTimers.values()) {
      clearTimeout(timer);
    }

    // Close Redis connections
    await Promise.all([
      this.redis.quit(),
      this.redisPub.quit(),
      this.redisSub.quit()
    ]);
  }
}

export default StateSynchronizer;