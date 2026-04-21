import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUserFromAuthUser, requireAuth } from '@/lib/auth-helpers';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import { listProjectSnapshots } from '@/lib/project-snapshots';

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

    const snapshotOwnerId = fallbackUserId || effectiveUserId;
    const directSnapshots = await listProjectSnapshots(snapshotOwnerId, numericLimit);
    if (directSnapshots.length > 0) {
      return NextResponse.json({
        success: true,
        data: directSnapshots.map((project) => ({
          id: project.projectId,
          urlId: project.urlId,
          title: project.title || project.description || 'Untitled Project',
          description: project.description,
          timestamp: project.updatedAt,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          messageCount: 0,
          fileCount: Object.keys(project.files || {}).length,
          directories: project.directories,
          messages: [],
          fileSnapshot: project.files,
          webUrl: `/chat/${project.urlId || project.projectId}`,
        })),
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
