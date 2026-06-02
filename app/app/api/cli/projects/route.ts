/**
 * CLI Projects API
 * Provides authenticated access to user's Spaces projects for CLI download
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { logger } from '@/lib/logger';
import { getProjectSnapshot, listProjectSnapshots } from '@/lib/project-snapshots';

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

    const userId = session.user.id;

    const snapshots = await listProjectSnapshots(userId, 100);
    const projects = snapshots.map((snapshot) => ({
      chatId: snapshot.urlId || snapshot.projectId,
      title: snapshot.title || snapshot.description || 'Untitled Project',
      description: snapshot.description || '',
      fileCount: Object.keys(snapshot.files).length,
      lastUpdated: snapshot.updatedAt,
      totalMessages: 0,
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

    const userId = session.user.id;

    const snapshot = await getProjectSnapshot(chatId, userId);
    if (!snapshot) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    const project = {
      chatId: snapshot.urlId || snapshot.projectId,
      title: snapshot.title || snapshot.description || 'Untitled Project',
      description: snapshot.description || '',
      fileCount: Object.keys(snapshot.files).length,
      lastUpdated: snapshot.updatedAt,
      totalMessages: 0,
      files: snapshot.files,
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
