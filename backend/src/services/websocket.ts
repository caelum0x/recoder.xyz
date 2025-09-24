import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { matchmakingService } from './matchmaking';
import { prisma } from '../database/prisma';
import { getErrorMessage } from '../utils/error-helpers';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

class WebSocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, AuthenticatedSocket> = new Map();

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.setupMatchmakingEvents();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
        
        // Get user information
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, name: true, email: true }
        });

        if (!user) {
          return next(new Error('Authentication error: User not found'));
        }

        socket.userId = user.id;
        socket.userName = user.name;
        next();
      } catch (error) {
        next(new Error('Authentication error: Invalid token'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`User ${socket.userName} (${socket.userId}) connected via WebSocket`);
      
      // Store connected user
      if (socket.userId) {
        this.connectedUsers.set(socket.userId, socket);
        
        // Join user to their personal room for private messages
        socket.join(`user:${socket.userId}`);
      }

      // Handle matchmaking events
      this.handleMatchmakingEvents(socket);
      
      // Handle game room events
      this.handleGameRoomEvents(socket);
      
      // Handle player events
      this.handlePlayerEvents(socket);

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${socket.userName} (${socket.userId}) disconnected`);
        
        if (socket.userId) {
          this.connectedUsers.delete(socket.userId);
          
          // Auto-leave matchmaking queue on disconnect
          matchmakingService.leaveQueue(socket.userId).catch(console.error);
        }
      });
    });
  }

  private handleMatchmakingEvents(socket: AuthenticatedSocket): void {
    // Join matchmaking queue
    socket.on('matchmaking:join', async (data) => {
      try {
        if (!socket.userId) return;

        const request = {
          userId: socket.userId,
          gameMode: data.gameMode,
          skillLevel: data.skillLevel || 1000,
          preferredRegion: data.preferredRegion,
          maxWaitTime: data.maxWaitTime || 300,
          partySize: data.partySize || 1,
          partyMembers: data.partyMembers || [],
          preferences: data.preferences || {}
        };

        const queueId = await matchmakingService.joinQueue(request);
        
        socket.emit('matchmaking:joined', {
          success: true,
          queueId,
          estimatedWaitTime: request.maxWaitTime
        });

      } catch (error) {
        socket.emit('matchmaking:error', {
          success: false,
          error: getErrorMessage(error)
        });
      }
    });

    // Leave matchmaking queue
    socket.on('matchmaking:leave', async () => {
      try {
        if (!socket.userId) return;

        await matchmakingService.leaveQueue(socket.userId);
        
        socket.emit('matchmaking:left', {
          success: true
        });

      } catch (error) {
        socket.emit('matchmaking:error', {
          success: false,
          error: getErrorMessage(error)
        });
      }
    });

    // Get queue status
    socket.on('matchmaking:status', async () => {
      try {
        if (!socket.userId) return;

        const status = await matchmakingService.getQueueStatus(socket.userId);
        
        socket.emit('matchmaking:status', {
          success: true,
          data: status
        });

      } catch (error) {
        socket.emit('matchmaking:error', {
          success: false,
          error: getErrorMessage(error)
        });
      }
    });
  }

  private handleGameRoomEvents(socket: AuthenticatedSocket): void {
    // Join game room
    socket.on('room:join', async (data): Promise<void> => {
      try {
        if (!socket.userId) return;

        const { roomId, password } = data;
        
        // Verify room exists and user can join
        const room = await prisma.gameRoom.findUnique({
          where: { id: roomId },
          include: {
            players: true,
            host: { select: { id: true, name: true } }
          }
        });

        if (!room) {
          socket.emit('room:error', { error: 'Room not found' });
          return;
        }

        if (room.isPrivate && room.password !== password) {
          socket.emit('room:error', { error: 'Invalid password' });
          return;
        }

        if (room.currentPlayers >= room.maxPlayers) {
          socket.emit('room:error', { error: 'Room is full' });
          return;
        }

        // Add player to room
        await prisma.gameRoomPlayer.create({
          data: {
            userId: socket.userId,
            roomId: roomId,
            role: 'player',
            status: 'connected'
          }
        });

        // Update room player count
        await prisma.gameRoom.update({
          where: { id: roomId },
          data: { currentPlayers: { increment: 1 } }
        });

        // Join socket room
        socket.join(`room:${roomId}`);

        // Notify room
        this.io.to(`room:${roomId}`).emit('room:playerJoined', {
          userId: socket.userId,
          userName: socket.userName,
          roomId
        });

        socket.emit('room:joined', {
          success: true,
          room: {
            id: room.id,
            name: room.name,
            gameMode: room.gameMode,
            currentPlayers: room.currentPlayers + 1,
            maxPlayers: room.maxPlayers,
            host: room.host
          }
        });

      } catch (error) {
        socket.emit('room:error', {
          error: getErrorMessage(error)
        });
      }
    });

    // Leave game room
    socket.on('room:leave', async (data) => {
      try {
        if (!socket.userId) return;

        const { roomId } = data;
        
        // Remove player from room
        await prisma.gameRoomPlayer.deleteMany({
          where: {
            userId: socket.userId,
            roomId: roomId
          }
        });

        // Update room player count
        await prisma.gameRoom.update({
          where: { id: roomId },
          data: { currentPlayers: { decrement: 1 } }
        });

        // Leave socket room
        socket.leave(`room:${roomId}`);

        // Notify room
        socket.to(`room:${roomId}`).emit('room:playerLeft', {
          userId: socket.userId,
          userName: socket.userName,
          roomId
        });

        socket.emit('room:left', {
          success: true,
          roomId
        });

      } catch (error) {
        socket.emit('room:error', {
          error: getErrorMessage(error)
        });
      }
    });

    // Player ready/unready
    socket.on('room:ready', async (data) => {
      try {
        if (!socket.userId) return;

        const { roomId, ready } = data;
        
        await prisma.gameRoomPlayer.updateMany({
          where: {
            userId: socket.userId,
            roomId: roomId
          },
          data: {
            status: ready ? 'ready' : 'connected'
          }
        });

        // Notify room
        this.io.to(`room:${roomId}`).emit('room:playerReady', {
          userId: socket.userId,
          userName: socket.userName,
          ready,
          roomId
        });

        // Check if all players are ready
        const readyPlayers = await prisma.gameRoomPlayer.count({
          where: {
            roomId: roomId,
            status: 'ready'
          }
        });

        const room = await prisma.gameRoom.findUnique({
          where: { id: roomId }
        });

        if (room && readyPlayers === room.currentPlayers && room.currentPlayers >= 2) {
          // All players ready - start match
          await this.startMatch(roomId);
        }

      } catch (error) {
        socket.emit('room:error', {
          error: getErrorMessage(error)
        });
      }
    });

    // Chat in room
    socket.on('room:chat', async (data): Promise<void> => {
      try {
        if (!socket.userId) return;

        const { roomId, message } = data;
        
        // Verify user is in room
        const playerInRoom = await prisma.gameRoomPlayer.findFirst({
          where: {
            userId: socket.userId,
            roomId: roomId
          }
        });

        if (!playerInRoom) {
          socket.emit('room:error', { error: 'Not in room' });
          return;
        }

        // Broadcast chat message
        this.io.to(`room:${roomId}`).emit('room:chat', {
          userId: socket.userId,
          userName: socket.userName,
          message,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        socket.emit('room:error', {
          error: getErrorMessage(error)
        });
      }
    });
  }

  private handlePlayerEvents(socket: AuthenticatedSocket): void {
    // Update player location (for geolocation-based matchmaking)
    socket.on('player:location', async (data) => {
      try {
        if (!socket.userId) return;

        // Store player location for better regional matchmaking
        // This could be implemented with a separate PlayerSession model
        console.log(`Player ${socket.userId} location update:`, data);
        
      } catch (error) {
        console.error('Player location update error:', error);
      }
    });

    // Player skill level update
    socket.on('player:skillUpdate', async (data) => {
      try {
        if (!socket.userId) return;

        const { skillLevel } = data;
        
        // Update skill level in any active matchmaking queue
        await prisma.matchmakingQueue.updateMany({
          where: {
            userId: socket.userId,
            status: 'waiting'
          },
          data: {
            skillLevel: skillLevel
          }
        });

      } catch (error) {
        console.error('Player skill update error:', error);
      }
    });
  }

  private setupMatchmakingEvents(): void {
    // Listen to matchmaking service events
    matchmakingService.on('playerJoined', (data) => {
      const socket = this.connectedUsers.get(data.userId);
      if (socket) {
        socket.emit('matchmaking:queueUpdate', {
          type: 'joined',
          data
        });
      }
    });

    matchmakingService.on('playerLeft', (data) => {
      const socket = this.connectedUsers.get(data.userId);
      if (socket) {
        socket.emit('matchmaking:queueUpdate', {
          type: 'left',
          data
        });
      }
    });

    matchmakingService.on('matchFound', (data) => {
      // Notify all players in the match
      data.players.forEach((player: any) => {
        const socket = this.connectedUsers.get(player.userId);
        if (socket) {
          socket.emit('matchmaking:matchFound', {
            roomId: data.roomId,
            gameMode: data.gameMode,
            matchQuality: data.matchQuality,
            players: data.players.length
          });
        }
      });
    });
  }

  private async startMatch(roomId: string): Promise<void> {
    try {
      // Update room status
      await prisma.gameRoom.update({
        where: { id: roomId },
        data: {
          status: 'active',
          startedAt: new Date()
        }
      });

      // Create game match record
      const room = await prisma.gameRoom.findUnique({
        where: { id: roomId },
        include: {
          players: {
            include: {
              user: { select: { id: true, name: true } }
            }
          }
        }
      });

      if (!room) return;

      const gameMatch = await prisma.gameMatch.create({
        data: {
          roomId: roomId,
          matchType: 'casual',
          gameMode: room.gameMode,
          status: 'active',
          settings: room.gameSettings as any,
          mapName: room.mapName,
          serverRegion: room.serverRegion,
          averageSkillLevel: Math.floor(Math.random() * 1000) + 500 // Placeholder
        }
      });

      // Add all players to the match
      const matchPlayers = room.players.map(player => ({
        userId: player.userId,
        matchId: gameMatch.id,
        team: player.team,
        skillBefore: Math.floor(Math.random() * 1000) + 500 // Placeholder
      }));

      await prisma.gameMatchPlayer.createMany({
        data: matchPlayers
      });

      // Notify all players
      this.io.to(`room:${roomId}`).emit('match:started', {
        matchId: gameMatch.id,
        roomId,
        gameMode: room.gameMode,
        players: room.players.length
      });

      console.log(`Match started for room ${roomId} with ${room.players.length} players`);

    } catch (error) {
      console.error('Failed to start match:', error);
    }
  }

  // Public methods for external use
  public notifyUser(userId: string, event: string, data: any): void {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.emit(event, data);
    }
  }

  public notifyRoom(roomId: string, event: string, data: any): void {
    this.io.to(`room:${roomId}`).emit(event, data);
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }
}

export default WebSocketService;