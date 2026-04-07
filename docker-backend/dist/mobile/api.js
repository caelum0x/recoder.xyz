"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compressResponse = compressResponse;
exports.decompressRequest = decompressRequest;
exports.createMobileSession = createMobileSession;
exports.validateMobileSession = validateMobileSession;
exports.revokeMobileSession = revokeMobileSession;
exports.revokeDeviceSessions = revokeDeviceSessions;
exports.revokeUserSessions = revokeUserSessions;
exports.registerDevice = registerDevice;
exports.getDevice = getDevice;
exports.getUserDevices = getUserDevices;
exports.removeDevice = removeDevice;
exports.updatePushToken = updatePushToken;
exports.addNotification = addNotification;
exports.getNotifications = getNotifications;
exports.markNotificationRead = markNotificationRead;
exports.markAllNotificationsRead = markAllNotificationsRead;
exports.deleteNotification = deleteNotification;
exports.mobileAuthMiddleware = mobileAuthMiddleware;
exports.mobileCompressionMiddleware = mobileCompressionMiddleware;
exports.transformProjectForMobile = transformProjectForMobile;
exports.transformFileForMobile = transformFileForMobile;
exports.createMobileApiRouter = createMobileApiRouter;
const express_1 = require("express");
const zlib_1 = __importDefault(require("zlib"));
const util_1 = require("util");
const crypto_1 = __importDefault(require("crypto"));
const index_js_1 = require("../errors/index.js");
const sync_js_1 = require("./sync.js");
const push_js_1 = require("./push.js");
const gzip = (0, util_1.promisify)(zlib_1.default.gzip);
const gunzip = (0, util_1.promisify)(zlib_1.default.gunzip);
// ==================== Constants ====================
const MOBILE_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const MOBILE_SESSION_REFRESH_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // Refresh if < 7 days remaining
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const COMPRESSION_THRESHOLD = 1024; // Compress responses > 1KB
// ==================== Storage ====================
// In-memory storage (replace with database in production)
const mobileDevices = new Map();
const mobileSessions = new Map();
const mobileNotifications = new Map();
const devicesByUser = new Map();
// ==================== Compression Utilities ====================
/**
 * Compress data for mobile transfer
 */
async function compressResponse(data) {
    const json = JSON.stringify(data);
    const originalSize = Buffer.byteLength(json, 'utf8');
    if (originalSize < COMPRESSION_THRESHOLD) {
        return {
            compressed: Buffer.from(json, 'utf8'),
            originalSize,
            compressedSize: originalSize,
        };
    }
    const compressed = await gzip(json);
    return {
        compressed,
        originalSize,
        compressedSize: compressed.length,
    };
}
/**
 * Decompress data from mobile
 */
async function decompressRequest(data, isCompressed) {
    if (!isCompressed) {
        return JSON.parse(data.toString('utf8'));
    }
    const decompressed = await gunzip(data);
    return JSON.parse(decompressed.toString('utf8'));
}
// ==================== Session Management ====================
/**
 * Generate secure session token
 */
function generateSessionToken() {
    return crypto_1.default.randomBytes(32).toString('base64url');
}
/**
 * Generate device ID from device info
 */
function generateDeviceId(platform, deviceName, userId) {
    const data = `${platform}:${deviceName}:${userId}:${Date.now()}`;
    return crypto_1.default.createHash('sha256').update(data).digest('hex').substring(0, 32);
}
/**
 * Create mobile session
 */
function createMobileSession(userId, deviceId, ipAddress, userAgent) {
    const now = Date.now();
    const session = {
        id: crypto_1.default.randomUUID(),
        userId,
        deviceId,
        token: generateSessionToken(),
        createdAt: now,
        expiresAt: now + MOBILE_SESSION_TTL,
        lastActivity: now,
        ipAddress,
        userAgent,
    };
    mobileSessions.set(session.token, session);
    return session;
}
/**
 * Validate and refresh mobile session
 */
