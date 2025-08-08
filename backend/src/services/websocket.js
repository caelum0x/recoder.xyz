const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const { User, UserDevice, UsageAnalytics } = require('../models/index');

class WebSocketService {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> Set of socketIds
    this.userSessions = new Map(); // socketId -> userSession
    this.deviceSessions = new Map(); // deviceId -> socketId
    this.collaborationRooms = new Map(); // projectId -> Set of socketIds
    
    this.setupMiddleware();
    this.setupEventHandlers();
    
    logger.info('WebSocket service initialized');
  }

  setupMiddleware() {
    // Authentication middleware for WebSocket connections
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.userId);
        
        if (!user || !user.isActive) {
          return next(new Error('Invalid or inactive user'));
        }

        // Attach user info to socket
        socket.userId = user.id;
        socket.userEmail = user.email;
        socket.deviceId = socket.handshake.query.deviceId;
        socket.platform = socket.handshake.query.platform || 'unknown';
        
        logger.info(`WebSocket authenticated: ${user.email} on ${socket.platform} (${socket.id})`);
        next();
      } catch (error) {
        logger.error('WebSocket authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  handleConnection(socket) {
    const userId = socket.userId;
    const deviceId = socket.deviceId;
    
    // Track connected users
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId).add(socket.id);

    // Track user session
    this.userSessions.set(socket.id, {
      userId,
      deviceId,
      platform: socket.platform,
      connectedAt: new Date(),
      lastActivity: new Date()
    });

    // Track device session
    if (deviceId) {
      this.deviceSessions.set(deviceId, socket.id);
    }

    // Join user-specific room
    socket.join(`user:${userId}`);
    socket.join(`device:${deviceId}`);

    logger.info(`User ${socket.userEmail} connected via ${socket.platform} (${socket.id})`);

    // Setup event handlers
    this.setupSocketEvents(socket);

    // Send connection acknowledgment
    socket.emit('connected', {
      success: true,
      userId,
      deviceId,
      platform: socket.platform,
      connectedAt: new Date(),
      message: 'Successfully connected to Recoder WebSocket'
    });

    // Notify other user devices about new connection
    socket.to(`user:${userId}`).emit('device_connected', {
      deviceId,
      platform: socket.platform,
      connectedAt: new Date()
    });

    // Track analytics
    this.trackAnalytics(userId, 'websocket_connect', socket.platform, { deviceId });
  }

  setupSocketEvents(socket) {
    const userId = socket.userId;

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Real-time sync events
    socket.on('sync:request', (data) => {
      this.handleSyncRequest(socket, data);
    });

    socket.on('sync:update', (data) => {
      this.handleSyncUpdate(socket, data);
    });

    // Collaboration events
    socket.on('collaboration:join', (data) => {
      this.handleCollaborationJoin(socket, data);
    });

    socket.on('collaboration:leave', (data) => {
      this.handleCollaborationLeave(socket, data);
    });

    socket.on('collaboration:cursor', (data) => {
      this.handleCollaborationCursor(socket, data);
    });

    socket.on('collaboration:edit', (data) => {
      this.handleCollaborationEdit(socket, data);
    });

    // Notification events
    socket.on('notification:subscribe', (data) => {
      this.handleNotificationSubscribe(socket, data);
    });

    socket.on('notification:unsubscribe', (data) => {
      this.handleNotificationUnsubscribe(socket, data);
    });

    // Activity tracking
    socket.on('activity:heartbeat', () => {
      this.handleActivityHeartbeat(socket);
    });

    socket.on('activity:status', (data) => {
      this.handleActivityStatus(socket, data);
    });

    // AI processing events
    socket.on('ai:request', (data) => {
      this.handleAIRequest(socket, data);
    });

    // Cross-platform events
    socket.on('platform:switch', (data) => {
      this.handlePlatformSwitch(socket, data);
    });
  }

  handleDisconnection(socket, reason) {
    const userId = socket.userId;
    const deviceId = socket.deviceId;
    
    // Remove from tracking
    if (this.connectedUsers.has(userId)) {
      this.connectedUsers.get(userId).delete(socket.id);
      if (this.connectedUsers.get(userId).size === 0) {
        this.connectedUsers.delete(userId);
      }
    }

    this.userSessions.delete(socket.id);
    
    if (deviceId) {
      this.deviceSessions.delete(deviceId);
    }

    // Remove from collaboration rooms
    this.collaborationRooms.forEach((sockets, projectId) => {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        socket.to(`collaboration:${projectId}`).emit('collaboration:user_left', {
          userId,
          deviceId,
          platform: socket.platform
        });
      }
    });

    // Notify other user devices
    socket.to(`user:${userId}`).emit('device_disconnected', {
      deviceId,
      platform: socket.platform,
      disconnectedAt: new Date(),
      reason
    });

    logger.info(`User ${socket.userEmail} disconnected from ${socket.platform} (${reason})`);

    // Track analytics
    this.trackAnalytics(userId, 'websocket_disconnect', socket.platform, { deviceId, reason });
  }

  handleSyncRequest(socket, data) {
    const { dataType, version } = data;
    
    // Emit to all user devices except sender
    socket.to(`user:${socket.userId}`).emit('sync:requested', {
      dataType,
      version,
      requestedBy: {
        deviceId: socket.deviceId,
        platform: socket.platform
      },
      timestamp: new Date()
    });

    logger.info(`Sync requested by ${socket.userEmail}: ${dataType} v${version}`);
  }

  handleSyncUpdate(socket, data) {
    const { dataType, version, changes } = data;
    
    // Broadcast sync update to all user devices
    socket.to(`user:${socket.userId}`).emit('sync:updated', {
      dataType,
      version,
      changes,
      updatedBy: {
        deviceId: socket.deviceId,
        platform: socket.platform
      },
      timestamp: new Date()
    });

    logger.info(`Sync updated by ${socket.userEmail}: ${dataType} v${version}`);
    
    // Track analytics
    this.trackAnalytics(socket.userId, 'sync_update', socket.platform, { dataType, version });
  }

  handleCollaborationJoin(socket, data) {
    const { projectId } = data;
    
    if (!projectId) {
      socket.emit('error', { message: 'Project ID required for collaboration' });
      return;
    }

    // Join collaboration room
    socket.join(`collaboration:${projectId}`);
    
    if (!this.collaborationRooms.has(projectId)) {
      this.collaborationRooms.set(projectId, new Set());
    }
    this.collaborationRooms.get(projectId).add(socket.id);

    // Notify other collaborators
    socket.to(`collaboration:${projectId}`).emit('collaboration:user_joined', {
      userId: socket.userId,
      userEmail: socket.userEmail,
      deviceId: socket.deviceId,
      platform: socket.platform,
      joinedAt: new Date()
    });

    // Send current collaborators list
    const collaborators = Array.from(this.collaborationRooms.get(projectId))
      .map(socketId => {
        const session = this.userSessions.get(socketId);
        return session ? {
          userId: session.userId,
          deviceId: session.deviceId,
          platform: session.platform,
          lastActivity: session.lastActivity
        } : null;
      })
      .filter(Boolean);

    socket.emit('collaboration:joined', {
      projectId,
      collaborators,
      joinedAt: new Date()
    });

    logger.info(`${socket.userEmail} joined collaboration for project ${projectId}`);
  }

  handleCollaborationLeave(socket, data) {
    const { projectId } = data;
    
    if (this.collaborationRooms.has(projectId)) {
      this.collaborationRooms.get(projectId).delete(socket.id);
      
      if (this.collaborationRooms.get(projectId).size === 0) {
        this.collaborationRooms.delete(projectId);
      }
    }

    socket.leave(`collaboration:${projectId}`);
    
    // Notify other collaborators
    socket.to(`collaboration:${projectId}`).emit('collaboration:user_left', {
      userId: socket.userId,
      userEmail: socket.userEmail,
      deviceId: socket.deviceId,
      platform: socket.platform,
      leftAt: new Date()
    });

    logger.info(`${socket.userEmail} left collaboration for project ${projectId}`);
  }

  handleCollaborationCursor(socket, data) {
    const { projectId, position, selection } = data;
    
    // Broadcast cursor position to other collaborators
    socket.to(`collaboration:${projectId}`).emit('collaboration:cursor_update', {
      userId: socket.userId,
      deviceId: socket.deviceId,
      position,
      selection,
      timestamp: new Date()
    });
  }

  handleCollaborationEdit(socket, data) {
    const { projectId, edit, fileId } = data;
    
    // Broadcast edit to other collaborators
    socket.to(`collaboration:${projectId}`).emit('collaboration:edit_applied', {
      userId: socket.userId,
      deviceId: socket.deviceId,
      edit,
      fileId,
      timestamp: new Date()
    });

    // Track analytics
    this.trackAnalytics(socket.userId, 'collaboration_edit', socket.platform, { projectId, fileId });
  }

  handleNotificationSubscribe(socket, data) {
    const { channels } = data;
    
    if (Array.isArray(channels)) {
      channels.forEach(channel => {
        socket.join(`notifications:${channel}`);
      });
      
      socket.emit('notification:subscribed', {
        channels,
        subscribedAt: new Date()
      });

      logger.info(`${socket.userEmail} subscribed to notification channels: ${channels.join(', ')}`);
    }
  }

  handleNotificationUnsubscribe(socket, data) {
    const { channels } = data;
    
    if (Array.isArray(channels)) {
      channels.forEach(channel => {
        socket.leave(`notifications:${channel}`);
      });
      
      socket.emit('notification:unsubscribed', {
        channels,
        unsubscribedAt: new Date()
      });
    }
  }

  handleActivityHeartbeat(socket) {
    const session = this.userSessions.get(socket.id);
    if (session) {
      session.lastActivity = new Date();
    }

    socket.emit('activity:heartbeat_ack', {
      timestamp: new Date()
    });
  }

  handleActivityStatus(socket, data) {
    const { status } = data; // 'active', 'idle', 'busy', 'away'
    
    // Broadcast status to other user devices
    socket.to(`user:${socket.userId}`).emit('activity:status_updated', {
      deviceId: socket.deviceId,
      platform: socket.platform,
      status,
      timestamp: new Date()
    });
  }

  handleAIRequest(socket, data) {
    const { requestId, provider, prompt } = data;
    
    // Emit to user's devices to show AI processing status
    socket.to(`user:${socket.userId}`).emit('ai:processing', {
      requestId,
      provider,
      status: 'processing',
      deviceId: socket.deviceId,
      platform: socket.platform,
      timestamp: new Date()
    });

    logger.info(`AI request from ${socket.userEmail}: ${provider} (${requestId})`);
  }

  handlePlatformSwitch(socket, data) {
    const { fromPlatform, toPlatform, context } = data;
    
    // Notify target platform about incoming context
    if (context && context.targetDeviceId) {
      const targetSocketId = this.deviceSessions.get(context.targetDeviceId);
      if (targetSocketId) {
        this.io.to(targetSocketId).emit('platform:context_received', {
          fromPlatform,
          fromDeviceId: socket.deviceId,
          context,
          timestamp: new Date()
        });
      }
    }

    // Track analytics
    this.trackAnalytics(socket.userId, 'platform_switch', fromPlatform, { 
      fromPlatform, 
      toPlatform, 
      hasContext: !!context 
    });
  }

  // Public methods for external services

  sendNotification(userId, notification) {
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        this.io.to(socketId).emit('notification:received', {
          ...notification,
          timestamp: new Date()
        });
      });
      
      logger.info(`Notification sent to user ${userId}: ${notification.type}`);
      return true;
    }
    return false;
  }

  sendToDevice(deviceId, event, data) {
    const socketId = this.deviceSessions.get(deviceId);
    if (socketId) {
      this.io.to(socketId).emit(event, {
        ...data,
        timestamp: new Date()
      });
      return true;
    }
    return false;
  }

  broadcastToChannel(channel, event, data) {
    this.io.to(`notifications:${channel}`).emit(event, {
      ...data,
      timestamp: new Date()
    });
    
    logger.info(`Broadcast to channel ${channel}: ${event}`);
  }

  getConnectedUsers() {
    const users = [];
    this.connectedUsers.forEach((sockets, userId) => {
      const devices = Array.from(sockets).map(socketId => {
        const session = this.userSessions.get(socketId);
        return session ? {
          deviceId: session.deviceId,
          platform: session.platform,
          connectedAt: session.connectedAt,
          lastActivity: session.lastActivity
        } : null;
      }).filter(Boolean);

      users.push({ userId, devices });
    });
    return users;
  }

  getCollaborationStatus(projectId) {
    const collaborators = this.collaborationRooms.get(projectId);
    if (!collaborators) return null;

    return Array.from(collaborators).map(socketId => {
      const session = this.userSessions.get(socketId);
      return session ? {
        userId: session.userId,
        deviceId: session.deviceId,
        platform: session.platform,
        lastActivity: session.lastActivity
      } : null;
    }).filter(Boolean);
  }

  // Analytics tracking
  async trackAnalytics(userId, eventType, platform, metadata = {}) {
    try {
      await UsageAnalytics.create({
        userId,
        eventType,
        platform,
        success: true,
        metadata
      });
    } catch (error) {
      logger.error('Failed to track WebSocket analytics:', error);
    }
  }
}

module.exports = WebSocketService;