/**
 * Mobile API Module Index
 *
 * Exports all mobile-related functionality for React Native/Expo support:
 * - Mobile-optimized API endpoints
 * - Offline sync protocol
 * - Push notification integration
 */

// ==================== API Exports ====================
export {
  // Types
  type MobileDevice,
  type MobileSession,
  type MobileProject,
  type MobileProjectDetail,
  type MobileFile,
  type MobileCollaborator,
  type MobileGitStatus,
  type MobileNotification,
  type PaginatedResponse,
  type MobileAuthenticatedRequest,
  type MobileApiDependencies,

  // Router Factory
  createMobileApiRouter,

  // Middleware
  mobileAuthMiddleware,
  mobileCompressionMiddleware,

  // Compression Utilities
  compressResponse,
  decompressRequest,

  // Session Management
  createMobileSession,
  validateMobileSession,
  revokeMobileSession,
  revokeDeviceSessions,
  revokeUserSessions,

  // Device Management
  registerDevice,
  getDevice,
  getUserDevices,
  removeDevice,
  updatePushToken,

  // Notification Management
  addNotification,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,

  // Transformers
  transformProjectForMobile,
  transformFileForMobile,
} from './api.js';

// ==================== Sync Exports ====================
export {
  // Types
  type SyncOperationType,
  type ConflictResolution,
  type SyncStatus,
  type SyncOperation,
  type SyncConflict,
  type FileVersion,
  type SyncQueueEntry,
  type SyncState,
  type SyncResult,
  type DeltaChange,
  type SyncStatusInfo,

  // Sync Manager
  syncManager,
  SyncManager,

  // Utilities
  hashContent,
  generateOperationId,
  computeLineDiff,
  threeWayMerge,
} from './sync.js';

// ==================== Push Notification Exports ====================
export {
  // Types
  type PushTokenType,
  type NotificationType,
  type PushToken,
  type PushNotification,
  type PushResult,
  type BatchPushResult,
  type NotificationPreferences,

  // Push Service
  pushNotificationService,
  PushNotificationService,

  // Templates
  NOTIFICATION_TEMPLATES,
  ANDROID_CHANNELS,
  IOS_CATEGORIES,
} from './push.js';

// ==================== Combined Types ====================

/**
 * Mobile API configuration options
 */
export interface MobileApiConfig {
  /** Enable compression for responses */
  enableCompression?: boolean;
  /** Compression threshold in bytes */
  compressionThreshold?: number;
  /** Default page size for paginated responses */
  defaultPageSize?: number;
  /** Maximum page size for paginated responses */
  maxPageSize?: number;
  /** Session TTL in milliseconds */
  sessionTTL?: number;
  /** FCM server key for Android push notifications */
  fcmServerKey?: string;
  /** APNS configuration for iOS push notifications */
  apnsConfig?: {
    keyId: string;
    teamId: string;
    bundleId: string;
    key: string;
  };
}

/**
 * Mobile API initialization result
 */
export interface MobileApiInitResult {
  /** Whether initialization was successful */
  success: boolean;
  /** Error message if initialization failed */
  error?: string;
  /** Push notification service configured */
  pushConfigured: boolean;
  /** Sync manager initialized */
  syncInitialized: boolean;
}

// ==================== Initialization ====================

import { pushNotificationService } from './push.js';

/**
 * Initialize mobile API with configuration
 */
export function initializeMobileApi(config: MobileApiConfig = {}): MobileApiInitResult {
  let pushConfigured = false;

  // Configure FCM if server key provided
  if (config.fcmServerKey) {
    pushNotificationService.configureFCM(config.fcmServerKey);
    pushConfigured = true;
  }

  // Configure APNS if config provided
  if (config.apnsConfig) {
    pushNotificationService.configureAPNS(config.apnsConfig);
    pushConfigured = true;
  }

  console.log('[Mobile] API initialized', {
    pushConfigured,
    compression: config.enableCompression !== false,
    defaultPageSize: config.defaultPageSize || 20,
  });

  return {
    success: true,
    pushConfigured,
    syncInitialized: true,
  };
}

/**
 * Get mobile API statistics
 */
export function getMobileApiStats(): {
  push: ReturnType<typeof pushNotificationService.getStats>;
  sync: ReturnType<typeof import('./sync.js').syncManager.getStats>;
} {
  const { syncManager } = require('./sync.js');

  return {
    push: pushNotificationService.getStats(),
    sync: syncManager.getStats(),
  };
}

/**
 * Clean up mobile API resources
 */
export function cleanupMobileApi(): { tokensRemoved: number; syncStatesCleared: number } {
  const { syncManager } = require('./sync.js');

  const tokensRemoved = pushNotificationService.cleanupInvalidTokens();

  // Note: We don't clear sync states automatically as they contain important data
  // This is just returning current counts
  const stats = syncManager.getStats();

  return {
    tokensRemoved,
    syncStatesCleared: 0, // Would need explicit user/project cleanup
  };
}