function validateMobileSession(token) {
    const session = mobileSessions.get(token);
    if (!session) {
        return null;
    }
    const now = Date.now();
    // Check expiry
    if (session.expiresAt < now) {
        mobileSessions.delete(token);
        return null;
    }
    // Refresh session if nearing expiry
    if (session.expiresAt - now < MOBILE_SESSION_REFRESH_THRESHOLD) {
        session.expiresAt = now + MOBILE_SESSION_TTL;
    }
    session.lastActivity = now;
    return session;
}
/**
 * Revoke mobile session
 */
function revokeMobileSession(token) {
    return mobileSessions.delete(token);
}
/**
 * Revoke all sessions for a device
 */
function revokeDeviceSessions(deviceId) {
    let count = 0;
    for (const [token, session] of mobileSessions.entries()) {
        if (session.deviceId === deviceId) {
            mobileSessions.delete(token);
            count++;
        }
    }
    return count;
}
/**
 * Revoke all sessions for a user
 */
function revokeUserSessions(userId) {
    let count = 0;
    for (const [token, session] of mobileSessions.entries()) {
        if (session.userId === userId) {
            mobileSessions.delete(token);
            count++;
        }
    }
    return count;
}
// ==================== Device Management ====================
/**
 * Register a new mobile device
 */
function registerDevice(userId, deviceInfo, ipAddress, userAgent) {
    const deviceId = generateDeviceId(deviceInfo.platform, deviceInfo.deviceName, userId);
    const now = Date.now();
    // Check if device already exists
    let device = mobileDevices.get(deviceId);
    if (device) {
        // Update existing device
        device.appVersion = deviceInfo.appVersion;
        device.osVersion = deviceInfo.osVersion;
        device.lastActive = now;
        if (deviceInfo.pushToken) {
            device.pushToken = deviceInfo.pushToken;
            device.pushTokenType = deviceInfo.pushTokenType;
        }
    }
    else {
        // Create new device
        const session = createMobileSession(userId, deviceId, ipAddress, userAgent);
        device = {
            id: crypto_1.default.randomUUID(),
            userId,
            deviceId,
            deviceName: deviceInfo.deviceName,
            platform: deviceInfo.platform,
            appVersion: deviceInfo.appVersion,
            osVersion: deviceInfo.osVersion,
            pushToken: deviceInfo.pushToken,
            pushTokenType: deviceInfo.pushTokenType,
            lastActive: now,
            createdAt: now,
            sessionToken: session.token,
            sessionExpiry: session.expiresAt,
        };
        mobileDevices.set(deviceId, device);
        // Track devices by user
        if (!devicesByUser.has(userId)) {
            devicesByUser.set(userId, new Set());
        }
        devicesByUser.get(userId).add(deviceId);
        return { device, session };
    }
    // Create new session for existing device
    const session = createMobileSession(userId, deviceId, ipAddress, userAgent);
    device.sessionToken = session.token;
    device.sessionExpiry = session.expiresAt;
    return { device, session };
}
/**
 * Get device by ID
 */
function getDevice(deviceId) {
    return mobileDevices.get(deviceId);
}
/**
 * Get all devices for a user
 */
function getUserDevices(userId) {
    const deviceIds = devicesByUser.get(userId);
    if (!deviceIds) {
        return [];
    }
    const devices = [];
    for (const deviceId of deviceIds) {
        const device = mobileDevices.get(deviceId);
        if (device) {
            devices.push(device);
        }
    }
    return devices.sort((a, b) => b.lastActive - a.lastActive);
}
/**
 * Remove a device
 */
