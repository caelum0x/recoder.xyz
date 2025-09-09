// Code Generator Collaboration API - Real-time collaboration features
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';

// Rate limiting for collaboration features
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 200,
});

const createSessionSchema = z.object({
  name: z.string().min(1).max(100),
  language: z.enum(['javascript', 'python', 'typescript', 'java', 'cpp', 'rust', 'go']),
  code: z.string().max(100000),
  isPublic: z.boolean().default(false),
  maxParticipants: z.number().min(2).max(50).default(10),
  permissions: z.object({
    canEdit: z.boolean().default(true),
    canExecute: z.boolean().default(true),
    canChat: z.boolean().default(true),
    canShare: z.boolean().default(false)
  }).default({})
});

const joinSessionSchema = z.object({
  sessionId: z.string().uuid(),
  nickname: z.string().min(1).max(50).optional()
});

const updateCodeSchema = z.object({
  sessionId: z.string().uuid(),
  code: z.string().max(100000),
  cursor: z.object({
    line: z.number(),
    column: z.number()
  }).optional(),
  selection: z.object({
    startLine: z.number(),
    startColumn: z.number(),
    endLine: z.number(),
    endColumn: z.number()
  }).optional()
});

const chatMessageSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(500)
});

// In-memory storage for active sessions (in production, use Redis)
const activeSessions = new Map<string, {
  id: string;
  name: string;
  language: string;
  code: string;
  ownerId: string;
  participants: Array<{
    id: string;
    userId: string;
    nickname: string;
    color: string;
    cursor?: { line: number; column: number };
    selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    lastSeen: Date;
  }>;
  permissions: {
    canEdit: boolean;
    canExecute: boolean;
    canChat: boolean;
    canShare: boolean;
  };
  chatMessages: Array<{
    id: string;
    userId: string;
    username: string;
    message: string;
    timestamp: Date;
  }>;
  isPublic: boolean;
  maxParticipants: number;
  createdAt: Date;
  lastActivity: Date;
}>();

// WebSocket connections (in production, use a proper WebSocket server)
const connections = new Map<string, Set<any>>();

// POST - Create collaboration session
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'collaboration-create');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createSessionSchema.parse(body);
    
    const sessionId = uuidv4();
    const userColors = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
      '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#06B6D4'
    ];

    // Create collaboration session
    const collaborationSession = {
      id: sessionId,
      name: validatedData.name,
      language: validatedData.language,
      code: validatedData.code,
      ownerId: session.user.id,
      participants: [{
        id: uuidv4(),
        userId: session.user.id,
        nickname: session.user.name || 'Owner',
        color: userColors[0],
        lastSeen: new Date()
      }],
      permissions: validatedData.permissions,
      chatMessages: [],
      isPublic: validatedData.isPublic,
      maxParticipants: validatedData.maxParticipants,
      createdAt: new Date(),
      lastActivity: new Date()
    };

    activeSessions.set(sessionId, collaborationSession);
    connections.set(sessionId, new Set());

    // Save to database for persistence
    await prisma.collaborationSession.create({
      data: {
        id: sessionId,
        name: validatedData.name,
        language: validatedData.language,
        code: validatedData.code,
        ownerId: session.user.id,
        isPublic: validatedData.isPublic,
        maxParticipants: validatedData.maxParticipants,
        permissions: validatedData.permissions,
        metadata: {
          participants: collaborationSession.participants,
          chatMessages: []
        }
      }
    });

    return NextResponse.json({
      sessionId,
      session: {
        id: sessionId,
        name: collaborationSession.name,
        language: collaborationSession.language,
        code: collaborationSession.code,
        participants: collaborationSession.participants,
        permissions: collaborationSession.permissions,
        isPublic: collaborationSession.isPublic,
        maxParticipants: collaborationSession.maxParticipants,
        createdAt: collaborationSession.createdAt
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Create collaboration session error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create collaboration session' },
      { status: 500 }
    );
  }
}

