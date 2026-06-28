import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUserFromAuthUser, requireAuth } from '@/lib/auth-helpers';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import { getProjectMessageCounts, listProjectSnapshotsWithLegacyFallback } from '@/lib/project-snapshots';

export async function GET(request: NextRequest) {
  try {
    const hasInternalHeaders = Boolean(
      request.headers.get('x-internal-service-key')
      || request.headers.get('x-internal-signature')
      || request.headers.get('x-internal-timestamp')
      || request.headers.get('x-internal-nonce')
    );
    let effectiveUserId: string | null = null;
    let fallbackUserId: string | null = null;
    if (hasInternalHeaders) {
      const authResult = verifyInternalServiceRequest(request, { rawBody: '' });
      if (!authResult.ok) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
      effectiveUserId = request.headers.get('x-user-id');
    } else {
      // Session-auth path for browser callers
      const authResult = await requireAuth(request);
      if (authResult.error) return authResult.response;
      const { user: authUser } = authResult;
      effectiveUserId = authUser.id || null;

      const appUser = await ensureAppUserFromAuthUser(authUser);
      if (appUser?.id) {
        // If Better Auth session lacks an ID, fall back to the resolved app user.
        if (!effectiveUserId) {
          effectiveUserId = appUser.id;
        } else if (appUser.id !== effectiveUserId) {
          fallbackUserId = appUser.id;
        }
      }
    }

    if (!effectiveUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '50';
    const numericLimit = Number.parseInt(limit, 10) || 50;

    const directSnapshots = await listProjectSnapshotsWithLegacyFallback(
      effectiveUserId,
      numericLimit,
      fallbackUserId ? [fallbackUserId] : [],
    );
    if (directSnapshots.length > 0) {
      // Hydrate real chat message counts from chat_messages (linked via
      // chat_sessions.projectId/urlId). One batched pair of queries for the
      // whole page; absent entries mean no chat activity (count 0).
      const messageCounts = await getProjectMessageCounts(
        directSnapshots.map((project) => ({
          projectId: project.projectId,
          urlId: project.urlId,
        })),
      );

      return NextResponse.json({
        success: true,
        data: directSnapshots.map((project) => {
          const messageCount =
            messageCounts.get(project.projectId)
            ?? (project.urlId ? messageCounts.get(project.urlId) : undefined)
            ?? 0;
          return {
            id: project.projectId,
            urlId: project.urlId,
            title: project.title || project.description || 'Untitled Project',
            description: project.description,
            timestamp: project.updatedAt,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            messageCount,
            fileCount: Object.keys(project.files || {}).length,
            directories: project.directories,
            messages: [],
            fileSnapshot: project.files,
            webUrl: `/chat/${project.urlId || project.projectId}`,
          };
        }),
        total: directSnapshots.length,
      });
    }
    return NextResponse.json({
      success: true,
      data: [],
      total: 0,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({
      success: true,
      data: [],
      total: 0,
      warning: 'Projects unavailable'
    });
  }
}