function removeDevice(deviceId) {
    const device = mobileDevices.get(deviceId);
    if (!device) {
        return false;
    }
    // Revoke sessions
    revokeDeviceSessions(deviceId);
    // Remove from user's devices
    const userDevices = devicesByUser.get(device.userId);
    if (userDevices) {
        userDevices.delete(deviceId);
        if (userDevices.size === 0) {
            devicesByUser.delete(device.userId);
        }
    }
    return mobileDevices.delete(deviceId);
}
/**
 * Update push token for a device
 */
function updatePushToken(deviceId, pushToken, pushTokenType) {
    const device = mobileDevices.get(deviceId);
    if (!device) {
        return false;
    }
    device.pushToken = pushToken;
    device.pushTokenType = pushTokenType;
    device.lastActive = Date.now();
    return true;
}
// ==================== Notification Management ====================
/**
 * Add notification for a user
 */
function addNotification(userId, notification) {
    const fullNotification = {
        ...notification,
        id: crypto_1.default.randomUUID(),
        read: false,
        createdAt: Date.now(),
    };
    if (!mobileNotifications.has(userId)) {
        mobileNotifications.set(userId, []);
    }
    const notifications = mobileNotifications.get(userId);
    notifications.unshift(fullNotification);
    // Keep only last 100 notifications
    if (notifications.length > 100) {
        notifications.splice(100);
    }
    return fullNotification;
}
/**
 * Get notifications for a user
 */
function getNotifications(userId, options) {
    const all = mobileNotifications.get(userId) || [];
    const now = Date.now();
    // Filter out expired notifications
    let filtered = all.filter(n => !n.expiresAt || n.expiresAt > now);
    if (options?.unreadOnly) {
        filtered = filtered.filter(n => !n.read);
    }
    const limit = Math.min(options?.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = options?.offset || 0;
    const items = filtered.slice(offset, offset + limit);
    return {
        items,
        total: filtered.length,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        hasMore: offset + limit < filtered.length,
    };
}
/**
 * Mark notification as read
 */
function markNotificationRead(userId, notificationId) {
    const notifications = mobileNotifications.get(userId);
    if (!notifications) {
        return false;
    }
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) {
        return false;
    }
    notification.read = true;
    return true;
}
/**
 * Mark all notifications as read
 */
function markAllNotificationsRead(userId) {
    const notifications = mobileNotifications.get(userId);
    if (!notifications) {
        return 0;
    }
    let count = 0;
    for (const notification of notifications) {
        if (!notification.read) {
            notification.read = true;
            count++;
        }
    }
    return count;
}
/**
 * Delete notification
 */
function deleteNotification(userId, notificationId) {
    const notifications = mobileNotifications.get(userId);
    if (!notifications) {
        return false;
    }
    const index = notifications.findIndex(n => n.id === notificationId);
    if (index === -1) {
        return false;
    }
    notifications.splice(index, 1);
    return true;
}
// ==================== Middleware ====================
/**
 * Mobile authentication middleware
 */
function mobileAuthMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        (0, index_js_1.sendError)(res, index_js_1.ErrorCode.AUTH_REQUIRED, { message: 'Mobile session token required' });
        return;
    }
    const session = validateMobileSession(token);
    if (!session) {
        (0, index_js_1.sendError)(res, index_js_1.ErrorCode.AUTH_TOKEN_EXPIRED, { message: 'Mobile session expired or invalid' });
        return;
    }
    req.userId = session.userId;
    req.deviceId = session.deviceId;
    req.sessionId = session.id;
    req.mobileSession = session;
    // Update device last active
    const device = mobileDevices.get(session.deviceId);
    if (device) {
        device.lastActive = Date.now();
    }
    next();
}
/**
 * Compression middleware for mobile responses
 */