// GET - Get collaboration sessions or specific session details
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');
    const type = searchParams.get('type') || 'my'; // my, public, joined

    if (sessionId) {
      // Get specific session
      const collaborationSession = activeSessions.get(sessionId);
      
      if (!collaborationSession) {
        // Try to load from database
        const dbSession = await prisma.collaborationSession.findUnique({
          where: { id: sessionId },
          include: { owner: { select: { id: true, name: true, email: true } } }
        });

        if (!dbSession) {
          return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Restore session to memory
        const restoredSession = {
          id: dbSession.id,
          name: dbSession.name,
          language: dbSession.language,
          code: dbSession.code,
          ownerId: dbSession.ownerId,
          participants: (dbSession.metadata as any)?.participants || [],
          permissions: dbSession.permissions as any,
          chatMessages: (dbSession.metadata as any)?.chatMessages || [],
          isPublic: dbSession.isPublic,
          maxParticipants: dbSession.maxParticipants,
          createdAt: dbSession.createdAt,
          lastActivity: dbSession.updatedAt
        };

        activeSessions.set(sessionId, restoredSession);
        connections.set(sessionId, new Set());

        return NextResponse.json({
          session: restoredSession,
          owner: dbSession.owner
        });
      }

      // Check if user has access
      const isParticipant = collaborationSession.participants.some(p => p.userId === session.user.id);
      const isOwner = collaborationSession.ownerId === session.user.id;
      
      if (!isParticipant && !isOwner && !collaborationSession.isPublic) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      return NextResponse.json({
        session: {
          id: collaborationSession.id,
          name: collaborationSession.name,
          language: collaborationSession.language,
          code: collaborationSession.code,
          participants: collaborationSession.participants,
          permissions: collaborationSession.permissions,
          chatMessages: collaborationSession.chatMessages,
          isPublic: collaborationSession.isPublic,
          maxParticipants: collaborationSession.maxParticipants,
          createdAt: collaborationSession.createdAt,
          lastActivity: collaborationSession.lastActivity
        }
      });
    }

    // Get list of sessions
    let sessions: any[] = [];
    
    if (type === 'my') {
      // Get user's own sessions
      sessions = Array.from(activeSessions.values())
        .filter(s => s.ownerId === session.user.id)
        .map(s => ({
          id: s.id,
          name: s.name,
          language: s.language,
          participantCount: s.participants.length,
          maxParticipants: s.maxParticipants,
          isPublic: s.isPublic,
          createdAt: s.createdAt,
          lastActivity: s.lastActivity
        }));
    } else if (type === 'public') {
      // Get public sessions
      sessions = Array.from(activeSessions.values())
        .filter(s => s.isPublic)
        .map(s => ({
          id: s.id,
          name: s.name,
          language: s.language,
          participantCount: s.participants.length,
          maxParticipants: s.maxParticipants,
          isPublic: s.isPublic,
          createdAt: s.createdAt,
          lastActivity: s.lastActivity
        }));
    } else if (type === 'joined') {
      // Get sessions user has joined
      sessions = Array.from(activeSessions.values())
        .filter(s => s.participants.some(p => p.userId === session.user.id) && s.ownerId !== session.user.id)
        .map(s => ({
          id: s.id,
          name: s.name,
          language: s.language,
          participantCount: s.participants.length,
          maxParticipants: s.maxParticipants,
          isPublic: s.isPublic,
          createdAt: s.createdAt,
          lastActivity: s.lastActivity
        }));
    }

    return NextResponse.json({
      sessions,
      total: sessions.length
    });

  } catch (error) {
    console.error('Get collaboration sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to get collaboration sessions' },
      { status: 500 }
    );
  }
}

