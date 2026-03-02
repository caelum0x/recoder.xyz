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
import { Router as ExpressRouter } from 'express';
import zlib from 'zlib';
import { promisify } from 'util';
import crypto from 'crypto';
import {
  AppError,
  ErrorCode,
  sendError,
  sendSuccess,
  asyncHandler,
} from '../errors/index.js';
import { syncManager, SyncOperation, ConflictResolution } from './sync.js';
import { pushNotificationService, NotificationType, PushTokenType } from './push.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ==================== Types ====================

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
  cursor?: { file: string; line: number; column: number };
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

// ==================== Constants ====================

const MOBILE_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const MOBILE_SESSION_REFRESH_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // Refresh if < 7 days remaining
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const COMPRESSION_THRESHOLD = 1024; // Compress responses > 1KB

// ==================== Storage ====================

// In-memory storage (replace with database in production)
const mobileDevices = new Map<string, MobileDevice>();
const mobileSessions = new Map<string, MobileSession>();
const mobileNotifications = new Map<string, MobileNotification[]>();
const devicesByUser = new Map<string, Set<string>>();

// ==================== Compression Utilities ====================

/**
 * Compress data for mobile transfer
 */
export async function compressResponse(data: unknown): Promise<{ compressed: Buffer; originalSize: number; compressedSize: number }> {
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
export async function decompressRequest(data: Buffer, isCompressed: boolean): Promise<unknown> {
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
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate device ID from device info
 */
function generateDeviceId(platform: string, deviceName: string, userId: string): string {
  const data = `${platform}:${deviceName}:${userId}:${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

/**
 * Create mobile session
 */
export function createMobileSession(
  userId: string,
  deviceId: string,
  ipAddress?: string,
  userAgent?: string
): MobileSession {
  const now = Date.now();
  const session: MobileSession = {
    id: crypto.randomUUID(),
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
export function validateMobileSession(token: string): MobileSession | null {
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
export function revokeMobileSession(token: string): boolean {
  return mobileSessions.delete(token);
}

/**
 * Revoke all sessions for a device
 */
export function revokeDeviceSessions(deviceId: string): number {
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
export function revokeUserSessions(userId: string): number {
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
export function registerDevice(
  userId: string,
  deviceInfo: {
    deviceName: string;
    platform: 'ios' | 'android' | 'web';
    appVersion: string;
    osVersion: string;
    pushToken?: string;
    pushTokenType?: PushTokenType;
  },
  ipAddress?: string,
  userAgent?: string
): { device: MobileDevice; session: MobileSession } {
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
  } else {
    // Create new device
    const session = createMobileSession(userId, deviceId, ipAddress, userAgent);

    device = {
      id: crypto.randomUUID(),
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
    devicesByUser.get(userId)!.add(deviceId);

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
export function getDevice(deviceId: string): MobileDevice | undefined {
  return mobileDevices.get(deviceId);
}

/**
 * Get all devices for a user
 */
export function getUserDevices(userId: string): MobileDevice[] {
  const deviceIds = devicesByUser.get(userId);
  if (!deviceIds) {
    return [];
  }

  const devices: MobileDevice[] = [];
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
export function removeDevice(deviceId: string): boolean {
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
export function updatePushToken(
  deviceId: string,
  pushToken: string,
  pushTokenType: PushTokenType
): boolean {
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
export function addNotification(
  userId: string,
  notification: Omit<MobileNotification, 'id' | 'read' | 'createdAt'>
): MobileNotification {
  const fullNotification: MobileNotification = {
    ...notification,
    id: crypto.randomUUID(),
    read: false,
    createdAt: Date.now(),
  };

  if (!mobileNotifications.has(userId)) {
    mobileNotifications.set(userId, []);
  }

  const notifications = mobileNotifications.get(userId)!;
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
export function getNotifications(
  userId: string,
  options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): PaginatedResponse<MobileNotification> {
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
export function markNotificationRead(userId: string, notificationId: string): boolean {
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
export function markAllNotificationsRead(userId: string): number {
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
export function deleteNotification(userId: string, notificationId: string): boolean {
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
export function mobileAuthMiddleware(
  req: MobileAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    sendError(res, ErrorCode.AUTH_REQUIRED, { message: 'Mobile session token required' });
    return;
  }

  const session = validateMobileSession(token);

  if (!session) {
    sendError(res, ErrorCode.AUTH_TOKEN_EXPIRED, { message: 'Mobile session expired or invalid' });
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
export function mobileCompressionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const supportsGzip = acceptEncoding.includes('gzip');

  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method with compression
  res.json = function(data: unknown): Response {
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
export function transformProjectForMobile(project: Record<string, unknown>): MobileProject {
  return {
    id: project.id as string,
    name: project.name as string,
    description: project.description as string | undefined,
    template: project.template as string | undefined,
    language: project.language as string | undefined,
    framework: project.framework as string | undefined,
    createdAt: project.createdAt as number || Date.now(),
    updatedAt: project.updatedAt as number || Date.now(),
    lastOpenedAt: project.lastOpenedAt as number | undefined,
    thumbnailUrl: project.thumbnailUrl as string | undefined,
    fileCount: project.fileCount as number || 0,
    totalSize: project.totalSize as number || 0,
    isStarred: project.isStarred as boolean || false,
    syncStatus: (project.syncStatus as 'synced' | 'pending' | 'conflict') || 'synced',
    lastSyncAt: project.lastSyncAt as number | undefined,
  };
}

/**
 * Transform file data for mobile consumption
 */
export function transformFileForMobile(file: Record<string, unknown>): MobileFile {
  return {
    path: file.path as string,
    name: file.name as string || (file.path as string).split('/').pop() || '',
    type: file.type as 'file' | 'directory',
    size: file.size as number | undefined,
    modifiedAt: file.modifiedAt as number || Date.now(),
    mimeType: file.mimeType as string | undefined,
    isNew: file.isNew as boolean | undefined,
    isModified: file.isModified as boolean | undefined,
    isDeleted: file.isDeleted as boolean | undefined,
  };
}

// ==================== API Factory ====================

/**
 * Interface for project data fetching (to be implemented by the main app)
 */
export interface MobileApiDependencies {
  // Fetch projects for a user
  fetchUserProjects: (userId: string, options?: {
    limit?: number;
    offset?: number;
    search?: string;
    sortBy?: 'name' | 'updatedAt' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  }) => Promise<{ projects: Record<string, unknown>[]; total: number }>;

  // Fetch single project details
  fetchProjectDetail: (userId: string, projectId: string) => Promise<Record<string, unknown> | null>;

  // Fetch project files
  fetchProjectFiles: (userId: string, projectId: string, path?: string) => Promise<Record<string, unknown>[]>;

  // Check project ownership
  checkProjectOwnership: (userId: string, projectId: string) => Promise<boolean>;

  // Get container for project
  getContainer: (projectId: string) => { id: string; port: number } | undefined;

  // Execute command in container
  execInContainer: (containerId: string, command: string) => Promise<string>;
}

/**
 * Create mobile API router with dependencies
 */
export function createMobileApiRouter(deps: MobileApiDependencies): Router {
  const router = ExpressRouter();

  // Apply mobile-specific middleware
  router.use(mobileCompressionMiddleware);

  // ==================== Device Registration ====================

  /**
   * POST /api/mobile/register
   * Register a mobile device and create session
   */
  router.post('/register', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const {
      userId,
      deviceName,
      platform,
      appVersion,
      osVersion,
      pushToken,
      pushTokenType,
    } = req.body;

    if (!userId || !deviceName || !platform || !appVersion || !osVersion) {
      throw new AppError(ErrorCode.MISSING_REQUIRED_FIELD, 'Missing required fields: userId, deviceName, platform, appVersion, osVersion');
    }

    if (!['ios', 'android', 'web'].includes(platform)) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Invalid platform. Must be ios, android, or web');
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const { device, session } = registerDevice(
      userId,
      { deviceName, platform, appVersion, osVersion, pushToken, pushTokenType },
      ipAddress,
      userAgent
    );

    console.log(`[Mobile] Device registered: ${device.deviceId} for user ${userId}`);

    sendSuccess(res, {
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
  router.post('/session/validate', asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body as { token?: string };

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
  router.post('/logout', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      revokeMobileSession(token);
    }

    sendSuccess(res, null, { message: 'Logged out successfully' });
  }));

  /**
   * GET /api/mobile/devices
   * Get all registered devices for the user
   */
  router.get('/devices', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const devices = getUserDevices(userId);

    sendSuccess(res, {
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
  router.delete('/devices/:deviceId', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const { deviceId } = req.params;
    const device = getDevice(deviceId);

    if (!device || device.userId !== req.userId) {
      throw new AppError(ErrorCode.FILE_NOT_FOUND, 'Device not found');
    }

    removeDevice(deviceId);

    sendSuccess(res, null, { message: 'Device removed successfully' });
  }));

  /**
   * POST /api/mobile/push/token
   * Register or update push notification token
   */
  router.post('/push/token', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const { token, tokenType } = req.body;

    if (!token || !tokenType) {
      throw new AppError(ErrorCode.MISSING_REQUIRED_FIELD, 'Missing required fields: token, tokenType');
    }

    if (!['expo', 'fcm', 'apns'].includes(tokenType)) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Invalid tokenType. Must be expo, fcm, or apns');
    }

    const updated = updatePushToken(req.deviceId!, token, tokenType);

    if (!updated) {
      throw new AppError(ErrorCode.FILE_NOT_FOUND, 'Device not found');
    }

    // Register token with push service
    await pushNotificationService.registerToken(req.userId!, req.deviceId!, token, tokenType);

    sendSuccess(res, null, { message: 'Push token registered successfully' });
  }));

  /**
   * DELETE /api/mobile/push/token
   * Remove push notification token
   */
  router.delete('/push/token', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const device = getDevice(req.deviceId!);

    if (device && device.pushToken) {
      await pushNotificationService.unregisterToken(req.userId!, req.deviceId!);
      device.pushToken = undefined;
      device.pushTokenType = undefined;
    }

    sendSuccess(res, null, { message: 'Push token removed successfully' });
  }));

  // ==================== Project Endpoints ====================

  /**
   * GET /api/mobile/projects
   * Get paginated list of user's projects (mobile-optimized)
   */
  router.get('/projects', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const {
      page = '1',
      pageSize = String(DEFAULT_PAGE_SIZE),
      search,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
    } = req.query;

    const limit = Math.min(parseInt(pageSize as string, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = (parseInt(page as string, 10) - 1) * limit;

    const { projects, total } = await deps.fetchUserProjects(userId, {
      limit,
      offset,
      search: search as string | undefined,
      sortBy: sortBy as 'name' | 'updatedAt' | 'createdAt',
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    const mobileProjects = projects.map(transformProjectForMobile);

    const response: PaginatedResponse<MobileProject> = {
      items: mobileProjects,
      total,
      page: parseInt(page as string, 10) || 1,
      pageSize: limit,
      hasMore: offset + limit < total,
      nextCursor: offset + limit < total ? String(offset + limit) : undefined,
    };

    sendSuccess(res, response);
  }));

  /**
   * GET /api/mobile/project/:projectId
   * Get detailed project information (mobile-optimized)
   */
  router.get('/project/:projectId', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const { projectId } = req.params;
    const { includeFiles = 'true', depth = '1' } = req.query;

    // Check ownership
    const isOwner = await deps.checkProjectOwnership(userId, projectId);
    if (!isOwner) {
      throw new AppError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this project');
    }

    const project = await deps.fetchProjectDetail(userId, projectId);

    if (!project) {
      throw new AppError(ErrorCode.FILE_NOT_FOUND, 'Project not found');
    }

    const mobileProject = transformProjectForMobile(project);

    let files: MobileFile[] = [];
    if (includeFiles === 'true') {
      const rawFiles = await deps.fetchProjectFiles(userId, projectId);
      files = rawFiles.map(transformFileForMobile);

      // Limit depth if specified
      const maxDepth = parseInt(depth as string, 10) || 1;
      files = files.filter(f => {
        const fileDepth = f.path.split('/').filter(Boolean).length;
        return fileDepth <= maxDepth;
      });
    }

    // Get container info
    const container = deps.getContainer(projectId);

    const detail: MobileProjectDetail = {
      ...mobileProject,
      files,
      recentFiles: (project.recentFiles as string[]) || [],
      collaborators: (project.collaborators as MobileCollaborator[]) || [],
      gitBranch: project.gitBranch as string | undefined,
      gitStatus: project.gitStatus as MobileGitStatus | undefined,
      devServerUrl: container ? `http://localhost:${container.port}` : undefined,
      previewUrl: project.previewUrl as string | undefined,
    };

    sendSuccess(res, detail);
  }));

  /**
   * GET /api/mobile/project/:projectId/files
   * Get project files with pagination (for large projects)
   */
  router.get('/project/:projectId/files', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const { projectId } = req.params;
    const { path = '', page = '1', pageSize = '50' } = req.query;

    // Check ownership
    const isOwner = await deps.checkProjectOwnership(userId, projectId);
    if (!isOwner) {
      throw new AppError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this project');
    }

    const rawFiles = await deps.fetchProjectFiles(userId, projectId, path as string);
    const files = rawFiles.map(transformFileForMobile);

    const limit = Math.min(parseInt(pageSize as string, 10) || 50, 200);
    const offset = (parseInt(page as string, 10) - 1) * limit;
    const paginatedFiles = files.slice(offset, offset + limit);

    const response: PaginatedResponse<MobileFile> = {
      items: paginatedFiles,
      total: files.length,
      page: parseInt(page as string, 10) || 1,
      pageSize: limit,
      hasMore: offset + limit < files.length,
    };

    sendSuccess(res, response);
  }));

  // ==================== Sync Endpoints ====================

  /**
   * POST /api/mobile/sync
   * Sync changes between mobile and server
   */
  router.post('/sync', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const deviceId = req.deviceId!;
    const { projectId, operations, lastSyncAt, conflictResolution = 'server_wins' } = req.body;

    if (!projectId) {
      throw new AppError(ErrorCode.MISSING_REQUIRED_FIELD, 'projectId is required');
    }

    // Check ownership
    const isOwner = await deps.checkProjectOwnership(userId, projectId);
    if (!isOwner) {
      throw new AppError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this project');
    }

    // Process sync operations
    const result = await syncManager.processSync(
      userId,
      deviceId,
      projectId,
      operations as SyncOperation[],
      lastSyncAt as number | undefined,
      conflictResolution as ConflictResolution
    );

    sendSuccess(res, result);
  }));

  /**
   * GET /api/mobile/sync/status/:projectId
   * Get sync status for a project
   */
  router.get('/sync/status/:projectId', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const deviceId = req.deviceId!;
    const { projectId } = req.params;

    // Check ownership
    const isOwner = await deps.checkProjectOwnership(userId, projectId);
    if (!isOwner) {
      throw new AppError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this project');
    }

    const status = syncManager.getSyncStatus(userId, deviceId, projectId);

    sendSuccess(res, status);
  }));

  /**
   * GET /api/mobile/sync/pending/:projectId
   * Get pending sync operations for a project
   */
  router.get('/sync/pending/:projectId', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const deviceId = req.deviceId!;
    const { projectId } = req.params;
    const { since } = req.query;

    // Check ownership
    const isOwner = await deps.checkProjectOwnership(userId, projectId);
    if (!isOwner) {
      throw new AppError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this project');
    }

    const pending = syncManager.getPendingOperations(
      userId,
      deviceId,
      projectId,
      since ? parseInt(since as string, 10) : undefined
    );

    sendSuccess(res, pending);
  }));

  // ==================== Notification Endpoints ====================

  /**
   * GET /api/mobile/notifications
   * Get user notifications
   */
  router.get('/notifications', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const { unreadOnly = 'false', page = '1', pageSize = String(DEFAULT_PAGE_SIZE) } = req.query;

    const limit = Math.min(parseInt(pageSize as string, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = (parseInt(page as string, 10) - 1) * limit;

    const response = getNotifications(userId, {
      unreadOnly: unreadOnly === 'true',
      limit,
      offset,
    });

    sendSuccess(res, response);
  }));

  /**
   * POST /api/mobile/notifications/:notificationId/read
   * Mark notification as read
   */
  router.post('/notifications/:notificationId/read', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const { notificationId } = req.params;

    const marked = markNotificationRead(userId, notificationId);

    if (!marked) {
      throw new AppError(ErrorCode.FILE_NOT_FOUND, 'Notification not found');
    }

    sendSuccess(res, null, { message: 'Notification marked as read' });
  }));

  /**
   * POST /api/mobile/notifications/read-all
   * Mark all notifications as read
   */
  router.post('/notifications/read-all', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const count = markAllNotificationsRead(userId);

    sendSuccess(res, { count }, { message: `${count} notifications marked as read` });
  }));

  /**
   * DELETE /api/mobile/notifications/:notificationId
   * Delete a notification
   */
  router.delete('/notifications/:notificationId', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const { notificationId } = req.params;

    const deleted = deleteNotification(userId, notificationId);

    if (!deleted) {
      throw new AppError(ErrorCode.FILE_NOT_FOUND, 'Notification not found');
    }

    sendSuccess(res, null, { message: 'Notification deleted' });
  }));

  // ==================== Session Management Endpoints ====================

  /**
   * GET /api/mobile/session
   * Get current session info
   */
  router.get('/session', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const session = req.mobileSession!;
    const device = getDevice(req.deviceId!);

    sendSuccess(res, {
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
  router.post('/session/refresh', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const oldToken = req.headers.authorization?.replace('Bearer ', '');
    const oldSession = req.mobileSession!;

    // Revoke old session
    if (oldToken) {
      revokeMobileSession(oldToken);
    }

    // Create new session
    const newSession = createMobileSession(
      oldSession.userId,
      oldSession.deviceId,
      oldSession.ipAddress,
      oldSession.userAgent
    );

    // Update device
    const device = getDevice(oldSession.deviceId);
    if (device) {
      device.sessionToken = newSession.token;
      device.sessionExpiry = newSession.expiresAt;
    }

    sendSuccess(res, {
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
  router.post('/projects/:projectId/prompt', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const { projectId } = req.params;
    const { prompt, model, apiKey } = req.body as {
      prompt?: string;
      model?: string;
      apiKey?: string;
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new AppError(ErrorCode.MISSING_REQUIRED_FIELD, 'prompt is required');
    }

    // Use provided apiKey or fall back to BYOK keys
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      const appApiUrl = process.env.APP_API_URL || process.env.MAIN_SITE_URL || 'http://localhost:3000';
      // Validated at server startup — guaranteed non-empty in production (see server.ts:265)
      const serviceKey = process.env.INTERNAL_SERVICE_KEY ?? '';
      if (serviceKey) {
        try {
          const { fetchUserByokProviderKeys } = await import('../public-api/byok-provider-keys.js');
          const keys = await fetchUserByokProviderKeys({
            appApiUrl,
            userId,
            serviceKey,
          });
          // Pick the first available key
          const { getAvailableProviders } = await import('../public-api/byok-provider-keys.js');
          const available = getAvailableProviders(keys);
          if (available.length > 0) {
            resolvedApiKey = keys[available[0]!];
          }
        } catch (err) {
          console.error('[Mobile] Failed to resolve BYOK keys:', err);
        }
      }
    }

    if (!resolvedApiKey) {
      throw new AppError(ErrorCode.AUTH_REQUIRED, 'No API key available. Provide apiKey in body or configure BYOK keys.');
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
  router.get('/projects/:projectId/tasks/:taskId', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
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
  router.get('/projects/:projectId/tasks/:taskId/stream', asyncHandler(async (req: MobileAuthenticatedRequest, res: Response) => {
    const { projectId, taskId } = req.params;

    const backendPort = process.env.PORT || '3001';
    const internalUrl = `http://localhost:${backendPort}/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/stream`;

    const headers: Record<string, string> = {
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
    const reader = (upstream.body as ReadableStream).getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch {
        // Client disconnected or upstream error
      } finally {
        res.end();
      }
    };
    pump();

    req.on('close', () => {
      reader.cancel().catch(() => {});
    });
  }));

  return router;
}