function mobileCompressionMiddleware(req, res, next) {
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const supportsGzip = acceptEncoding.includes('gzip');
    // Store original json method
    const originalJson = res.json.bind(res);
    // Override json method with compression
    res.json = function (data) {
        if (!supportsGzip) {
            return originalJson(data);
        }
        const json = JSON.stringify(data);
        const size = Buffer.byteLength(json, 'utf8');
        if (size < COMPRESSION_THRESHOLD) {
            return originalJson(data);
        }
        // Compress asynchronously
        gzip(json).then(compressed => {
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Original-Size', size.toString());
            res.setHeader('X-Compressed-Size', compressed.length.toString());
            res.send(compressed);
        }).catch(() => {
            // Fall back to uncompressed on error
            originalJson(data);
        });
        return res;
    };
    next();
}
// ==================== Project Helpers ====================
/**
 * Transform project data for mobile consumption
 */
function transformProjectForMobile(project) {
    return {
        id: project.id,
        name: project.name,
        description: project.description,
        template: project.template,
        language: project.language,
        framework: project.framework,
        createdAt: project.createdAt || Date.now(),
        updatedAt: project.updatedAt || Date.now(),
        lastOpenedAt: project.lastOpenedAt,
        thumbnailUrl: project.thumbnailUrl,
        fileCount: project.fileCount || 0,
        totalSize: project.totalSize || 0,
        isStarred: project.isStarred || false,
        syncStatus: project.syncStatus || 'synced',
        lastSyncAt: project.lastSyncAt,
    };
}
/**
 * Transform file data for mobile consumption
 */
function transformFileForMobile(file) {
    return {
        path: file.path,
        name: file.name || file.path.split('/').pop() || '',
        type: file.type,
        size: file.size,
        modifiedAt: file.modifiedAt || Date.now(),
        mimeType: file.mimeType,
        isNew: file.isNew,
        isModified: file.isModified,
        isDeleted: file.isDeleted,
    };
}
/**
 * Create mobile API router with dependencies
 */
