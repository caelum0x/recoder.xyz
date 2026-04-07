"use strict";
/**
 * Push Notification Integration for Mobile Devices
 *
 * Provides:
 * - Push notification integration
 * - Expo push notification service
 * - Firebase Cloud Messaging support
 * - Notification types: build complete, deploy success, team invite
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IOS_CATEGORIES = exports.ANDROID_CHANNELS = exports.NOTIFICATION_TEMPLATES = exports.PushNotificationService = exports.pushNotificationService = void 0;
const crypto_1 = __importDefault(require("crypto"));
// ==================== Constants ====================
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const FCM_PUSH_URL = 'https://fcm.googleapis.com/fcm/send';
const MAX_BATCH_SIZE = 100;
const MAX_FAIL_COUNT = 5;
const RETRY_DELAY_MS = 5000;
// Default notification templates
const NOTIFICATION_TEMPLATES = {
    build_complete: {
        title: 'Build Complete',
        body: 'Your project build has completed successfully.',
    },
    build_failed: {
        title: 'Build Failed',
        body: 'Your project build has failed. Check the logs for details.',
    },
    deploy_success: {
        title: 'Deploy Successful',
        body: 'Your project has been deployed successfully.',
    },
    deploy_failed: {
        title: 'Deploy Failed',
        body: 'Your project deployment has failed. Check the logs for details.',
    },
    team_invite: {
        title: 'Team Invitation',
        body: 'You have been invited to join a team.',
    },
    collaboration_join: {
        title: 'Collaborator Joined',
        body: 'A collaborator has joined your project.',
    },
    collaboration_leave: {
        title: 'Collaborator Left',
        body: 'A collaborator has left your project.',
    },
    comment_added: {
        title: 'New Comment',
        body: 'A new comment has been added to your project.',
    },
    mention: {
        title: 'You were mentioned',
        body: 'Someone mentioned you in a comment.',
    },
    file_conflict: {
        title: 'File Conflict',
        body: 'A file conflict has been detected. Please resolve it.',
    },
    sync_complete: {
        title: 'Sync Complete',
        body: 'Your project has been synced successfully.',
    },
    error_alert: {
        title: 'Error Alert',
        body: 'An error has occurred in your project.',
    },
    system_notification: {
        title: 'System Notification',
        body: 'You have a new system notification.',
    },
};
exports.NOTIFICATION_TEMPLATES = NOTIFICATION_TEMPLATES;
// Android notification channels
const ANDROID_CHANNELS = {
    build_complete: 'build-notifications',
    build_failed: 'build-notifications',
    deploy_success: 'deploy-notifications',
    deploy_failed: 'deploy-notifications',
    team_invite: 'social-notifications',
    collaboration_join: 'collaboration-notifications',
    collaboration_leave: 'collaboration-notifications',
    comment_added: 'social-notifications',
    mention: 'social-notifications',
    file_conflict: 'sync-notifications',
    sync_complete: 'sync-notifications',
    error_alert: 'error-notifications',
    system_notification: 'system-notifications',
};
exports.ANDROID_CHANNELS = ANDROID_CHANNELS;
// iOS notification categories
const IOS_CATEGORIES = {
    build_complete: 'BUILD',
    build_failed: 'BUILD',
    deploy_success: 'DEPLOY',
    deploy_failed: 'DEPLOY',
    team_invite: 'SOCIAL',
    collaboration_join: 'COLLABORATION',
    collaboration_leave: 'COLLABORATION',
    comment_added: 'SOCIAL',
    mention: 'SOCIAL',
    file_conflict: 'SYNC',
    sync_complete: 'SYNC',
    error_alert: 'ERROR',
    system_notification: 'SYSTEM',
};
exports.IOS_CATEGORIES = IOS_CATEGORIES;
// ==================== Storage ====================
// In-memory storage (replace with database in production)
const pushTokens = new Map(); // deviceId -> PushToken
const tokensByUser = new Map(); // userId -> Set of deviceIds
const notificationPreferences = new Map(); // userId -> preferences
const notificationQueue = [];
async function sendExpoPushNotifications(messages) {
    // Split into batches
    const batches = [];
    for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
        batches.push(messages.slice(i, i + MAX_BATCH_SIZE));
    }
    const allTickets = [];
    for (const batch of batches) {
        try {
            const response = await fetch(EXPO_PUSH_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(batch),
            });
            if (!response.ok) {
                const error = await response.text();
                console.error(`[Push] Expo push failed: ${response.status} - ${error}`);
                // Create error tickets for all messages in batch
                allTickets.push(...batch.map(() => ({
                    status: 'error',
                    message: `HTTP ${response.status}: ${error}`,
                })));
                continue;
            }
            const result = await response.json();
            allTickets.push(...result.data);
        }
        catch (error) {
            console.error(`[Push] Expo push error:`, error);
            // Create error tickets for all messages in batch
            allTickets.push(...batch.map(() => ({
                status: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            })));
        }
    }
    return allTickets;
}
async function sendFCMNotifications(messages, serverKey) {
    const responses = [];
    // FCM requires individual requests per message when using legacy API
    // For production, use FCM v1 API with batch support
    for (const message of messages) {
        try {
            const response = await fetch(FCM_PUSH_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `key=${serverKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });
            if (!response.ok) {
                const error = await response.text();
                console.error(`[Push] FCM push failed: ${response.status} - ${error}`);
                responses.push({
                    multicast_id: 0,
                    success: 0,
                    failure: 1,
                    results: [{ error: `HTTP ${response.status}: ${error}` }],
                });
                continue;
            }
            const result = await response.json();
            responses.push(result);
        }
        catch (error) {
            console.error(`[Push] FCM push error:`, error);
            responses.push({
                multicast_id: 0,
                success: 0,
                failure: 1,
                results: [{ error: error instanceof Error ? error.message : 'Unknown error' }],
            });
        }
    }
    return responses;
}
async function sendAPNSNotifications(notifications, config) {
    // APNS requires HTTP/2 and JWT authentication.
    // A production implementation should use a library like 'apn' or '@parse/node-apn'.
    // Until then, return honest failure so callers know notifications were not delivered.
    console.warn(`[Push] APNS: not yet implemented - ${notifications.length} notifications will not be delivered to iOS devices`);
    return notifications.map(() => ({
        success: false,
        error: 'APNS not configured - integrate a production APNS library',
    }));
}
// ==================== Push Notification Service ====================
class PushNotificationService {
    fcmServerKey;
    apnsConfig;
    /**
     * Configure FCM credentials
     */
    configureFCM(serverKey) {
        this.fcmServerKey = serverKey;
    }
    /**
     * Configure APNS credentials
     */
    configureAPNS(config) {
        this.apnsConfig = config;
    }
    /**
     * Register a push token for a user/device
     */
    async registerToken(userId, deviceId, token, type) {
        const now = Date.now();
        // Check if token already exists
        const existingByDevice = pushTokens.get(deviceId);
        if (existingByDevice) {
            // Update existing token
            existingByDevice.token = token;
            existingByDevice.type = type;
            existingByDevice.lastUsedAt = now;
            existingByDevice.isValid = true;
            existingByDevice.failCount = 0;
            return existingByDevice;
        }
        // Create new token record
        const pushToken = {
            userId,
            deviceId,
            token,
            type,
            createdAt: now,
            lastUsedAt: now,
            failCount: 0,
            isValid: true,
        };
        pushTokens.set(deviceId, pushToken);
        // Track by user
        if (!tokensByUser.has(userId)) {
            tokensByUser.set(userId, new Set());
        }
        tokensByUser.get(userId).add(deviceId);
        console.log(`[Push] Registered ${type} token for user ${userId}, device ${deviceId}`);
        return pushToken;
    }
    /**
     * Unregister a push token
     */
    async unregisterToken(userId, deviceId) {
        const token = pushTokens.get(deviceId);
        if (!token || token.userId !== userId) {
            return false;
        }
        pushTokens.delete(deviceId);
        const userTokens = tokensByUser.get(userId);
        if (userTokens) {
            userTokens.delete(deviceId);
            if (userTokens.size === 0) {
                tokensByUser.delete(userId);
            }
        }
        console.log(`[Push] Unregistered token for user ${userId}, device ${deviceId}`);
        return true;
    }
    /**
     * Get all tokens for a user
     */
    getUserTokens(userId) {
        const deviceIds = tokensByUser.get(userId);
        if (!deviceIds) {
            return [];
        }
        const tokens = [];
        for (const deviceId of deviceIds) {
            const token = pushTokens.get(deviceId);
            if (token && token.isValid) {
                tokens.push(token);
            }
        }
        return tokens;
    }
    /**
     * Mark a token as invalid (e.g., device unregistered)
     */
    invalidateToken(deviceId) {
        const token = pushTokens.get(deviceId);
        if (token) {
            token.isValid = false;
            console.log(`[Push] Invalidated token for device ${deviceId}`);
        }
    }
    /**
     * Increment fail count for a token
     */
    recordFailure(deviceId) {
        const token = pushTokens.get(deviceId);
        if (token) {
            token.failCount++;
            if (token.failCount >= MAX_FAIL_COUNT) {
                token.isValid = false;
                console.log(`[Push] Token for device ${deviceId} exceeded fail count, marking invalid`);
            }
        }
    }
    /**
     * Get or create notification preferences for a user
     */
    getPreferences(userId) {
        let prefs = notificationPreferences.get(userId);
        if (!prefs) {
            prefs = {
                userId,
                enabledTypes: Object.keys(NOTIFICATION_TEMPLATES),
                enableSound: true,
                enableVibration: true,
                enableBadge: true,
            };
            notificationPreferences.set(userId, prefs);
        }
        return prefs;
    }
    /**
     * Update notification preferences
     */
    updatePreferences(userId, updates) {
        const prefs = this.getPreferences(userId);
        Object.assign(prefs, updates);
        return prefs;
    }
    /**
     * Check if notification should be sent based on preferences
     */
    shouldSendNotification(userId, type) {
        const prefs = this.getPreferences(userId);
        // Check if type is enabled
        if (!prefs.enabledTypes.includes(type)) {
            return false;
        }
        // Check quiet hours
        if (prefs.quietHoursStart !== undefined && prefs.quietHoursEnd !== undefined) {
            const now = new Date();
            const currentHour = now.getUTCHours();
            if (prefs.quietHoursStart < prefs.quietHoursEnd) {
                // Normal range (e.g., 22:00 - 07:00 next day)
                if (currentHour >= prefs.quietHoursStart && currentHour < prefs.quietHoursEnd) {
                    return false;
                }
            }
            else {
                // Wrapping range (e.g., 22:00 - 07:00)
                if (currentHour >= prefs.quietHoursStart || currentHour < prefs.quietHoursEnd) {
                    return false;
                }
            }
        }
        return true;
    }
    /**
     * Create a notification with template
     */
    createNotification(type, overrides) {
        const template = NOTIFICATION_TEMPLATES[type];
        return {
            id: crypto_1.default.randomUUID(),
            type,
            title: overrides?.title || template.title,
            body: overrides?.body || template.body,
            data: overrides?.data,
            badge: overrides?.badge,
            sound: overrides?.sound || 'default',
            priority: overrides?.priority || 'default',
            ttl: overrides?.ttl || 86400, // 24 hours
            channelId: ANDROID_CHANNELS[type],
            categoryId: IOS_CATEGORIES[type],
        };
    }
    /**
     * Send notification to a user
     */
    async sendToUser(userId, notification) {
        // Check preferences
        if (!this.shouldSendNotification(userId, notification.type)) {
            return {
                total: 0,
                successful: 0,
                failed: 0,
                results: [],
            };
        }
        const tokens = this.getUserTokens(userId);
        if (tokens.length === 0) {
            return {
                total: 0,
                successful: 0,
                failed: 0,
                results: [],
            };
        }
        return this.sendToTokens(tokens, notification);
    }
    /**
     * Send notification to multiple users
     */
    async sendToUsers(userIds, notification) {
        const allTokens = [];
        for (const userId of userIds) {
            if (this.shouldSendNotification(userId, notification.type)) {
                allTokens.push(...this.getUserTokens(userId));
            }
        }
        if (allTokens.length === 0) {
            return {
                total: 0,
                successful: 0,
                failed: 0,
                results: [],
            };
        }
        return this.sendToTokens(allTokens, notification);
    }
    /**
     * Send notification to specific tokens
     */
    async sendToTokens(tokens, notification) {
        const results = [];
        const prefs = tokens.length > 0 ? this.getPreferences(tokens[0].userId) : null;
        // Group tokens by type
        const expoTokens = tokens.filter(t => t.type === 'expo');
        const fcmTokens = tokens.filter(t => t.type === 'fcm');
        const apnsTokens = tokens.filter(t => t.type === 'apns');
        // Send to Expo
        if (expoTokens.length > 0) {
            const messages = expoTokens.map(t => ({
                to: t.token,
                title: notification.title,
                body: notification.body,
                data: notification.data,
                sound: prefs?.enableSound ? 'default' : null,
                badge: prefs?.enableBadge ? notification.badge : undefined,
                ttl: notification.ttl,
                priority: notification.priority,
                channelId: notification.channelId,
                categoryId: notification.categoryId,
            }));
            const tickets = await sendExpoPushNotifications(messages);
            tickets.forEach((ticket, index) => {
                const token = expoTokens[index];
                if (ticket.status === 'ok') {
                    token.lastUsedAt = Date.now();
                    token.failCount = 0;
                    results.push({
                        success: true,
                        token: token.token,
                        messageId: ticket.id,
                    });
                }
                else {
                    this.handlePushError(token, ticket.details?.error || ticket.message);
                    results.push({
                        success: false,
                        token: token.token,
                        error: ticket.message,
                        shouldRetry: ticket.details?.error !== 'DeviceNotRegistered',
                    });
                }
            });
        }
        // Send to FCM
        if (fcmTokens.length > 0 && this.fcmServerKey) {
            const messages = fcmTokens.map(t => ({
                to: t.token,
                notification: {
                    title: notification.title,
                    body: notification.body,
                    sound: prefs?.enableSound ? 'default' : undefined,
                    android_channel_id: notification.channelId,
                },
                data: notification.data ? Object.fromEntries(Object.entries(notification.data).map(([k, v]) => [k, String(v)])) : undefined,
                priority: notification.priority === 'high' ? 'high' : 'normal',
                time_to_live: notification.ttl,
            }));
            const responses = await sendFCMNotifications(messages, this.fcmServerKey);
            responses.forEach((response, index) => {
                const token = fcmTokens[index];
                if (response.success > 0) {
                    token.lastUsedAt = Date.now();
                    token.failCount = 0;
                    results.push({
                        success: true,
                        token: token.token,
                        messageId: response.results[0]?.message_id,
                    });
                }
                else {
                    const error = response.results[0]?.error || 'Unknown error';
                    this.handlePushError(token, error);
                    results.push({
                        success: false,
                        token: token.token,
                        error,
                        shouldRetry: error !== 'NotRegistered' && error !== 'InvalidRegistration',
                    });
                }
            });
        }
        // Send to APNS
        if (apnsTokens.length > 0 && this.apnsConfig) {
            const apnsConfig = this.apnsConfig; // Capture for closure
            const notifications = apnsTokens.map(t => ({
                deviceToken: t.token,
                payload: {
                    aps: {
                        alert: {
                            title: notification.title,
                            body: notification.body,
                        },
                        badge: prefs?.enableBadge ? notification.badge : undefined,
                        sound: prefs?.enableSound ? 'default' : undefined,
                        category: notification.categoryId,
                    },
                    ...notification.data,
                },
                expiration: notification.ttl ? Math.floor(Date.now() / 1000) + notification.ttl : undefined,
                priority: notification.priority === 'high' ? 10 : 5,
                topic: apnsConfig.bundleId,
            }));
            const apnsResults = await sendAPNSNotifications(notifications, apnsConfig);
            apnsResults.forEach((result, index) => {
                const token = apnsTokens[index];
                if (result.success) {
                    token.lastUsedAt = Date.now();
                    token.failCount = 0;
                    results.push({
                        success: true,
                        token: token.token,
                    });
                }
                else {
                    this.handlePushError(token, result.error);
                    results.push({
                        success: false,
                        token: token.token,
                        error: result.error,
                        shouldRetry: result.error !== 'Unregistered' && result.error !== 'BadDeviceToken',
                    });
                }
            });
        }
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`[Push] Sent ${notification.type} notification: ${successful}/${results.length} successful`);
        return {
            total: results.length,
            successful,
            failed,
            results,
        };
    }
    /**
     * Handle push error and update token status
     */
    handlePushError(token, error) {
        // Check for permanent errors that indicate token is invalid
        const permanentErrors = [
            'DeviceNotRegistered',
            'NotRegistered',
            'InvalidRegistration',
            'Unregistered',
            'BadDeviceToken',
            'ExpiredToken',
        ];
        if (error && permanentErrors.some(e => error.includes(e))) {
            this.invalidateToken(token.deviceId);
        }
        else {
            this.recordFailure(token.deviceId);
        }
    }
    /**
     * Queue notification for later delivery
     */
    queueNotification(notification, tokens, scheduledAt) {
        notificationQueue.push({ notification, tokens, scheduledAt });
        console.log(`[Push] Queued notification ${notification.id} for ${new Date(scheduledAt).toISOString()}`);
    }
    /**
     * Process queued notifications
     */
    async processQueue() {
        const now = Date.now();
        let processed = 0;
        const toProcess = notificationQueue.filter(item => item.scheduledAt <= now);
        for (const item of toProcess) {
            const tokens = item.tokens
                .map(t => {
                for (const [, token] of pushTokens) {
                    if (token.token === t && token.isValid) {
                        return token;
                    }
                }
                return null;
            })
                .filter((t) => t !== null);
            if (tokens.length > 0) {
                await this.sendToTokens(tokens, item.notification);
                processed++;
            }
            // Remove from queue
            const index = notificationQueue.indexOf(item);
            if (index > -1) {
                notificationQueue.splice(index, 1);
            }
        }
        return processed;
    }
    /**
     * Send build complete notification
     */
    async notifyBuildComplete(userId, projectName, success, details) {
        const notification = this.createNotification(success ? 'build_complete' : 'build_failed', {
            title: success ? 'Build Complete' : 'Build Failed',
            body: success
                ? `${projectName} built successfully${details?.duration ? ` in ${Math.round(details.duration / 1000)}s` : ''}`
                : `${projectName} build failed${details?.errors ? ` with ${details.errors} error(s)` : ''}`,
            data: {
                projectName,
                success,
                ...details,
            },
            priority: success ? 'default' : 'high',
        });
        return this.sendToUser(userId, notification);
    }
    /**
     * Send deploy notification
     */
    async notifyDeploy(userId, projectName, success, details) {
        const notification = this.createNotification(success ? 'deploy_success' : 'deploy_failed', {
            title: success ? 'Deploy Successful' : 'Deploy Failed',
            body: success
                ? `${projectName} deployed to ${details?.platform || 'production'}${details?.url ? `: ${details.url}` : ''}`
                : `${projectName} deployment failed${details?.error ? `: ${details.error}` : ''}`,
            data: {
                projectName,
                success,
                ...details,
            },
            priority: success ? 'default' : 'high',
        });
        return this.sendToUser(userId, notification);
    }
    /**
     * Send team invite notification
     */
    async notifyTeamInvite(userId, teamName, inviterName, inviteId) {
        const notification = this.createNotification('team_invite', {
            title: 'Team Invitation',
            body: `${inviterName} invited you to join ${teamName}`,
            data: {
                teamName,
                inviterName,
                inviteId,
                action: 'view_invite',
            },
            priority: 'high',
        });
        return this.sendToUser(userId, notification);
    }
    /**
     * Send collaboration notification
     */
    async notifyCollaboration(userId, collaboratorName, projectName, joined) {
        const notification = this.createNotification(joined ? 'collaboration_join' : 'collaboration_leave', {
            title: joined ? 'Collaborator Joined' : 'Collaborator Left',
            body: `${collaboratorName} ${joined ? 'joined' : 'left'} ${projectName}`,
            data: {
                collaboratorName,
                projectName,
                action: joined ? 'view_project' : undefined,
            },
        });
        return this.sendToUser(userId, notification);
    }
    /**
     * Send error alert notification
     */
    async notifyError(userId, projectName, errorType, message) {
        const notification = this.createNotification('error_alert', {
            title: `Error in ${projectName}`,
            body: `${errorType}: ${message}`,
            data: {
                projectName,
                errorType,
                message,
                action: 'view_errors',
            },
            priority: 'high',
        });
        return this.sendToUser(userId, notification);
    }
    /**
     * Get statistics
     */
    getStats() {
        let validTokens = 0;
        let invalidTokens = 0;
        const tokensByType = { expo: 0, fcm: 0, apns: 0 };
        for (const token of pushTokens.values()) {
            if (token.isValid) {
                validTokens++;
            }
            else {
                invalidTokens++;
            }
            tokensByType[token.type]++;
        }
        return {
            totalTokens: pushTokens.size,
            validTokens,
            invalidTokens,
            tokensByType,
            queuedNotifications: notificationQueue.length,
        };
    }
    /**
     * Clean up invalid tokens
     */
    cleanupInvalidTokens() {
        let removed = 0;
        for (const [deviceId, token] of pushTokens.entries()) {
            if (!token.isValid) {
                pushTokens.delete(deviceId);
                const userTokens = tokensByUser.get(token.userId);
                if (userTokens) {
                    userTokens.delete(deviceId);
                    if (userTokens.size === 0) {
                        tokensByUser.delete(token.userId);
                    }
                }
                removed++;
            }
        }
        console.log(`[Push] Cleaned up ${removed} invalid tokens`);
        return removed;
    }
}
exports.PushNotificationService = PushNotificationService;
// ==================== Singleton Instance ====================
exports.pushNotificationService = new PushNotificationService();
// ==================== Periodic Queue Processing ====================
// Process notification queue every minute
setInterval(() => {
    exports.pushNotificationService.processQueue().catch(err => {
        console.error('[Push] Queue processing error:', err);
    });
}, 60000);
// Clean up invalid tokens daily
setInterval(() => {
    exports.pushNotificationService.cleanupInvalidTokens();
}, 24 * 60 * 60 * 1000);
