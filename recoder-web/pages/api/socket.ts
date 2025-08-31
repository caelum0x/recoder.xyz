import { Server as SocketIOServer } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';

interface User {
  id: string;
  name: string;
  projectId: string;
  socketId: string;
  color: string;
  cursor?: any;
  selection?: any;
  typing: boolean;
}

const COLLABORATOR_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
  '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'
];

// In-memory storage for active collaborators (in production, use Redis)
const activeUsers = new Map<string, User>();
const projectRooms = new Map<string, Set<string>>();

const getUserColor = (userId: string): string => {
  const hash = userId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if ((res as any).socket.server.io) {
    console.log('Socket.IO server already running');
    res.end();
    return;
  }

  console.log('Initializing Socket.IO server for collaboration...');

  const io = new SocketIOServer((res as any).socket.server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Collaboration namespace
  const collaborationIO = io.of('/collaboration');

  collaborationIO.on('connection', (socket) => {
    console.log('User connected to collaboration:', socket.id);

    const { projectId, userId, userName } = socket.handshake.query;

    if (!projectId || !userId || !userName) {
      socket.disconnect();
      return;
    }

    const user: User = {
      id: userId as string,
      name: userName as string,
      projectId: projectId as string,
      socketId: socket.id,
      color: getUserColor(userId as string),
      typing: false
    };

    // Join project room
    socket.join(projectId as string);

    // Add user to active users
    activeUsers.set(socket.id, user);

    // Add user to project room
    if (!projectRooms.has(projectId as string)) {
      projectRooms.set(projectId as string, new Set());
    }
    projectRooms.get(projectId as string)?.add(socket.id);

    // Notify other users in the project about the new user
    socket.to(projectId as string).emit('user-joined', {
      id: user.id,
      name: user.name,
      color: user.color,
      typing: false
    });

    // Send current users in the project to the new user
    const projectUsers = Array.from(projectRooms.get(projectId as string) || [])
      .map(socketId => activeUsers.get(socketId))
      .filter((u): u is User => u !== undefined && u.socketId !== socket.id);

    projectUsers.forEach(otherUser => {
      socket.emit('user-joined', {
        id: otherUser.id,
        name: otherUser.name,
        color: otherUser.color,
        cursor: otherUser.cursor,
        selection: otherUser.selection,
        typing: otherUser.typing
      });
    });

    // Handle cursor movements
    socket.on('cursor-move', (data) => {
      const user = activeUsers.get(socket.id);
      if (user) {
        user.cursor = data.position;
        user.selection = data.selection;
        
        socket.to(projectId as string).emit('cursor-moved', {
          userId: user.id,
          position: data.position,
          selection: data.selection
        });
      }
    });

    // Handle text changes
    socket.on('text-change', (edit) => {
      socket.to(projectId as string).emit('text-changed', {
        ...edit,
        userId: user.id,
        timestamp: Date.now()
      });
    });

    // Handle typing indicators
    socket.on('user-typing', (data) => {
      const user = activeUsers.get(socket.id);
      if (user) {
        user.typing = data.typing;
        
        socket.to(projectId as string).emit('user-typing', {
          userId: user.id,
          typing: data.typing
        });
      }
    });

    // Handle file changes
    socket.on('file-change', (data) => {
      socket.to(projectId as string).emit('file-changed', {
        ...data,
        userId: user.id,
        timestamp: Date.now()
      });
    });

    // Handle project events
    socket.on('project-event', (data) => {
      socket.to(projectId as string).emit('project-event', {
        ...data,
        userId: user.id,
        userName: user.name,
        timestamp: Date.now()
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected from collaboration:', socket.id);

      const user = activeUsers.get(socket.id);
      if (user) {
        // Remove user from project room
        projectRooms.get(user.projectId)?.delete(socket.id);
        
        // Clean up empty project rooms
        if (projectRooms.get(user.projectId)?.size === 0) {
          projectRooms.delete(user.projectId);
        }

        // Notify other users
        socket.to(user.projectId).emit('user-left', user.id);

        // Remove user from active users
        activeUsers.delete(socket.id);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  (res as any).socket.server.io = io;
  console.log('Socket.IO collaboration server initialized');
  res.end();
}
