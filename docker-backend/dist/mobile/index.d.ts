/**
 * Mobile API Module Index
 *
 * Exports all mobile-related functionality for React Native/Expo support:
 * - Mobile-optimized API endpoints
 * - Offline sync protocol
 * - Push notification integration
 */
export { type MobileDevice, type MobileSession, type MobileProject, type MobileProjectDetail, type MobileFile, type MobileCollaborator, type MobileGitStatus, type MobileNotification, type PaginatedResponse, type MobileAuthenticatedRequest, type MobileApiDependencies, createMobileApiRouter, mobileAuthMiddleware, mobileCompressionMiddleware, compressResponse, decompressRequest, createMobileSession, validateMobileSession, revokeMobileSession, revokeDeviceSessions, revokeUserSessions, registerDevice, getDevice, getUserDevices, removeDevice, updatePushToken, addNotification, getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, transformProjectForMobile, transformFileForMobile, } from './api.js';
export { type SyncOperationType, type ConflictResolution, type SyncStatus, type SyncOperation, type SyncConflict, type FileVersion, type SyncQueueEntry, type SyncState, type SyncResult, type DeltaChange, type SyncStatusInfo, syncManager, SyncManager, hashContent, generateOperationId, computeLineDiff, threeWayMerge, } from './sync.js';
export { type PushTokenType, type NotificationType, type PushToken, type PushNotification, type PushResult, type BatchPushResult, type NotificationPreferences, pushNotificationService, PushNotificationService, NOTIFICATION_TEMPLATES, ANDROID_CHANNELS, IOS_CATEGORIES, } from './push.js';
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
import { pushNotificationService } from './push.js';
/**
 * Initialize mobile API with configuration
 */
export declare function initializeMobileApi(config?: MobileApiConfig): MobileApiInitResult;
/**
 * Get mobile API statistics
 */
export declare function getMobileApiStats(): {
    push: ReturnType<typeof pushNotificationService.getStats>;
    sync: ReturnType<typeof import('./sync.js').syncManager.getStats>;
};
/**
 * Clean up mobile API resources
 */
export declare function cleanupMobileApi(): {
    tokensRemoved: number;
    syncStatesCleared: number;
};
