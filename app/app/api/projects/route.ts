import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUserFromAuthUser, requireAuth } from '@/lib/auth-helpers';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import { createProjectSnapshot, listProjectSnapshots } from '@/lib/project-snapshots';

function slugifyProjectTitle(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || crypto.randomUUID().slice(0, 8);
}

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

export async function POST(request: NextRequest) {
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
      const rawBody = await request.text();
      const authResult = verifyInternalServiceRequest(request, { rawBody });
      if (!authResult.ok) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
      effectiveUserId = request.headers.get('x-user-id');

      const body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
      const userIdFromBody = typeof body.userId === 'string' ? body.userId : null;
      if (!effectiveUserId && userIdFromBody) {
        effectiveUserId = userIdFromBody;
      }

      if (!effectiveUserId) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }

      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return NextResponse.json(
          { success: false, error: 'Project name required' },
          { status: 400 }
        );
      }

      const projectId = typeof body.projectId === 'string' && body.projectId.trim()
        ? body.projectId.trim()
        : crypto.randomUUID();
      const framework = typeof body.framework === 'string' ? body.framework : null;
      const starterId = typeof body.templateId === 'string' ? body.templateId : null;
      const description = typeof body.description === 'string' ? body.description : '';
      const urlId = slugifyProjectTitle(name);

      const snapshot = await createProjectSnapshot({
        projectId,
        userId: fallbackUserId || effectiveUserId,
        urlId,
        title: name,
        description,
        framework,
        starterId,
        source: 'web',
      });

      return NextResponse.json({
        success: true,
        data: {
          id: snapshot.projectId,
          urlId: snapshot.urlId,
          title: snapshot.title,
          description: snapshot.description,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          fileCount: Object.keys(snapshot.files).length,
          directories: snapshot.directories,
          fileSnapshot: snapshot.files,
          webUrl: `/chat/${snapshot.urlId || snapshot.projectId}`,
        },
      });
    }

    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;
    effectiveUserId = authUser.id || null;

    const appUser = await ensureAppUserFromAuthUser(authUser);
    if (appUser?.id) {
      if (!effectiveUserId) {
        effectiveUserId = appUser.id;
      } else if (appUser.id !== effectiveUserId) {
        fallbackUserId = appUser.id;
      }
    }

    if (!effectiveUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Project name required' },
        { status: 400 }
      );
    }

    const projectId = typeof body?.projectId === 'string' && body.projectId.trim()
      ? body.projectId.trim()
      : crypto.randomUUID();
    const framework = typeof body?.framework === 'string' ? body.framework : null;
    const starterId = typeof body?.templateId === 'string' ? body.templateId : null;
    const description = typeof body?.description === 'string' ? body.description : '';
    const urlId = slugifyProjectTitle(name);

    const snapshot = await createProjectSnapshot({
      projectId,
      userId: fallbackUserId || effectiveUserId,
      urlId,
      title: name,
      description,
      framework,
      starterId,
      source: 'web',
    });

    return NextResponse.json({
      success: true,
      data: {
        id: snapshot.projectId,
        urlId: snapshot.urlId,
        title: snapshot.title,
        description: snapshot.description,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        fileCount: Object.keys(snapshot.files).length,
        directories: snapshot.directories,
        fileSnapshot: snapshot.files,
        webUrl: `/chat/${snapshot.urlId || snapshot.projectId}`,
      },
    });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
