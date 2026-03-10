/**
 * CLI Projects API
 * Provides authenticated access to user's web IDE projects for CLI download
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { neon } from '@neondatabase/serverless';
import { logger } from '@/lib/logger';

// Database connection
function getSQL() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured');
  }
  return neon(databaseUrl);
}

/**
 * GET /api/cli/projects
 * List all projects for authenticated user
 *
 * Response:
 * {
 *   projects: [
 *     {
 *       chatId: string,
 *       title: string,
 *       description: string,
 *       fileCount: number,
 *       lastUpdated: string (ISO8601),
 *       totalMessages: number
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify session
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please authenticate first' },
        { status: 401 }
      );
    }

    const sql = getSQL();
    const userId = session.user.id;

    // Fetch user's chat sessions with file snapshots
    const sessions = await sql`
      SELECT
        id,
        url_id,
        title,
        description,
        total_messages,
        updated_at,
        metadata
      FROM chat_sessions
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
      LIMIT 100
    `;

    // Transform data for CLI consumption
    const projects = sessions.map((session: any) => ({
      chatId: session.url_id,
      title: session.title || session.description || 'Untitled Project',
      description: session.description || '',
      fileCount: session.metadata?.fileCount || 0,
      lastUpdated: session.updated_at.toISOString(),
      totalMessages: session.total_messages || 0,
    }));

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error) {
    logger.error('CLI projects error', { route: 'api/cli/projects', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: 'Failed to fetch projects',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cli/projects/[chatId]
 * Get specific project with full file snapshot
 *
 * Query params:
 *   - chatId: URL ID of the chat session
 *
 * Response:
 * {
 *   project: {
 *     chatId: string,
 *     title: string,
 *     description: string,
 *     fileCount: number,
 *     lastUpdated: string,
 *     files: { [path: string]: string }
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify session
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please authenticate first' },
        { status: 401 }
      );
    }

    const { chatId } = await request.json();

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId required' },
        { status: 400 }
      );
    }

    const sql = getSQL();
    const userId = session.user.id;

    // Fetch specific session with file snapshot
    const sessions = await sql`
      SELECT
        id,
        url_id,
        title,
        description,
        total_messages,
        updated_at,
        metadata
      FROM chat_sessions
      WHERE url_id = ${chatId}
        AND user_id = ${userId}
      LIMIT 1
    `;

    if (sessions.length === 0) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    const session_data = sessions[0] as { url_id: string; title?: string; description?: string; metadata?: { fileSnapshot?: Record<string, unknown> }; updated_at: Date; total_messages?: number };
    const fileSnapshot = session_data.metadata?.fileSnapshot || {};

    const project = {
      chatId: session_data.url_id,
      title: session_data.title || session_data.description || 'Untitled Project',
      description: session_data.description || '',
      fileCount: Object.keys(fileSnapshot).length,
      lastUpdated: session_data.updated_at.toISOString(),
      totalMessages: session_data.total_messages || 0,
      files: fileSnapshot,
    };

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error) {
    logger.error('CLI projects error', { route: 'api/cli/projects', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: 'Failed to fetch project',
      },
      { status: 500 }
    );
  }
}
