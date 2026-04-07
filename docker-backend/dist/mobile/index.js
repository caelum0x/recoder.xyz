"use strict";
/**
 * Mobile API Module Index
 *
 * Exports all mobile-related functionality for React Native/Expo support:
 * - Mobile-optimized API endpoints
 * - Offline sync protocol
 * - Push notification integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IOS_CATEGORIES = exports.ANDROID_CHANNELS = exports.NOTIFICATION_TEMPLATES = exports.PushNotificationService = exports.pushNotificationService = exports.threeWayMerge = exports.computeLineDiff = exports.generateOperationId = exports.hashContent = exports.SyncManager = exports.syncManager = exports.transformFileForMobile = exports.transformProjectForMobile = exports.deleteNotification = exports.markAllNotificationsRead = exports.markNotificationRead = exports.getNotifications = exports.addNotification = exports.updatePushToken = exports.removeDevice = exports.getUserDevices = exports.getDevice = exports.registerDevice = exports.revokeUserSessions = exports.revokeDeviceSessions = exports.revokeMobileSession = exports.validateMobileSession = exports.createMobileSession = exports.decompressRequest = exports.compressResponse = exports.mobileCompressionMiddleware = exports.mobileAuthMiddleware = exports.createMobileApiRouter = void 0;
exports.initializeMobileApi = initializeMobileApi;
exports.getMobileApiStats = getMobileApiStats;
exports.cleanupMobileApi = cleanupMobileApi;
// ==================== API Exports ====================
var api_js_1 = require("./api.js");
// Router Factory
Object.defineProperty(exports, "createMobileApiRouter", { enumerable: true, get: function () { return api_js_1.createMobileApiRouter; } });
// Middleware
Object.defineProperty(exports, "mobileAuthMiddleware", { enumerable: true, get: function () { return api_js_1.mobileAuthMiddleware; } });
Object.defineProperty(exports, "mobileCompressionMiddleware", { enumerable: true, get: function () { return api_js_1.mobileCompressionMiddleware; } });
// Compression Utilities
Object.defineProperty(exports, "compressResponse", { enumerable: true, get: function () { return api_js_1.compressResponse; } });
Object.defineProperty(exports, "decompressRequest", { enumerable: true, get: function () { return api_js_1.decompressRequest; } });
// Session Management
Object.defineProperty(exports, "createMobileSession", { enumerable: true, get: function () { return api_js_1.createMobileSession; } });
Object.defineProperty(exports, "validateMobileSession", { enumerable: true, get: function () { return api_js_1.validateMobileSession; } });
Object.defineProperty(exports, "revokeMobileSession", { enumerable: true, get: function () { return api_js_1.revokeMobileSession; } });
Object.defineProperty(exports, "revokeDeviceSessions", { enumerable: true, get: function () { return api_js_1.revokeDeviceSessions; } });
Object.defineProperty(exports, "revokeUserSessions", { enumerable: true, get: function () { return api_js_1.revokeUserSessions; } });
// Device Management
Object.defineProperty(exports, "registerDevice", { enumerable: true, get: function () { return api_js_1.registerDevice; } });
Object.defineProperty(exports, "getDevice", { enumerable: true, get: function () { return api_js_1.getDevice; } });
Object.defineProperty(exports, "getUserDevices", { enumerable: true, get: function () { return api_js_1.getUserDevices; } });
Object.defineProperty(exports, "removeDevice", { enumerable: true, get: function () { return api_js_1.removeDevice; } });
Object.defineProperty(exports, "updatePushToken", { enumerable: true, get: function () { return api_js_1.updatePushToken; } });
// Notification Management
Object.defineProperty(exports, "addNotification", { enumerable: true, get: function () { return api_js_1.addNotification; } });
Object.defineProperty(exports, "getNotifications", { enumerable: true, get: function () { return api_js_1.getNotifications; } });
Object.defineProperty(exports, "markNotificationRead", { enumerable: true, get: function () { return api_js_1.markNotificationRead; } });
Object.defineProperty(exports, "markAllNotificationsRead", { enumerable: true, get: function () { return api_js_1.markAllNotificationsRead; } });
Object.defineProperty(exports, "deleteNotification", { enumerable: true, get: function () { return api_js_1.deleteNotification; } });
// Transformers
Object.defineProperty(exports, "transformProjectForMobile", { enumerable: true, get: function () { return api_js_1.transformProjectForMobile; } });
Object.defineProperty(exports, "transformFileForMobile", { enumerable: true, get: function () { return api_js_1.transformFileForMobile; } });
// ==================== Sync Exports ====================
var sync_js_1 = require("./sync.js");
// Sync Manager
Object.defineProperty(exports, "syncManager", { enumerable: true, get: function () { return sync_js_1.syncManager; } });
Object.defineProperty(exports, "SyncManager", { enumerable: true, get: function () { return sync_js_1.SyncManager; } });
// Utilities
Object.defineProperty(exports, "hashContent", { enumerable: true, get: function () { return sync_js_1.hashContent; } });
Object.defineProperty(exports, "generateOperationId", { enumerable: true, get: function () { return sync_js_1.generateOperationId; } });
Object.defineProperty(exports, "computeLineDiff", { enumerable: true, get: function () { return sync_js_1.computeLineDiff; } });
Object.defineProperty(exports, "threeWayMerge", { enumerable: true, get: function () { return sync_js_1.threeWayMerge; } });
// ==================== Push Notification Exports ====================
var push_js_1 = require("./push.js");
// Push Service
Object.defineProperty(exports, "pushNotificationService", { enumerable: true, get: function () { return push_js_1.pushNotificationService; } });
Object.defineProperty(exports, "PushNotificationService", { enumerable: true, get: function () { return push_js_1.PushNotificationService; } });
// Templates
Object.defineProperty(exports, "NOTIFICATION_TEMPLATES", { enumerable: true, get: function () { return push_js_1.NOTIFICATION_TEMPLATES; } });
Object.defineProperty(exports, "ANDROID_CHANNELS", { enumerable: true, get: function () { return push_js_1.ANDROID_CHANNELS; } });
Object.defineProperty(exports, "IOS_CATEGORIES", { enumerable: true, get: function () { return push_js_1.IOS_CATEGORIES; } });
// ==================== Initialization ====================
const push_js_2 = require("./push.js");
/**
 * Initialize mobile API with configuration
 */
function initializeMobileApi(config = {}) {
    let pushConfigured = false;
    // Configure FCM if server key provided
    if (config.fcmServerKey) {
        push_js_2.pushNotificationService.configureFCM(config.fcmServerKey);
        pushConfigured = true;
    }
    // Configure APNS if config provided
    if (config.apnsConfig) {
        push_js_2.pushNotificationService.configureAPNS(config.apnsConfig);
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
function getMobileApiStats() {
    const { syncManager } = require('./sync.js');
    return {
        push: push_js_2.pushNotificationService.getStats(),
        sync: syncManager.getStats(),
    };
}
/**
 * Clean up mobile API resources
 */
function cleanupMobileApi() {
    const { syncManager } = require('./sync.js');
    const tokensRemoved = push_js_2.pushNotificationService.cleanupInvalidTokens();
    // Note: We don't clear sync states automatically as they contain important data
    // This is just returning current counts
    const stats = syncManager.getStats();
    return {
        tokensRemoved,
        syncStatesCleared: 0, // Would need explicit user/project cleanup
    };
}
