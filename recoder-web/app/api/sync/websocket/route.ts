/**
 * Socket.IO API for Real-time Cross-Platform Synchronization
 * Handles Socket.IO connections for real-time sync events
 */

import { NextRequest, NextResponse } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { sessionManager } from '@/lib/sync/session-manager';
import { projectSync } from '@/lib/sync/project-sync';
import { settingsSync } from '@/lib/sync/settings-sync';
import { fileSystemSync } from '@/lib/sync/filesystem-sync';
import ws from 'ws';

declare global {
  var socketIO: SocketIOServer | undefined;
}

function initializeSocketIO(): SocketIOServer {
  if (global.socketIO) {
    return global.socketIO;
  }

  // Create HTTP server instance for Socket.IO
  const httpServer = new HTTPServer();
  
  const io = new SocketIOServer(httpServer, {
    path: '/api/sync/websocket',
    addTrailingSlash: false,
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? [process.env.NEXTAUTH_URL!, 'https://recoder.xyz', 'https://web.recoder.xyz']
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log('Socket.IO connection established:', socket.id);
    
    // Extract connection info from handshake
    const platform = socket.handshake.headers['x-platform'] as string || 'web';
    const sessionId = socket.handshake.headers['x-session-id'] as string;
    const userId = socket.handshake.headers['x-user-id'] as string;
    const projectId = socket.handshake.headers['x-project-id'] as string;
    
    // Store connection context
    socket.data = {
      platform,
      sessionId,
      userId,
      projectId,
    };
    
    // Register connection with appropriate sync managers
    if (sessionId) {
      sessionManager.registerWebSocketConnection(sessionId, socket as any);
    }
    
    if (projectId) {
      projectSync.registerProjectWebSocket(projectId, socket as any);
      fileSystemSync.registerFileSystemWebSocket(projectId, socket as any);
    }
    
    if (userId) {
      settingsSync.registerSettingsWebSocket(userId, socket as any);
    }

    // Handle incoming messages
    socket.on('message', async (data) => {
      try {
        await handleSocketMessage(socket, data, socket.data);
      } catch (error) {
        console.error('Socket.IO message error:', error);
        socket.emit('error', {
          type: 'error',
          message: 'Invalid message format',
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket.IO connection closed:', socket.id);
    });

    socket.on('error', (error) => {
      console.error('Socket.IO error:', error);
    });

    // Send welcome message
    socket.emit('connected', {
      type: 'connected',
      platform,
      timestamp: new Date().toISOString(),
      capabilities: getCapabilitiesForPlatform(platform),
    });
  });

  global.socketIO = io;
  return io;
}

export async function GET(request: NextRequest) {
  try {
    const io = initializeSocketIO();
    
    return NextResponse.json({
      message: 'Socket.IO endpoint ready',
      path: '/api/sync/websocket',
      status: 'active',
    });
  } catch (error) {
    console.error('Socket.IO initialization error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize Socket.IO' },
      { status: 500 }
    );
  }
}

async function handleSocketMessage(
  socket: any,
  message: any,
  context: {
    platform: string;
    sessionId?: string;
    userId?: string;
    projectId?: string;
  }
) {
  const { type, data } = message;

  try {
    switch (type) {
      case 'ping':
        socket.emit('pong', {
          type: 'pong',
          timestamp: new Date().toISOString(),
        });
        break;

      case 'session_heartbeat':
        if (context.sessionId) {
          await sessionManager.updateSessionActivity(context.sessionId, {
            lastHeartbeat: new Date().toISOString(),
          });
        }
        break;

      case 'project_subscribe':
        if (data.projectId) {
          projectSync.registerProjectWebSocket(data.projectId, socket);
          fileSystemSync.registerFileSystemWebSocket(data.projectId, socket);
          
          socket.emit('project_subscribed', {
            type: 'project_subscribed',
            projectId: data.projectId,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'settings_subscribe':
        if (context.userId) {
          settingsSync.registerSettingsWebSocket(context.userId, socket);
          
          socket.emit('settings_subscribed', {
            type: 'settings_subscribed',
            userId: context.userId,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'file_lock_request':
        if (context.projectId && context.userId && context.sessionId) {
          const lockSuccess = await projectSync.lockFile(
            context.projectId,
            data.filePath,
            context.userId,
            context.sessionId,
            context.platform,
            data.duration || 30 * 60 * 1000 // 30 minutes default
          );
          
          socket.emit('file_lock_response', {
            type: 'file_lock_response',
            filePath: data.filePath,
            success: lockSuccess,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'file_unlock_request':
        if (context.projectId && context.userId && context.sessionId) {
          const unlockSuccess = await projectSync.unlockFile(
            context.projectId,
            data.filePath,
            context.userId,
            context.sessionId,
            context.platform
          );
          
          socket.emit('file_unlock_response', {
            type: 'file_unlock_response',
            filePath: data.filePath,
            success: unlockSuccess,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'file_tree_request':
        if (context.projectId && context.userId) {
          const fileTree = await projectSync.getProjectFileTree(context.projectId, context.userId);
          
          socket.emit('file_tree_response', {
            type: 'file_tree_response',
            projectId: context.projectId,
            files: fileTree,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'file_content_request':
        if (context.projectId && context.userId && data.filePath) {
          const fileData = await projectSync.getFileContent(
            context.projectId,
            data.filePath,
            context.userId
          );
          
          socket.emit('file_content_response', {
            type: 'file_content_response',
            filePath: data.filePath,
            fileData,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'file_update':
        if (context.projectId && context.userId && context.sessionId && data.filePath) {
          const updatedFile = await projectSync.updateFile(
            context.projectId,
            data.filePath,
            data.content,
            context.userId,
            context.sessionId,
            context.platform
          );
          
          socket.emit('file_update_response', {
            type: 'file_update_response',
            filePath: data.filePath,
            file: updatedFile,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'directory_create':
        if (context.projectId && context.userId && context.sessionId && data.dirPath) {
          const newDirectory = await projectSync.createDirectory(
            context.projectId,
            data.dirPath,
            context.userId,
            context.sessionId,
            context.platform
          );
          
          socket.emit('directory_create_response', {
            type: 'directory_create_response',
            dirPath: data.dirPath,
            directory: newDirectory,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'file_delete':
        if (context.projectId && context.userId && context.sessionId && data.filePath) {
          const deleteSuccess = await projectSync.deleteFile(
            context.projectId,
            data.filePath,
            context.userId,
            context.sessionId,
            context.platform
          );
          
          socket.emit('file_delete_response', {
            type: 'file_delete_response',
            filePath: data.filePath,
            success: deleteSuccess,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'sync_status_request':
        const syncStatus = {
          session: context.sessionId ? await sessionManager.getSession(context.sessionId) : null,
          project: context.projectId ? await projectSync.getProject(context.projectId, context.userId) : null,
          settings: context.userId ? await settingsSync.getUserSettings(context.userId) : null,
        };
        
        socket.emit('sync_status_response', {
          type: 'sync_status_response',
          status: syncStatus,
          timestamp: new Date().toISOString(),
        });
        break;

      default:
        socket.emit('error', {
          type: 'error',
          message: `Unknown message type: ${type}`,
          timestamp: new Date().toISOString(),
        });
    }
  } catch (error) {
    console.error('Socket.IO message handling error:', error);
    socket.emit('error', {
      type: 'error',
      message: 'Message processing failed',
      timestamp: new Date().toISOString(),
    });
  }
}

function getCapabilitiesForPlatform(platform: string): string[] {
  const capabilities: Record<string, string[]> = {
    web: [
      'real_time_sync',
      'file_editing',
      'project_management',
      'settings_sync',
      'collaboration',
      'video_call',
      'screen_sharing',
    ],
    mobile: [
      'real_time_sync',
      'file_viewing',
      'project_management',
      'settings_sync',
      'push_notifications',
      'offline_mode',
    ],
    desktop: [
      'real_time_sync',
      'file_editing',
      'project_management',
      'settings_sync',
      'collaboration',
      'file_system_access',
      'native_notifications',
    ],
    cli: [
      'real_time_sync',
      'file_editing',
      'project_management',
      'batch_operations',
      'automation',
    ],
    vscode: [
      'real_time_sync',
      'file_editing',
      'project_management',
      'settings_sync',
      'collaboration',
      'editor_integration',
      'debugging',
    ],
  };

  return capabilities[platform] || [];
}