function createMobileApiRouter(deps) {
    const router = (0, express_1.Router)();
    // Apply mobile-specific middleware
    router.use(mobileCompressionMiddleware);
    // ==================== Device Registration ====================
    /**
     * POST /api/mobile/register
     * Register a mobile device and create session
     */
    router.post('/register', (0, index_js_1.asyncHandler)(async (req, res) => {
        const { userId, deviceName, platform, appVersion, osVersion, pushToken, pushTokenType, } = req.body;
        if (!userId || !deviceName || !platform || !appVersion || !osVersion) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.MISSING_REQUIRED_FIELD, 'Missing required fields: userId, deviceName, platform, appVersion, osVersion');
        }
        if (!['ios', 'android', 'web'].includes(platform)) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.INVALID_INPUT, 'Invalid platform. Must be ios, android, or web');
        }
        const ipAddress = req.ip || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const { device, session } = registerDevice(userId, { deviceName, platform, appVersion, osVersion, pushToken, pushTokenType }, ipAddress, userAgent);
        console.log(`[Mobile] Device registered: ${device.deviceId} for user ${userId}`);
        (0, index_js_1.sendSuccess)(res, {
            device: {
                id: device.id,
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                platform: device.platform,
            },
            session: {
                token: session.token,
                expiresAt: session.expiresAt,
            },
        }, { message: 'Device registered successfully' });
    }));
    // ==================== Session Validation (public) ====================
    /**
     * POST /api/mobile/session/validate
     * Validate a mobile session token — used by Remix proxy routes
     * to authenticate mobile clients without cookies.
     */
    router.post('/session/validate', (0, index_js_1.asyncHandler)(async (req, res) => {
        const { token } = req.body;
        if (!token || typeof token !== 'string') {
            res.json({ valid: false });
            return;
        }
        const session = validateMobileSession(token);
        if (!session) {
            res.json({ valid: false });
            return;
        }
        res.json({
            valid: true,
            userId: session.userId,
            deviceId: session.deviceId,
        });
    }));
    // ==================== Protected Routes ====================
    // Apply authentication middleware for all routes below
    router.use(mobileAuthMiddleware);
    /**
     * POST /api/mobile/logout
     * Logout current device
     */
    router.post('/logout', (0, index_js_1.asyncHandler)(async (req, res) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
            revokeMobileSession(token);
        }
        (0, index_js_1.sendSuccess)(res, null, { message: 'Logged out successfully' });
    }));
    /**
     * GET /api/mobile/devices
     * Get all registered devices for the user
     */
    router.get('/devices', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const devices = getUserDevices(userId);
        (0, index_js_1.sendSuccess)(res, {
            devices: devices.map(d => ({
                id: d.id,
                deviceId: d.deviceId,
                deviceName: d.deviceName,
                platform: d.platform,
                appVersion: d.appVersion,
                lastActive: d.lastActive,
                isCurrent: d.deviceId === req.deviceId,
            })),
        });
    }));
    /**
     * DELETE /api/mobile/devices/:deviceId
     * Remove a registered device
     */
    router.delete('/devices/:deviceId', (0, index_js_1.asyncHandler)(async (req, res) => {
        const { deviceId } = req.params;
        const device = getDevice(deviceId);
        if (!device || device.userId !== req.userId) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.FILE_NOT_FOUND, 'Device not found');
        }
        removeDevice(deviceId);
        (0, index_js_1.sendSuccess)(res, null, { message: 'Device removed successfully' });
    }));
    /**
     * POST /api/mobile/push/token
     * Register or update push notification token
     */
    router.post('/push/token', (0, index_js_1.asyncHandler)(async (req, res) => {
        const { token, tokenType } = req.body;
        if (!token || !tokenType) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.MISSING_REQUIRED_FIELD, 'Missing required fields: token, tokenType');
        }
        if (!['expo', 'fcm', 'apns'].includes(tokenType)) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.INVALID_INPUT, 'Invalid tokenType. Must be expo, fcm, or apns');
        }
        const updated = updatePushToken(req.deviceId, token, tokenType);
        if (!updated) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.FILE_NOT_FOUND, 'Device not found');
        }
        // Register token with push service
        await push_js_1.pushNotificationService.registerToken(req.userId, req.deviceId, token, tokenType);
        (0, index_js_1.sendSuccess)(res, null, { message: 'Push token registered successfully' });
    }));
    /**
     * DELETE /api/mobile/push/token
     * Remove push notification token
     */
    router.delete('/push/token', (0, index_js_1.asyncHandler)(async (req, res) => {
        const device = getDevice(req.deviceId);
        if (device && device.pushToken) {
            await push_js_1.pushNotificationService.unregisterToken(req.userId, req.deviceId);
            device.pushToken = undefined;
            device.pushTokenType = undefined;
        }
        (0, index_js_1.sendSuccess)(res, null, { message: 'Push token removed successfully' });
    }));
    // ==================== Project Endpoints ====================
    /**
     * GET /api/mobile/projects
     * Get paginated list of user's projects (mobile-optimized)
     */
    router.get('/projects', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const { page = '1', pageSize = String(DEFAULT_PAGE_SIZE), search, sortBy = 'updatedAt', sortOrder = 'desc', } = req.query;
        const limit = Math.min(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const offset = (parseInt(page, 10) - 1) * limit;
        const { projects, total } = await deps.fetchUserProjects(userId, {
            limit,
            offset,
            search: search,
            sortBy: sortBy,
            sortOrder: sortOrder,
        });
        const mobileProjects = projects.map(transformProjectForMobile);
        const response = {
            items: mobileProjects,
            total,
            page: parseInt(page, 10) || 1,
            pageSize: limit,
            hasMore: offset + limit < total,
            nextCursor: offset + limit < total ? String(offset + limit) : undefined,
        };
        (0, index_js_1.sendSuccess)(res, response);
    }));
    /**
     * GET /api/mobile/project/:projectId
     * Get detailed project information (mobile-optimized)
     */
    router.get('/project/:projectId', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const { projectId } = req.params;
        const { includeFiles = 'true', depth = '1' } = req.query;
        // Check ownership
        const isOwner = await deps.checkProjectOwnership(userId, projectId);
        if (!isOwner) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this project');
        }
        const project = await deps.fetchProjectDetail(userId, projectId);
        if (!project) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.FILE_NOT_FOUND, 'Project not found');
        }
        const mobileProject = transformProjectForMobile(project);
        let files = [];
        if (includeFiles === 'true') {
            const rawFiles = await deps.fetchProjectFiles(userId, projectId);
            files = rawFiles.map(transformFileForMobile);
            // Limit depth if specified
            const maxDepth = parseInt(depth, 10) || 1;
            files = files.filter(f => {
                const fileDepth = f.path.split('/').filter(Boolean).length;
                return fileDepth <= maxDepth;
            });
        }
        // Get container info
        const container = deps.getContainer(projectId);
        const detail = {
            ...mobileProject,
            files,
            recentFiles: project.recentFiles || [],
            collaborators: project.collaborators || [],
            gitBranch: project.gitBranch,
            gitStatus: project.gitStatus,
            devServerUrl: container ? `http://localhost:${container.port}` : undefined,
            previewUrl: project.previewUrl,
        };
        (0, index_js_1.sendSuccess)(res, detail);
    }));
    /**
     * GET /api/mobile/project/:projectId/files
     * Get project files with pagination (for large projects)
     */
    router.get('/project/:projectId/files', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const { projectId } = req.params;
        const { path = '', page = '1', pageSize = '50' } = req.query;
        // Check ownership
        const isOwner = await deps.checkProjectOwnership(userId, projectId);
        if (!isOwner) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this project');
        }
        const rawFiles = await deps.fetchProjectFiles(userId, projectId, path);
        const files = rawFiles.map(transformFileForMobile);
        const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
        const offset = (parseInt(page, 10) - 1) * limit;
        const paginatedFiles = files.slice(offset, offset + limit);
        const response = {
            items: paginatedFiles,
            total: files.length,
            page: parseInt(page, 10) || 1,
            pageSize: limit,
            hasMore: offset + limit < files.length,
        };
        (0, index_js_1.sendSuccess)(res, response);
    }));
    // ==================== Sync Endpoints ====================
    /**
     * POST /api/mobile/sync
     * Sync changes between mobile and server
     */
    router.post('/sync', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const deviceId = req.deviceId;
        const { projectId, operations, lastSyncAt, conflictResolution = 'server_wins' } = req.body;
        if (!projectId) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.MISSING_REQUIRED_FIELD, 'projectId is required');
        }
        // Check ownership
        const isOwner = await deps.checkProjectOwnership(userId, projectId);
        if (!isOwner) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this project');
        }
        // Process sync operations
        const result = await sync_js_1.syncManager.processSync(userId, deviceId, projectId, operations, lastSyncAt, conflictResolution);
        (0, index_js_1.sendSuccess)(res, result);
    }));
    /**
     * GET /api/mobile/sync/status/:projectId
     * Get sync status for a project
     */
    router.get('/sync/status/:projectId', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const deviceId = req.deviceId;
        const { projectId } = req.params;
        // Check ownership
        const isOwner = await deps.checkProjectOwnership(userId, projectId);
        if (!isOwner) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this project');
        }
        const status = sync_js_1.syncManager.getSyncStatus(userId, deviceId, projectId);
        (0, index_js_1.sendSuccess)(res, status);
    }));
    /**
     * GET /api/mobile/sync/pending/:projectId
     * Get pending sync operations for a project
     */
    router.get('/sync/pending/:projectId', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const deviceId = req.deviceId;
        const { projectId } = req.params;
        const { since } = req.query;
        // Check ownership
        const isOwner = await deps.checkProjectOwnership(userId, projectId);
        if (!isOwner) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this project');
        }
        const pending = sync_js_1.syncManager.getPendingOperations(userId, deviceId, projectId, since ? parseInt(since, 10) : undefined);
        (0, index_js_1.sendSuccess)(res, pending);
    }));
    // ==================== Notification Endpoints ====================
    /**
     * GET /api/mobile/notifications
     * Get user notifications
     */
    router.get('/notifications', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const { unreadOnly = 'false', page = '1', pageSize = String(DEFAULT_PAGE_SIZE) } = req.query;
        const limit = Math.min(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const offset = (parseInt(page, 10) - 1) * limit;
        const response = getNotifications(userId, {
            unreadOnly: unreadOnly === 'true',
            limit,
            offset,
        });
        (0, index_js_1.sendSuccess)(res, response);
    }));
    /**
     * POST /api/mobile/notifications/:notificationId/read
     * Mark notification as read
     */
    router.post('/notifications/:notificationId/read', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const { notificationId } = req.params;
        const marked = markNotificationRead(userId, notificationId);
        if (!marked) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.FILE_NOT_FOUND, 'Notification not found');
        }
        (0, index_js_1.sendSuccess)(res, null, { message: 'Notification marked as read' });
    }));
    /**
     * POST /api/mobile/notifications/read-all
     * Mark all notifications as read
     */
    router.post('/notifications/read-all', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const count = markAllNotificationsRead(userId);
        (0, index_js_1.sendSuccess)(res, { count }, { message: `${count} notifications marked as read` });
    }));
    /**
     * DELETE /api/mobile/notifications/:notificationId
     * Delete a notification
     */
    router.delete('/notifications/:notificationId', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const { notificationId } = req.params;
        const deleted = deleteNotification(userId, notificationId);
        if (!deleted) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.FILE_NOT_FOUND, 'Notification not found');
        }
        (0, index_js_1.sendSuccess)(res, null, { message: 'Notification deleted' });
    }));
    // ==================== Session Management Endpoints ====================
    /**
     * GET /api/mobile/session
     * Get current session info
     */
    router.get('/session', (0, index_js_1.asyncHandler)(async (req, res) => {
        const session = req.mobileSession;
        const device = getDevice(req.deviceId);
        (0, index_js_1.sendSuccess)(res, {
            session: {
                id: session.id,
                createdAt: session.createdAt,
                expiresAt: session.expiresAt,
                lastActivity: session.lastActivity,
            },
            device: device ? {
                id: device.id,
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                platform: device.platform,
                appVersion: device.appVersion,
            } : null,
        });
    }));
    /**
     * POST /api/mobile/session/refresh
     * Manually refresh session token
     */
    router.post('/session/refresh', (0, index_js_1.asyncHandler)(async (req, res) => {
        const oldToken = req.headers.authorization?.replace('Bearer ', '');
        const oldSession = req.mobileSession;
        // Revoke old session
        if (oldToken) {
            revokeMobileSession(oldToken);
        }
        // Create new session
        const newSession = createMobileSession(oldSession.userId, oldSession.deviceId, oldSession.ipAddress, oldSession.userAgent);
        // Update device
        const device = getDevice(oldSession.deviceId);
        if (device) {
            device.sessionToken = newSession.token;
            device.sessionExpiry = newSession.expiresAt;
        }
        (0, index_js_1.sendSuccess)(res, {
            token: newSession.token,
            expiresAt: newSession.expiresAt,
        }, { message: 'Session refreshed successfully' });
    }));
    // ==================== AI Task Endpoints ====================
    /**
     * POST /api/mobile/projects/:projectId/prompt
     * Start an AI task from mobile — resolves BYOK keys and proxies to
     * the public API prompt handler.
     */
    router.post('/projects/:projectId/prompt', (0, index_js_1.asyncHandler)(async (req, res) => {
        const userId = req.userId;
        const { projectId } = req.params;
        const { prompt, model, apiKey } = req.body;
        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.MISSING_REQUIRED_FIELD, 'prompt is required');
        }
        // Use provided apiKey or fall back to BYOK keys
        let resolvedApiKey = apiKey;
        if (!resolvedApiKey) {
            const appApiUrl = process.env.APP_API_URL || process.env.MAIN_SITE_URL || 'https://recoder.xyz';
            // Validated at server startup — guaranteed non-empty in production (see server.ts:265)
            const serviceKey = process.env.INTERNAL_SERVICE_KEY ?? '';
            if (serviceKey) {
                try {
                    const { fetchUserByokProviderKeys } = await Promise.resolve().then(() => __importStar(require('../public-api/byok-provider-keys.js')));
                    const keys = await fetchUserByokProviderKeys({
                        appApiUrl,
                        userId,
                        serviceKey,
                    });
                    // Pick the first available key
                    const { getAvailableProviders } = await Promise.resolve().then(() => __importStar(require('../public-api/byok-provider-keys.js')));
                    const available = getAvailableProviders(keys);
                    if (available.length > 0) {
                        resolvedApiKey = keys[available[0]];
                    }
                }
                catch (err) {
                    console.error('[Mobile] Failed to resolve BYOK keys:', err);
                }
            }
        }
        if (!resolvedApiKey) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.AUTH_REQUIRED, 'No API key available. Provide apiKey in body or configure BYOK keys.');
        }
        // Forward to the internal prompt handler
        const backendPort = process.env.PORT || '3001';
        const internalUrl = `http://localhost:${backendPort}/api/v1/projects/${encodeURIComponent(projectId)}/prompt`;
        const upstream = await fetch(internalUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resolvedApiKey}`,
            },
            body: JSON.stringify({
                prompt: prompt.trim(),
                ...(model ? { model } : {}),
            }),
        });
        const payload = await upstream.json().catch(() => ({ success: false, error: 'Invalid response' }));
        res.status(upstream.status).json(payload);
    }));
    /**
     * GET /api/mobile/projects/:projectId/tasks/:taskId
     * Get task status — proxies to the internal task status endpoint.
     */
    router.get('/projects/:projectId/tasks/:taskId', (0, index_js_1.asyncHandler)(async (req, res) => {
        const { projectId, taskId } = req.params;
        const backendPort = process.env.PORT || '3001';
        const internalUrl = `http://localhost:${backendPort}/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;
        const upstream = await fetch(internalUrl);
        const payload = await upstream.json().catch(() => ({ success: false, error: 'Invalid response' }));
        res.status(upstream.status).json(payload);
    }));
    /**
     * GET /api/mobile/projects/:projectId/tasks/:taskId/stream
     * Stream task results via SSE — proxies to the internal stream endpoint
     * with mobile-friendly compression headers.
     */
    router.get('/projects/:projectId/tasks/:taskId/stream', (0, index_js_1.asyncHandler)(async (req, res) => {
        const { projectId, taskId } = req.params;
        const backendPort = process.env.PORT || '3001';
        const internalUrl = `http://localhost:${backendPort}/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/stream`;
        const headers = {
            'Accept': 'text/event-stream',
        };
        const lastEventId = req.headers['last-event-id'];
        if (typeof lastEventId === 'string') {
            headers['Last-Event-ID'] = lastEventId;
        }
        const upstream = await fetch(internalUrl, { headers });
        if (!upstream.ok || !upstream.body) {
            const payload = await upstream.json().catch(() => ({ success: false, error: 'Invalid response' }));
            res.status(upstream.status).json(payload);
            return;
        }
        res.writeHead(upstream.status, {
            'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        // Pipe the upstream SSE stream to the mobile client
        const reader = upstream.body.getReader();
        const pump = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    res.write(value);
                }
            }
            catch {
                // Client disconnected or upstream error
            }
            finally {
                res.end();
            }
        };
        pump();
        req.on('close', () => {
            reader.cancel().catch(() => { });
        });
    }));
    return router;
}