// PUT - Join session or update code/cursor
export async function PUT(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 50, 'collaboration-update');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'join') {
      const { sessionId, nickname } = joinSessionSchema.parse(body);
      
      const collaborationSession = activeSessions.get(sessionId);
      if (!collaborationSession) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      // Check if already a participant
      const existingParticipant = collaborationSession.participants.find(p => p.userId === session.user.id);
      if (existingParticipant) {
        existingParticipant.lastSeen = new Date();
        return NextResponse.json({
          participant: existingParticipant,
          session: {
            id: collaborationSession.id,
            name: collaborationSession.name,
            language: collaborationSession.language,
            code: collaborationSession.code,
            participants: collaborationSession.participants,
            permissions: collaborationSession.permissions
          }
        });
      }

      // Check capacity
      if (collaborationSession.participants.length >= collaborationSession.maxParticipants) {
        return NextResponse.json({ error: 'Session is full' }, { status: 403 });
      }

      const userColors = [
        '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
        '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#06B6D4'
      ];

      const participant = {
        id: uuidv4(),
        userId: session.user.id,
        nickname: nickname || session.user.name || 'User',
        color: userColors[collaborationSession.participants.length % userColors.length],
        lastSeen: new Date()
      };

      collaborationSession.participants.push(participant);
      collaborationSession.lastActivity = new Date();

      // Broadcast to other participants
      broadcastToSession(sessionId, {
        type: 'participant_joined',
        participant
      });

      return NextResponse.json({
        participant,
        session: {
          id: collaborationSession.id,
          name: collaborationSession.name,
          language: collaborationSession.language,
          code: collaborationSession.code,
          participants: collaborationSession.participants,
          permissions: collaborationSession.permissions
        }
      });

    } else if (action === 'update_code') {
      const { sessionId, code, cursor, selection } = updateCodeSchema.parse(body);
      
      const collaborationSession = activeSessions.get(sessionId);
      if (!collaborationSession) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      const participant = collaborationSession.participants.find(p => p.userId === session.user.id);
      if (!participant) {
        return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
      }

      if (!collaborationSession.permissions.canEdit) {
        return NextResponse.json({ error: 'Edit permission denied' }, { status: 403 });
      }

      // Update code and participant info
      collaborationSession.code = code;
      participant.cursor = cursor;
      participant.selection = selection;
      participant.lastSeen = new Date();
      collaborationSession.lastActivity = new Date();

      // Broadcast to other participants
      broadcastToSession(sessionId, {
        type: 'code_updated',
        code,
        participantId: participant.id,
        cursor,
        selection
      });

      return NextResponse.json({ success: true });

    } else if (action === 'send_message') {
      const { sessionId, message } = chatMessageSchema.parse(body);
      
      const collaborationSession = activeSessions.get(sessionId);
      if (!collaborationSession) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      const participant = collaborationSession.participants.find(p => p.userId === session.user.id);
      if (!participant) {
        return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
      }

      if (!collaborationSession.permissions.canChat) {
        return NextResponse.json({ error: 'Chat permission denied' }, { status: 403 });
      }

      const chatMessage = {
        id: uuidv4(),
        userId: session.user.id,
        username: participant.nickname,
        message,
        timestamp: new Date()
      };

      collaborationSession.chatMessages.push(chatMessage);
      collaborationSession.lastActivity = new Date();

      // Keep only last 100 messages
      if (collaborationSession.chatMessages.length > 100) {
        collaborationSession.chatMessages = collaborationSession.chatMessages.slice(-100);
      }

      // Broadcast to all participants
      broadcastToSession(sessionId, {
        type: 'chat_message',
        message: chatMessage
      });

      return NextResponse.json({ success: true, message: chatMessage });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Collaboration update error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update collaboration session' },
      { status: 500 }
    );
  }
}

// DELETE - Leave session or delete session
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');
    const action = searchParams.get('action') || 'leave';

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const collaborationSession = activeSessions.get(sessionId);
    if (!collaborationSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (action === 'leave') {
      // Remove participant
      const participantIndex = collaborationSession.participants.findIndex(p => p.userId === session.user.id);
      if (participantIndex === -1) {
        return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
      }

      const participant = collaborationSession.participants[participantIndex];
      collaborationSession.participants.splice(participantIndex, 1);
      collaborationSession.lastActivity = new Date();

      // Broadcast to other participants
      broadcastToSession(sessionId, {
        type: 'participant_left',
        participantId: participant.id
      });

      // If no participants left, clean up session
      if (collaborationSession.participants.length === 0) {
        activeSessions.delete(sessionId);
        connections.delete(sessionId);
      }

      return NextResponse.json({ success: true });

    } else if (action === 'delete') {
      // Delete session (owner only)
      if (collaborationSession.ownerId !== session.user.id) {
        return NextResponse.json({ error: 'Only session owner can delete' }, { status: 403 });
      }

      // Broadcast session deletion to all participants
      broadcastToSession(sessionId, {
        type: 'session_deleted'
      });

      // Clean up
      activeSessions.delete(sessionId);
      connections.delete(sessionId);

      // Delete from database
      await prisma.collaborationSession.delete({
        where: { id: sessionId }
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Collaboration delete error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

function broadcastToSession(sessionId: string, data: any) {
  const sessionConnections = connections.get(sessionId);
  if (sessionConnections) {
    sessionConnections.forEach(connection => {
      try {
        connection.send(JSON.stringify(data));
      } catch (error) {
        // Remove dead connections
        sessionConnections.delete(connection);
      }
    });
  }
}

// Cleanup inactive sessions (run periodically)
setInterval(() => {
  const now = new Date();
  const maxInactiveTime = 30 * 60 * 1000; // 30 minutes

  for (const [sessionId, session] of activeSessions.entries()) {
    const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
    
    if (timeSinceLastActivity > maxInactiveTime) {
      console.log(`Cleaning up inactive session: ${sessionId}`);
      activeSessions.delete(sessionId);
      connections.delete(sessionId);
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes