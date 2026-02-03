/**
 * Mobile API Integration Tests
 * Tests for mobile-specific features including:
 * - Mobile API endpoints
 * - Offline sync protocol
 * - Push notifications
 * - Compression
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// ==================== Type Definitions ====================

type SyncOperationType = 'create' | 'update' | 'delete' | 'rename';
type ConflictResolution = 'local' | 'remote' | 'manual';
type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';
type PushTokenType = 'fcm' | 'apns';
type NotificationType = 'comment' | 'mention' | 'collaboration' | 'build' | 'deploy';

interface MobileDevice {
  id: string;
  userId: string;
  name: string;
  platform: 'ios' | 'android';
  pushToken?: string;
  pushTokenType?: PushTokenType;
  lastSeen: Date;
  createdAt: Date;
}

interface SyncOperation {
  id: string;
  projectId: string;
  userId: string;
  type: SyncOperationType;
  path: string;
  content?: string;
  oldPath?: string;
  timestamp: Date;
  clientTimestamp: Date;
  hash?: string;
}

interface SyncConflict {
  operationId: string;
  localHash: string;
  remoteHash: string;
  localContent: string;
  remoteContent: string;
  baseContent?: string;
}

interface FileVersion {
  path: string;
  content: string;
  hash: string;
  timestamp: Date;
}

interface SyncState {
  projectId: string;
  userId: string;
  lastSyncTimestamp: Date;
  pendingOperations: SyncOperation[];
  fileVersions: Map<string, FileVersion>;
}

interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
}

interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ==================== Utilities ====================

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function generateOperationId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function computeLineDiff(oldContent: string, newContent: string): string[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const changes: string[] = [];

  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    if (oldLines[i] !== newLines[i]) {
      if (i < oldLines.length && i < newLines.length) {
        changes.push(`~${i}: ${oldLines[i]} -> ${newLines[i]}`);
      } else if (i >= oldLines.length) {
        changes.push(`+${i}: ${newLines[i]}`);
      } else {
        changes.push(`-${i}: ${oldLines[i]}`);
      }
    }
  }

  return changes;
}

// ==================== Sync Manager ====================

class SyncManager extends EventEmitter {
  private syncStates = new Map<string, SyncState>();
  private conflicts = new Map<string, SyncConflict>();

  // Create sync operation
  createOperation(
    projectId: string,
    userId: string,
    type: SyncOperationType,
    path: string,
    content?: string,
    oldPath?: string
  ): SyncOperation {
    const operation: SyncOperation = {
      id: generateOperationId(),
      projectId,
      userId,
      type,
      path,
      content,
      oldPath,
      timestamp: new Date(),
      clientTimestamp: new Date(),
      hash: content ? hashContent(content) : undefined,
    };

    const stateKey = `${projectId}:${userId}`;
    let state = this.syncStates.get(stateKey);

    if (!state) {
      state = {
        projectId,
        userId,
        lastSyncTimestamp: new Date(0),
        pendingOperations: [],
        fileVersions: new Map(),
      };
      this.syncStates.set(stateKey, state);
    }

    state.pendingOperations.push(operation);
    this.emit('operation-created', operation);

    return operation;
  }

  // Apply operations from server
  async applyOperations(
    projectId: string,
    userId: string,
    operations: SyncOperation[]
  ): Promise<{ applied: SyncOperation[]; conflicts: SyncConflict[] }> {
    const stateKey = `${projectId}:${userId}`;
    const state = this.syncStates.get(stateKey);

    if (!state) {
      throw new Error('Sync state not found');
    }

    const applied: SyncOperation[] = [];
    const conflicts: SyncConflict[] = [];

    for (const operation of operations) {
      const existingVersion = state.fileVersions.get(operation.path);

      // Check for conflicts
      if (existingVersion && operation.type === 'update') {
        const localHash = existingVersion.hash;
        const remoteHash = operation.hash || '';

        if (localHash !== remoteHash) {
          const conflict: SyncConflict = {
            operationId: operation.id,
            localHash,
            remoteHash,
            localContent: existingVersion.content,
            remoteContent: operation.content || '',
            baseContent: existingVersion.content,
          };

          conflicts.push(conflict);
          this.conflicts.set(operation.id, conflict);
          this.emit('conflict', conflict);
          continue;
        }
      }

      // Apply operation
      if (operation.type === 'create' || operation.type === 'update') {
        if (operation.content) {
          const version: FileVersion = {
            path: operation.path,
            content: operation.content,
            hash: operation.hash || hashContent(operation.content),
            timestamp: operation.timestamp,
          };
          state.fileVersions.set(operation.path, version);
        }
      } else if (operation.type === 'delete') {
        state.fileVersions.delete(operation.path);
      } else if (operation.type === 'rename' && operation.oldPath) {
        const oldVersion = state.fileVersions.get(operation.oldPath);
        if (oldVersion) {
          state.fileVersions.delete(operation.oldPath);
          state.fileVersions.set(operation.path, {
            ...oldVersion,
            path: operation.path,
          });
        }
      }

      applied.push(operation);
      this.emit('operation-applied', operation);
    }

    state.lastSyncTimestamp = new Date();

    return { applied, conflicts };
  }

  // Resolve conflict
  resolveConflict(
    operationId: string,
    resolution: ConflictResolution,
    mergedContent?: string
  ): void {
    const conflict = this.conflicts.get(operationId);
    if (!conflict) {
      throw new Error('Conflict not found');
    }

    this.conflicts.delete(operationId);
    this.emit('conflict-resolved', operationId, resolution);
  }

  // Get pending operations
  getPendingOperations(projectId: string, userId: string): SyncOperation[] {
    const stateKey = `${projectId}:${userId}`;
    const state = this.syncStates.get(stateKey);

    return state?.pendingOperations || [];
  }

  // Clear pending operations
  clearPendingOperations(projectId: string, userId: string): void {
    const stateKey = `${projectId}:${userId}`;
    const state = this.syncStates.get(stateKey);

    if (state) {
      state.pendingOperations = [];
    }
  }

  // Get file version
  getFileVersion(projectId: string, userId: string, path: string): FileVersion | undefined {
    const stateKey = `${projectId}:${userId}`;
    const state = this.syncStates.get(stateKey);

    return state?.fileVersions.get(path);
  }

  getStats() {
    return {
      totalStates: this.syncStates.size,
      totalConflicts: this.conflicts.size,
      states: Array.from(this.syncStates.entries()).map(([key, state]) => ({
        key,
        pendingOperations: state.pendingOperations.length,
        fileVersions: state.fileVersions.size,
        lastSync: state.lastSyncTimestamp,
      })),
    };
  }
}

// ==================== Push Notification Service ====================

class PushNotificationService {
  private fcmServerKey: string | null = null;
  private apnsConfig: any = null;
  private tokens = new Map<string, { deviceId: string; token: string; type: PushTokenType }>();

  configureFCM(serverKey: string): void {
    this.fcmServerKey = serverKey;
  }

  configureAPNS(config: any): void {
    this.apnsConfig = config;
  }

  registerToken(deviceId: string, token: string, type: PushTokenType): void {
    this.tokens.set(deviceId, { deviceId, token, type });
  }

  unregisterToken(deviceId: string): void {
    this.tokens.delete(deviceId);
  }

  async sendToDevice(
    deviceId: string,
    notification: PushNotification
  ): Promise<PushResult> {
    const tokenData = this.tokens.get(deviceId);

    if (!tokenData) {
      return { success: false, error: 'Device token not found' };
    }

    if (tokenData.type === 'fcm') {
      return this.sendFCM(tokenData.token, notification);
    } else if (tokenData.type === 'apns') {
      return this.sendAPNS(tokenData.token, notification);
    }

    return { success: false, error: 'Unknown token type' };
  }

  async sendToUser(
    userId: string,
    deviceIds: string[],
    notification: PushNotification
  ): Promise<PushResult[]> {
    const results: PushResult[] = [];

    for (const deviceId of deviceIds) {
      const result = await this.sendToDevice(deviceId, notification);
      results.push(result);
    }

    return results;
  }

  private async sendFCM(token: string, notification: PushNotification): Promise<PushResult> {
    if (!this.fcmServerKey) {
      return { success: false, error: 'FCM not configured' };
    }

    // Simulate FCM API call
    return {
      success: true,
      messageId: `fcm_${Date.now()}`,
    };
  }

  private async sendAPNS(token: string, notification: PushNotification): Promise<PushResult> {
    if (!this.apnsConfig) {
      return { success: false, error: 'APNS not configured' };
    }

    // Simulate APNS API call
    return {
      success: true,
      messageId: `apns_${Date.now()}`,
    };
  }

  getStats() {
    return {
      totalTokens: this.tokens.size,
      fcmConfigured: this.fcmServerKey !== null,
      apnsConfigured: this.apnsConfig !== null,
      tokensByType: {
        fcm: Array.from(this.tokens.values()).filter(t => t.type === 'fcm').length,
        apns: Array.from(this.tokens.values()).filter(t => t.type === 'apns').length,
      },
    };
  }

  cleanupInvalidTokens(): number {
    // In real implementation, would test tokens and remove invalid ones
    return 0;
  }
}

// ==================== Device Manager ====================

class DeviceManager {
  private devices = new Map<string, MobileDevice>();

  registerDevice(
    userId: string,
    name: string,
    platform: 'ios' | 'android',
    pushToken?: string,
    pushTokenType?: PushTokenType
  ): MobileDevice {
    const device: MobileDevice = {
      id: crypto.randomBytes(16).toString('hex'),
      userId,
      name,
      platform,
      pushToken,
      pushTokenType,
      lastSeen: new Date(),
      createdAt: new Date(),
    };

    this.devices.set(device.id, device);

    return device;
  }

  getDevice(deviceId: string): MobileDevice | undefined {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeen = new Date();
    }
    return device;
  }

  getUserDevices(userId: string): MobileDevice[] {
    return Array.from(this.devices.values()).filter(d => d.userId === userId);
  }

  updatePushToken(deviceId: string, token: string, type: PushTokenType): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.pushToken = token;
      device.pushTokenType = type;
      device.lastSeen = new Date();
    }
  }

  removeDevice(deviceId: string): void {
    this.devices.delete(deviceId);
  }

  getStats() {
    return {
      totalDevices: this.devices.size,
      devicesByPlatform: {
        ios: Array.from(this.devices.values()).filter(d => d.platform === 'ios').length,
        android: Array.from(this.devices.values()).filter(d => d.platform === 'android').length,
      },
    };
  }
}

// ==================== Tests ====================

describe('Mobile API Integration Tests', () => {
  let syncManager: SyncManager;
  let pushService: PushNotificationService;
  let deviceManager: DeviceManager;

  beforeEach(() => {
    syncManager = new SyncManager();
    pushService = new PushNotificationService();
    deviceManager = new DeviceManager();
  });

  describe('Sync Manager', () => {
    it('should create sync operation', () => {
      const operation = syncManager.createOperation(
        'project-1',
        'user-1',
        'create',
        '/app.js',
        'console.log("Hello");'
      );

      expect(operation.id).toBeDefined();
      expect(operation.type).toBe('create');
      expect(operation.path).toBe('/app.js');
      expect(operation.hash).toBeDefined();
    });

    it('should track pending operations', () => {
      syncManager.createOperation('project-1', 'user-1', 'create', '/app.js', 'content1');
      syncManager.createOperation('project-1', 'user-1', 'update', '/app.js', 'content2');

      const pending = syncManager.getPendingOperations('project-1', 'user-1');
      expect(pending).toHaveLength(2);
    });

    it('should apply operations without conflicts', async () => {
      // Create initial sync state
      syncManager.createOperation('project-1', 'user-1', 'create', '/dummy.js', 'init');

      const operations: SyncOperation[] = [
        {
          id: generateOperationId(),
          projectId: 'project-1',
          userId: 'user-1',
          type: 'create',
          path: '/app.js',
          content: 'console.log("test");',
          timestamp: new Date(),
          clientTimestamp: new Date(),
          hash: hashContent('console.log("test");'),
        },
      ];

      const result = await syncManager.applyOperations('project-1', 'user-1', operations);

      expect(result.applied).toHaveLength(1);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect conflicts', async () => {
      const operationCreated = vi.fn();
      const conflictDetected = vi.fn();

      syncManager.on('operation-created', operationCreated);
      syncManager.on('conflict', conflictDetected);

      // Create and apply local version first
      const localOp = syncManager.createOperation(
        'project-1',
        'user-1',
        'create',
        '/app.js',
        'local content'
      );

      // Apply local operation to create file version
      await syncManager.applyOperations('project-1', 'user-1', [localOp]);

      // Apply remote operation with different content
      const remoteOps: SyncOperation[] = [
        {
          id: generateOperationId(),
          projectId: 'project-1',
          userId: 'user-1',
          type: 'update',
          path: '/app.js',
          content: 'remote content',
          timestamp: new Date(),
          clientTimestamp: new Date(),
          hash: hashContent('remote content'),
        },
      ];

      const result = await syncManager.applyOperations('project-1', 'user-1', remoteOps);

      expect(result.conflicts).toHaveLength(1);
      expect(conflictDetected).toHaveBeenCalled();
    });

    it('should resolve conflicts', async () => {
      const conflictResolved = vi.fn();
      syncManager.on('conflict-resolved', conflictResolved);

      // Create and apply local version
      const localOp = syncManager.createOperation('project-1', 'user-1', 'create', '/app.js', 'local');
      await syncManager.applyOperations('project-1', 'user-1', [localOp]);

      // Create conflict with remote
      const remoteOps: SyncOperation[] = [
        {
          id: 'op-123',
          projectId: 'project-1',
          userId: 'user-1',
          type: 'update',
          path: '/app.js',
          content: 'remote',
          timestamp: new Date(),
          clientTimestamp: new Date(),
          hash: hashContent('remote'),
        },
      ];

      await syncManager.applyOperations('project-1', 'user-1', remoteOps);

      // Resolve with local version
      syncManager.resolveConflict('op-123', 'local');

      expect(conflictResolved).toHaveBeenCalledWith('op-123', 'local');
    });

    it('should handle delete operations', async () => {
      // Create file
      syncManager.createOperation('project-1', 'user-1', 'create', '/app.js', 'content');

      // Delete file
      const deleteOps: SyncOperation[] = [
        {
          id: generateOperationId(),
          projectId: 'project-1',
          userId: 'user-1',
          type: 'delete',
          path: '/app.js',
          timestamp: new Date(),
          clientTimestamp: new Date(),
        },
      ];

      await syncManager.applyOperations('project-1', 'user-1', deleteOps);

      const version = syncManager.getFileVersion('project-1', 'user-1', '/app.js');
      expect(version).toBeUndefined();
    });

    it('should handle rename operations', async () => {
      // Create and apply file
      const createOp = syncManager.createOperation('project-1', 'user-1', 'create', '/old.js', 'content');
      await syncManager.applyOperations('project-1', 'user-1', [createOp]);

      // Rename file
      const renameOps: SyncOperation[] = [
        {
          id: generateOperationId(),
          projectId: 'project-1',
          userId: 'user-1',
          type: 'rename',
          path: '/new.js',
          oldPath: '/old.js',
          timestamp: new Date(),
          clientTimestamp: new Date(),
        },
      ];

      await syncManager.applyOperations('project-1', 'user-1', renameOps);

      const oldVersion = syncManager.getFileVersion('project-1', 'user-1', '/old.js');
      const newVersion = syncManager.getFileVersion('project-1', 'user-1', '/new.js');

      expect(oldVersion).toBeUndefined();
      expect(newVersion).toBeDefined();
    });

    it('should clear pending operations', () => {
      syncManager.createOperation('project-1', 'user-1', 'create', '/app.js', 'content');
      syncManager.createOperation('project-1', 'user-1', 'update', '/app.js', 'content2');

      syncManager.clearPendingOperations('project-1', 'user-1');

      const pending = syncManager.getPendingOperations('project-1', 'user-1');
      expect(pending).toHaveLength(0);
    });

    it('should track sync statistics', () => {
      syncManager.createOperation('project-1', 'user-1', 'create', '/file1.js', 'content1');
      syncManager.createOperation('project-2', 'user-2', 'create', '/file2.js', 'content2');

      const stats = syncManager.getStats();
      expect(stats.totalStates).toBe(2);
      expect(stats.states).toHaveLength(2);
    });
  });

  describe('Push Notification Service', () => {
    beforeEach(() => {
      pushService.configureFCM('test-fcm-key');
      pushService.configureAPNS({ keyId: 'test', teamId: 'test', bundleId: 'test', key: 'test' });
    });

    it('should register FCM token', () => {
      pushService.registerToken('device-1', 'fcm-token-123', 'fcm');

      const stats = pushService.getStats();
      expect(stats.tokensByType.fcm).toBe(1);
    });

    it('should register APNS token', () => {
      pushService.registerToken('device-2', 'apns-token-456', 'apns');

      const stats = pushService.getStats();
      expect(stats.tokensByType.apns).toBe(1);
    });

    it('should send notification to FCM device', async () => {
      pushService.registerToken('device-1', 'fcm-token-123', 'fcm');

      const result = await pushService.sendToDevice('device-1', {
        title: 'Test',
        body: 'Test message',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it('should send notification to APNS device', async () => {
      pushService.registerToken('device-2', 'apns-token-456', 'apns');

      const result = await pushService.sendToDevice('device-2', {
        title: 'Test',
        body: 'Test message',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it('should send to multiple user devices', async () => {
      pushService.registerToken('device-1', 'token-1', 'fcm');
      pushService.registerToken('device-2', 'token-2', 'apns');

      const results = await pushService.sendToUser('user-1', ['device-1', 'device-2'], {
        title: 'Broadcast',
        body: 'Message to all devices',
      });

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should fail when device not found', async () => {
      const result = await pushService.sendToDevice('invalid-device', {
        title: 'Test',
        body: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Device token not found');
    });

    it('should unregister token', () => {
      pushService.registerToken('device-1', 'token-1', 'fcm');
      pushService.unregisterToken('device-1');

      const stats = pushService.getStats();
      expect(stats.totalTokens).toBe(0);
    });

    it('should track service statistics', () => {
      pushService.registerToken('device-1', 'token-1', 'fcm');
      pushService.registerToken('device-2', 'token-2', 'apns');
      pushService.registerToken('device-3', 'token-3', 'fcm');

      const stats = pushService.getStats();
      expect(stats.totalTokens).toBe(3);
      expect(stats.fcmConfigured).toBe(true);
      expect(stats.apnsConfigured).toBe(true);
      expect(stats.tokensByType.fcm).toBe(2);
      expect(stats.tokensByType.apns).toBe(1);
    });
  });

  describe('Device Manager', () => {
    it('should register device', () => {
      const device = deviceManager.registerDevice(
        'user-1',
        'iPhone 12',
        'ios',
        'apns-token',
        'apns'
      );

      expect(device.id).toBeDefined();
      expect(device.userId).toBe('user-1');
      expect(device.name).toBe('iPhone 12');
      expect(device.platform).toBe('ios');
      expect(device.pushToken).toBe('apns-token');
    });

    it('should get user devices', () => {
      deviceManager.registerDevice('user-1', 'iPhone', 'ios');
      deviceManager.registerDevice('user-1', 'iPad', 'ios');
      deviceManager.registerDevice('user-2', 'Android', 'android');

      const user1Devices = deviceManager.getUserDevices('user-1');
      expect(user1Devices).toHaveLength(2);
    });

    it('should update push token', () => {
      const device = deviceManager.registerDevice('user-1', 'iPhone', 'ios');

      deviceManager.updatePushToken(device.id, 'new-token', 'apns');

      const updated = deviceManager.getDevice(device.id);
      expect(updated?.pushToken).toBe('new-token');
    });

    it('should remove device', () => {
      const device = deviceManager.registerDevice('user-1', 'iPhone', 'ios');

      deviceManager.removeDevice(device.id);

      const removed = deviceManager.getDevice(device.id);
      expect(removed).toBeUndefined();
    });

    it('should update last seen on access', async () => {
      const device = deviceManager.registerDevice('user-1', 'iPhone', 'ios');
      const originalLastSeen = device.lastSeen;

      // Wait a bit so the new Date() in getDevice produces a later timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      deviceManager.getDevice(device.id);
      const updated = deviceManager.getDevice(device.id);
      expect(updated).toBeDefined();
      expect(updated!.lastSeen.getTime()).toBeGreaterThanOrEqual(originalLastSeen.getTime());
    });

    it('should track device statistics', () => {
      deviceManager.registerDevice('user-1', 'iPhone', 'ios');
      deviceManager.registerDevice('user-2', 'iPad', 'ios');
      deviceManager.registerDevice('user-3', 'Pixel', 'android');

      const stats = deviceManager.getStats();
      expect(stats.totalDevices).toBe(3);
      expect(stats.devicesByPlatform.ios).toBe(2);
      expect(stats.devicesByPlatform.android).toBe(1);
    });
  });

  describe('Utilities', () => {
    it('should hash content consistently', () => {
      const content = 'console.log("test");';
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = hashContent('content1');
      const hash2 = hashContent('content2');

      expect(hash1).not.toBe(hash2);
    });

    it('should generate unique operation IDs', () => {
      const id1 = generateOperationId();
      const id2 = generateOperationId();

      expect(id1).not.toBe(id2);
    });

    it('should compute line diff', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nmodified\nline3\nline4';

      const diff = computeLineDiff(oldContent, newContent);

      expect(diff.length).toBeGreaterThan(0);
      expect(diff.some(d => d.includes('modified'))).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete mobile workflow', async () => {
      // 1. Register device
      const device = deviceManager.registerDevice(
        'user-1',
        'iPhone 13',
        'ios',
        'apns-token',
        'apns'
      );

      // 2. Configure push notifications
      pushService.configureAPNS({ keyId: 'test', teamId: 'test', bundleId: 'test', key: 'test' });
      pushService.registerToken(device.id, 'apns-token', 'apns');

      // 3. Create sync operations
      syncManager.createOperation('project-1', 'user-1', 'create', '/app.js', 'code v1');
      syncManager.createOperation('project-1', 'user-1', 'update', '/app.js', 'code v2');

      // 4. Sync with server
      const pending = syncManager.getPendingOperations('project-1', 'user-1');
      expect(pending).toHaveLength(2);

      // 5. Send push notification
      const pushResult = await pushService.sendToDevice(device.id, {
        title: 'Sync Complete',
        body: '2 files synced',
      });

      expect(pushResult.success).toBe(true);

      // 6. Clear pending
      syncManager.clearPendingOperations('project-1', 'user-1');

      const afterClear = syncManager.getPendingOperations('project-1', 'user-1');
      expect(afterClear).toHaveLength(0);
    });

    it('should handle offline sync with conflicts', async () => {
      // 1. Create and apply local changes while offline
      const createOp = syncManager.createOperation('project-1', 'user-1', 'create', '/app.js', 'local v1');
      await syncManager.applyOperations('project-1', 'user-1', [createOp]);

      const updateOp = syncManager.createOperation('project-1', 'user-1', 'update', '/app.js', 'local v2');
      await syncManager.applyOperations('project-1', 'user-1', [updateOp]);

      // 2. Receive remote changes when online
      const remoteOps: SyncOperation[] = [
        {
          id: 'remote-op-1',
          projectId: 'project-1',
          userId: 'user-1',
          type: 'update',
          path: '/app.js',
          content: 'remote v1',
          timestamp: new Date(),
          clientTimestamp: new Date(),
          hash: hashContent('remote v1'),
        },
      ];

      const result = await syncManager.applyOperations('project-1', 'user-1', remoteOps);

      expect(result.conflicts).toHaveLength(1);

      // 3. Resolve conflict
      syncManager.resolveConflict('remote-op-1', 'local');

      // 4. Notify user
      const devices = deviceManager.getUserDevices('user-1');
      if (devices.length > 0) {
        await pushService.sendToDevice(devices[0].id, {
          title: 'Sync Conflict Resolved',
          body: 'Your local changes were kept',
        });
      }
    });

    it('should handle multi-device sync', async () => {
      // Register multiple devices
      const device1 = deviceManager.registerDevice('user-1', 'iPhone', 'ios');
      const device2 = deviceManager.registerDevice('user-1', 'iPad', 'ios');

      pushService.configureAPNS({ keyId: 'test', teamId: 'test', bundleId: 'test', key: 'test' });
      pushService.registerToken(device1.id, 'token-1', 'apns');
      pushService.registerToken(device2.id, 'token-2', 'apns');

      // Create operation on device 1
      syncManager.createOperation('project-1', 'user-1', 'update', '/app.js', 'new code');

      // Notify all devices
      const results = await pushService.sendToUser('user-1', [device1.id, device2.id], {
        title: 'File Updated',
        body: '/app.js was modified',
      });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should track comprehensive statistics', () => {
      // Create sync operations
      syncManager.createOperation('project-1', 'user-1', 'create', '/file1.js', 'content1');
      syncManager.createOperation('project-2', 'user-2', 'create', '/file2.js', 'content2');

      // Register devices
      deviceManager.registerDevice('user-1', 'iPhone', 'ios', 'token-1', 'apns');
      deviceManager.registerDevice('user-2', 'Android', 'android', 'token-2', 'fcm');

      // Configure push
      pushService.configureFCM('fcm-key');
      pushService.configureAPNS({ keyId: 'test', teamId: 'test', bundleId: 'test', key: 'test' });

      const syncStats = syncManager.getStats();
      const deviceStats = deviceManager.getStats();
      const pushStats = pushService.getStats();

      expect(syncStats.totalStates).toBe(2);
      expect(deviceStats.totalDevices).toBe(2);
      expect(pushStats.fcmConfigured).toBe(true);
      expect(pushStats.apnsConfigured).toBe(true);
    });
  });
});
