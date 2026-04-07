/**
 * Mobile API Endpoints for React Native/Expo Support
 *
 * Provides mobile-optimized API endpoints with:
 * - Compressed responses for bandwidth efficiency
 * - Pagination for large data sets
 * - Offline-first support with sync endpoints
 * - Push notification hooks
 * - Mobile session management (longer TTL, device tracking)
 */
import type { Request, Response, NextFunction, Router } from 'express';
import { NotificationType, PushTokenType } from './push.js';
export interface MobileDevice {
    id: string;
    userId: string;
    deviceId: string;
    deviceName: string;
    platform: 'ios' | 'android' | 'web';
    appVersion: string;
    osVersion: string;
    pushToken?: string;
    pushTokenType?: PushTokenType;
    lastActive: number;
    createdAt: number;
    sessionToken: string;
    sessionExpiry: number;
}
export interface MobileSession {
    id: string;
    userId: string;
    deviceId: string;
    token: string;
    createdAt: number;
    expiresAt: number;
    lastActivity: number;
    ipAddress?: string;
    userAgent?: string;
}
export interface MobileProject {
    id: string;
    name: string;
    description?: string;
    template?: string;
    language?: string;
    framework?: string;
    createdAt: number;
    updatedAt: number;
    lastOpenedAt?: number;
    thumbnailUrl?: string;
    fileCount: number;
    totalSize: number;
    isStarred: boolean;
    syncStatus: 'synced' | 'pending' | 'conflict';
    lastSyncAt?: number;
}
export interface MobileProjectDetail extends MobileProject {
    files: MobileFile[];
    recentFiles: string[];
    collaborators: MobileCollaborator[];
    gitBranch?: string;
    gitStatus?: MobileGitStatus;
    devServerUrl?: string;
    previewUrl?: string;
}
export interface MobileFile {
    path: string;
    name: string;
    type: 'file' | 'directory';
    size?: number;
    modifiedAt: number;
    mimeType?: string;
    isNew?: boolean;
    isModified?: boolean;
    isDeleted?: boolean;
}
export interface MobileCollaborator {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    role: 'owner' | 'editor' | 'viewer';
    isOnline: boolean;
    cursor?: {
        file: string;
        line: number;
        column: number;
    };
}
export interface MobileGitStatus {
    branch: string;
    ahead: number;
    behind: number;
    staged: string[];
    unstaged: string[];
    untracked: string[];
}
export interface MobileNotification {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    read: boolean;
    createdAt: number;
    expiresAt?: number;
}
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
    nextCursor?: string;
}
export interface MobileAuthenticatedRequest extends Request {
    userId?: string;
    deviceId?: string;
    sessionId?: string;
    mobileSession?: MobileSession;
}
/**
 * Compress data for mobile transfer
 */
export declare function compressResponse(data: unknown): Promise<{
    compressed: Buffer;
    originalSize: number;
    compressedSize: number;
}>;
/**
 * Decompress data from mobile
 */
export declare function decompressRequest(data: Buffer, isCompressed: boolean): Promise<unknown>;
/**
 * Create mobile session
 */
export declare function createMobileSession(userId: string, deviceId: string, ipAddress?: string, userAgent?: string): MobileSession;
/**
 * Validate and refresh mobile session
 */
export declare function validateMobileSession(token: string): MobileSession | null;
/**
 * Revoke mobile session
 */
export declare function revokeMobileSession(token: string): boolean;
/**
 * Revoke all sessions for a device
 */
export declare function revokeDeviceSessions(deviceId: string): number;
/**
 * Revoke all sessions for a user
 */
export declare function revokeUserSessions(userId: string): number;
/**
 * Register a new mobile device
 */
export declare function registerDevice(userId: string, deviceInfo: {
    deviceName: string;
    platform: 'ios' | 'android' | 'web';
    appVersion: string;
    osVersion: string;
    pushToken?: string;
    pushTokenType?: PushTokenType;
}, ipAddress?: string, userAgent?: string): {
    device: MobileDevice;
    session: MobileSession;
};
/**
 * Get device by ID
 */
export declare function getDevice(deviceId: string): MobileDevice | undefined;
/**
 * Get all devices for a user
 */
export declare function getUserDevices(userId: string): MobileDevice[];
/**
 * Remove a device
 */
export declare function removeDevice(deviceId: string): boolean;
/**
 * Update push token for a device
 */
export declare function updatePushToken(deviceId: string, pushToken: string, pushTokenType: PushTokenType): boolean;
/**
 * Add notification for a user
 */
export declare function addNotification(userId: string, notification: Omit<MobileNotification, 'id' | 'read' | 'createdAt'>): MobileNotification;
/**
 * Get notifications for a user
 */
export declare function getNotifications(userId: string, options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
}): PaginatedResponse<MobileNotification>;
/**
 * Mark notification as read
 */
export declare function markNotificationRead(userId: string, notificationId: string): boolean;
/**
 * Mark all notifications as read
 */
export declare function markAllNotificationsRead(userId: string): number;
/**
 * Delete notification
 */
export declare function deleteNotification(userId: string, notificationId: string): boolean;
/**
 * Mobile authentication middleware
 */
export declare function mobileAuthMiddleware(req: MobileAuthenticatedRequest, res: Response, next: NextFunction): void;
/**
 * Compression middleware for mobile responses
 */
export declare function mobileCompressionMiddleware(req: Request, res: Response, next: NextFunction): void;
/**
 * Transform project data for mobile consumption
 */
export declare function transformProjectForMobile(project: Record<string, unknown>): MobileProject;
/**
 * Transform file data for mobile consumption
 */
export declare function transformFileForMobile(file: Record<string, unknown>): MobileFile;
/**
 * Interface for project data fetching (to be implemented by the main app)
 */
export interface MobileApiDependencies {
    fetchUserProjects: (userId: string, options?: {
        limit?: number;
        offset?: number;
        search?: string;
        sortBy?: 'name' | 'updatedAt' | 'createdAt';
        sortOrder?: 'asc' | 'desc';
    }) => Promise<{
        projects: Record<string, unknown>[];
        total: number;
    }>;
    fetchProjectDetail: (userId: string, projectId: string) => Promise<Record<string, unknown> | null>;
    fetchProjectFiles: (userId: string, projectId: string, path?: string) => Promise<Record<string, unknown>[]>;
    checkProjectOwnership: (userId: string, projectId: string) => Promise<boolean>;
    getContainer: (projectId: string) => {
        id: string;
        port: number;
    } | undefined;
    execInContainer: (containerId: string, command: string) => Promise<string>;
}
/**
 * Create mobile API router with dependencies
 */
export declare function createMobileApiRouter(deps: MobileApiDependencies): Router;
