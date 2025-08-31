import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { NextApiRequest } from 'next';
import { Socket as NetSocket } from 'net';

interface SocketServer extends HTTPServer {
  io?: SocketIOServer | undefined;
}

interface SocketWithIO extends NetSocket {
  server: SocketServer;
}

interface NextApiResponseWithSocket extends NextApiRequest {
  socket: SocketWithIO;
}

// Collaboration events
interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  cursor?: { line: number; column: number };
  selection?: { start: number; end: number };
  color: string;
}

interface CollaborationEvent {
  type: 'cursor-move' | 'text-change' | 'selection-change' | 'user-join' | 'user-leave';
  projectId: string;
  userId: string;
  data: any;
  timestamp: number;
}

// Store active rooms and users
const activeRooms = new Map<string, Set<string>>();
const userInfo = new Map<string, CollaborationUser>();

export const initializeWebSocket = (server: HTTPServer) => {
  if (!(server as SocketServer).io) {
    const io = new SocketIOServer(server, {
      path: '/api/socket',
      cors: {
        origin: ["http://localhost:3010", "https://web.recoder.xyz"],
        methods: ["GET", "POST"]
      }
    });

    (server as SocketServer).io = io;

    io.on('connection', (socket) => {
      console.log('WebSocket client connected:', socket.id);

      // Join a project room for collaboration
      socket.on('join-project', ({ projectId, user }) => {
        socket.join(projectId);
        
        // Add user to room
        if (!activeRooms.has(projectId)) {
          activeRooms.set(projectId, new Set());
        }
        activeRooms.get(projectId)!.add(socket.id);
        
        // Store user info
        userInfo.set(socket.id, {
          ...user,
          color: generateUserColor(user.id)
        });

        // Notify others that user joined
        socket.to(projectId).emit('user-joined', {
          user: userInfo.get(socket.id),
          socketId: socket.id
        });

        // Send current room users to the new user
        const roomUsers = Array.from(activeRooms.get(projectId) || [])
          .map(socketId => userInfo.get(socketId))
          .filter(Boolean);
        
        socket.emit('room-users', roomUsers);
      });

      // Handle cursor movements
      socket.on('cursor-move', ({ projectId, cursor }) => {
        const user = userInfo.get(socket.id);
        if (user) {
          user.cursor = cursor;
          socket.to(projectId).emit('cursor-update', {
            userId: user.id,
            socketId: socket.id,
            cursor,
            color: user.color
          });
        }
      });

      // Handle text changes
      socket.on('text-change', ({ projectId, changes, version }) => {
        const user = userInfo.get(socket.id);
        if (user) {
          socket.to(projectId).emit('text-update', {
            userId: user.id,
            socketId: socket.id,
            changes,
            version,
            timestamp: Date.now()
          });
        }
      });

      // Handle selection changes
      socket.on('selection-change', ({ projectId, selection }) => {
        const user = userInfo.get(socket.id);
        if (user) {
          user.selection = selection;
          socket.to(projectId).emit('selection-update', {
            userId: user.id,
            socketId: socket.id,
            selection,
            color: user.color
          });
        }
      });

      // Handle file changes
      socket.on('file-change', ({ projectId, filePath, content, version }) => {
        socket.to(projectId).emit('file-update', {
          filePath,
          content,
          version,
          timestamp: Date.now()
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('WebSocket client disconnected:', socket.id);
        
        // Remove user from all rooms
        for (const [projectId, users] of activeRooms.entries()) {
          if (users.has(socket.id)) {
            users.delete(socket.id);
            
            // Notify others that user left
            const user = userInfo.get(socket.id);
            if (user) {
              socket.to(projectId).emit('user-left', {
                userId: user.id,
                socketId: socket.id
              });
            }

            // Clean up empty rooms
            if (users.size === 0) {
              activeRooms.delete(projectId);
            }
          }
        }
        
        // Clean up user info
        userInfo.delete(socket.id);
      });

      // Handle typing indicators
      socket.on('typing-start', ({ projectId }) => {
        const user = userInfo.get(socket.id);
        if (user) {
          socket.to(projectId).emit('user-typing', {
            userId: user.id,
            socketId: socket.id,
            typing: true
          });
        }
      });

      socket.on('typing-stop', ({ projectId }) => {
        const user = userInfo.get(socket.id);
        if (user) {
          socket.to(projectId).emit('user-typing', {
            userId: user.id,
            socketId: socket.id,
            typing: false
          });
        }
      });
    });

    console.log('WebSocket server initialized');
  }
};

// Generate consistent color for each user
function generateUserColor(userId: string): string {
  const colors = [
    '#3B82F6', // blue
    '#10B981', // emerald
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // violet
    '#06B6D4', // cyan
    '#F97316', // orange
    '#84CC16', // lime
    '#EC4899', // pink
    '#6366F1', // indigo
  ];
  
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) & 0xffffffff;
  }
  
  return colors[Math.abs(hash) % colors.length];
}

export type { CollaborationUser, CollaborationEvent };
