import { NextRequest, NextResponse } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import logger from '@/lib/logger';

interface CollaborationSession {
  projectId: string;
  users: CollaborationUser[];
  activeFile?: string;
  cursors: { [userId: string]: CursorPosition };
  changes: CodeChange[];
}

interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  color: string;
  lastSeen: string;
}

interface CursorPosition {
  line: number;
  column: number;
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

interface CodeChange {
  id: string;
  userId: string;
  timestamp: string;
  type: 'insert' | 'delete' | 'replace';
  position: {
    line: number;
    column: number;
  };
  content: string;
  filePath: string;
}

// In-memory collaboration sessions
const collaborationSessions = new Map<string, CollaborationSession>();

// User colors for collaboration
const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
  '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43'
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { action, userId, userName, userEmail, data } = await request.json();

    let session = collaborationSessions.get(projectId);

    switch (action) {
      case 'join':
        if (!session) {
          session = {
            projectId,
            users: [],
            cursors: {},
            changes: []
          };
          collaborationSessions.set(projectId, session);
        }

        // Check if user already exists
        let user = session.users.find(u => u.id === userId);
        if (!user) {
          user = {
            id: userId,
            name: userName,
            email: userEmail,
            color: USER_COLORS[session.users.length % USER_COLORS.length],
            lastSeen: new Date().toISOString()
          };
          session.users.push(user);
        } else {
          user.lastSeen = new Date().toISOString();
        }

        logger.info(`User ${userName} joined collaboration session for project ${projectId}`);
        break;

      case 'leave':
        if (session) {
          session.users = session.users.filter(u => u.id !== userId);
          delete session.cursors[userId];
          
          if (session.users.length === 0) {
            collaborationSessions.delete(projectId);
          }
        }
        logger.info(`User ${userId} left collaboration session for project ${projectId}`);
        break;

      case 'cursor_update':
        if (session) {
          session.cursors[userId] = data.cursor;
        }
        break;

      case 'code_change':
        if (session) {
          const change: CodeChange = {
            id: `${Date.now()}-${userId}`,
            userId,
            timestamp: new Date().toISOString(),
            type: data.type,
            position: data.position,
            content: data.content,
            filePath: data.filePath
          };
          session.changes.push(change);
          
          // Keep only last 100 changes
          if (session.changes.length > 100) {
            session.changes = session.changes.slice(-100);
          }
        }
        break;

      case 'file_change':
        if (session) {
          session.activeFile = data.filePath;
        }
        break;
    }

    return NextResponse.json({
      success: true,
      data: {
        session: session || null,
        activeUsers: session?.users.length || 0
      }
    });

  } catch (error) {
    logger.error('Error in collaboration API:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process collaboration action'
    }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const session = collaborationSessions.get(projectId);

    return NextResponse.json({
      success: true,
      data: {
        session: session || null,
        activeUsers: session?.users.length || 0,
        isActive: !!session && session.users.length > 0
      }
    });

  } catch (error) {
    logger.error('Error fetching collaboration session:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch collaboration session'
    }, { status: 500 });
  }
}
