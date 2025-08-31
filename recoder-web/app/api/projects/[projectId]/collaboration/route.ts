import { NextRequest, NextResponse } from 'next/server';
import { WebSocketServer } from 'ws';
import logger from '@/lib/logger';

interface CollaborationSession {
  projectId: string;
  users: Array<{
    id: string;
    name: string;
    email: string;
    cursor?: { line: number; column: number };
    selection?: { start: number; end: number };
    lastActivity: number;
  }>;
  version: number;
  operations: Array<{
    type: 'insert' | 'delete' | 'replace';
    position: number;
    content: string;
    userId: string;
    timestamp: number;
  }>;
}

const activeSessions = new Map<string, CollaborationSession>();

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const session = activeSessions.get(projectId);

    return NextResponse.json({
      success: true,
      data: {
        session: session || {
          projectId,
          users: [],
          version: 0,
          operations: []
        }
      }
    });

  } catch (error) {
    logger.error('Error getting collaboration session:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get collaboration session'
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const { userId, userName, userEmail, operation } = await request.json();

    let session = activeSessions.get(projectId);
    if (!session) {
      session = {
        projectId,
        users: [],
        version: 0,
        operations: []
      };
      activeSessions.set(projectId, session);
    }

    // Add or update user in session
    const existingUserIndex = session.users.findIndex(u => u.id === userId);
    const user = {
      id: userId,
      name: userName,
      email: userEmail,
      lastActivity: Date.now()
    };

    if (existingUserIndex >= 0) {
      session.users[existingUserIndex] = { ...session.users[existingUserIndex], ...user };
    } else {
      session.users.push(user);
    }

    // Add operation if provided
    if (operation) {
      session.operations.push({
        ...operation,
        userId,
        timestamp: Date.now()
      });
      session.version++;

      // Keep only last 100 operations
      if (session.operations.length > 100) {
        session.operations = session.operations.slice(-100);
      }
    }

    // Clean up inactive users (inactive for more than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    session.users = session.users.filter(u => u.lastActivity > fiveMinutesAgo);

    logger.info(`Collaboration session updated for project ${projectId}`);

    return NextResponse.json({
      success: true,
      data: { session }
    });

  } catch (error) {
    logger.error('Error updating collaboration session:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update collaboration session'
    }, { status: 500 });
  }
}
