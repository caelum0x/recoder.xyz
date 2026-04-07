/**
 * Push Notification Integration for Mobile Devices
 *
 * Provides:
 * - Push notification integration
 * - Expo push notification service
 * - Firebase Cloud Messaging support
 * - Notification types: build complete, deploy success, team invite
 */
export type PushTokenType = 'expo' | 'fcm' | 'apns';
export type NotificationType = 'build_complete' | 'build_failed' | 'deploy_success' | 'deploy_failed' | 'team_invite' | 'collaboration_join' | 'collaboration_leave' | 'comment_added' | 'mention' | 'file_conflict' | 'sync_complete' | 'error_alert' | 'system_notification';
export interface PushToken {
    userId: string;
    deviceId: string;
    token: string;
    type: PushTokenType;
    createdAt: number;
    lastUsedAt: number;
    failCount: number;
    isValid: boolean;
}
export interface PushNotification {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    badge?: number;
    sound?: string;
    priority?: 'default' | 'high';
    ttl?: number;
    channelId?: string;
    categoryId?: string;
}
export interface PushResult {
    success: boolean;
    token: string;
    messageId?: string;
    error?: string;
    shouldRetry?: boolean;
}
export interface BatchPushResult {
    total: number;
    successful: number;
    failed: number;
    results: PushResult[];
}
export interface NotificationPreferences {
    userId: string;
    enabledTypes: NotificationType[];
    quietHoursStart?: number;
    quietHoursEnd?: number;
    enableSound: boolean;
    enableVibration: boolean;
    enableBadge: boolean;
}
declare const NOTIFICATION_TEMPLATES: Record<NotificationType, {
    title: string;
    body: string;
}>;
declare const ANDROID_CHANNELS: Record<NotificationType, string>;
declare const IOS_CATEGORIES: Record<NotificationType, string>;
declare class PushNotificationService {
    private fcmServerKey?;
    private apnsConfig?;
    /**
     * Configure FCM credentials
     */
    configureFCM(serverKey: string): void;
    /**
     * Configure APNS credentials
     */
    configureAPNS(config: {
        keyId: string;
        teamId: string;
        bundleId: string;
        key: string;
    }): void;
    /**
     * Register a push token for a user/device
     */
    registerToken(userId: string, deviceId: string, token: string, type: PushTokenType): Promise<PushToken>;
    /**
     * Unregister a push token
     */
    unregisterToken(userId: string, deviceId: string): Promise<boolean>;
    /**
     * Get all tokens for a user
     */
    getUserTokens(userId: string): PushToken[];
    /**
     * Mark a token as invalid (e.g., device unregistered)
     */
    invalidateToken(deviceId: string): void;
    /**
     * Increment fail count for a token
     */
    recordFailure(deviceId: string): void;
    /**
     * Get or create notification preferences for a user
     */
    getPreferences(userId: string): NotificationPreferences;
    /**
     * Update notification preferences
     */
    updatePreferences(userId: string, updates: Partial<NotificationPreferences>): NotificationPreferences;
    /**
     * Check if notification should be sent based on preferences
     */
    shouldSendNotification(userId: string, type: NotificationType): boolean;
    /**
     * Create a notification with template
     */
    createNotification(type: NotificationType, overrides?: Partial<PushNotification>): PushNotification;
    /**
     * Send notification to a user
     */
    sendToUser(userId: string, notification: PushNotification): Promise<BatchPushResult>;
    /**
     * Send notification to multiple users
     */
    sendToUsers(userIds: string[], notification: PushNotification): Promise<BatchPushResult>;
    /**
     * Send notification to specific tokens
     */
    sendToTokens(tokens: PushToken[], notification: PushNotification): Promise<BatchPushResult>;
    /**
     * Handle push error and update token status
     */
    private handlePushError;
    /**
     * Queue notification for later delivery
     */
    queueNotification(notification: PushNotification, tokens: string[], scheduledAt: number): void;
    /**
     * Process queued notifications
     */
    processQueue(): Promise<number>;
    /**
     * Send build complete notification
     */
    notifyBuildComplete(userId: string, projectName: string, success: boolean, details?: {
        duration?: number;
        errors?: number;
        warnings?: number;
    }): Promise<BatchPushResult>;
    /**
     * Send deploy notification
     */
    notifyDeploy(userId: string, projectName: string, success: boolean, details?: {
        platform?: string;
        url?: string;
        error?: string;
    }): Promise<BatchPushResult>;
    /**
     * Send team invite notification
     */
    notifyTeamInvite(userId: string, teamName: string, inviterName: string, inviteId: string): Promise<BatchPushResult>;
    /**
     * Send collaboration notification
     */
    notifyCollaboration(userId: string, collaboratorName: string, projectName: string, joined: boolean): Promise<BatchPushResult>;
    /**
     * Send error alert notification
     */
    notifyError(userId: string, projectName: string, errorType: string, message: string): Promise<BatchPushResult>;
    /**
     * Get statistics
     */
    getStats(): {
        totalTokens: number;
        validTokens: number;
        invalidTokens: number;
        tokensByType: Record<PushTokenType, number>;
        queuedNotifications: number;
    };
    /**
     * Clean up invalid tokens
     */
    cleanupInvalidTokens(): number;
}
export declare const pushNotificationService: PushNotificationService;
export { PushNotificationService, NOTIFICATION_TEMPLATES, ANDROID_CHANNELS, IOS_CATEGORIES, };
