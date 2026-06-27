import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { ensureAppUserFromAuthUser } from '@/lib/auth-helpers';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import { getProjectSnapshotWithLegacyFallback, patchProjectSnapshotFiles } from '@/lib/project-snapshots';

async function resolveEffectiveUserId(request: NextRequest): Promise<{ effectiveUserId: string | null; fallbackUserId: string | null }> {
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
      return { effectiveUserId: null, fallbackUserId: null };
    }
    effectiveUserId = request.headers.get('x-user-id');
  } else {
    const session = await auth.api.getSession({ headers: await headers() });
    const authUser = session?.user;
    effectiveUserId = authUser?.id || null;

    if (authUser) {
      const appUser = await ensureAppUserFromAuthUser(authUser);
      if (appUser?.id) {
        if (!effectiveUserId) {
          effectiveUserId = appUser.id;
        } else if (appUser.id !== effectiveUserId) {
          fallbackUserId = appUser.id;
        }
      }
    }
  }

  return { effectiveUserId, fallbackUserId };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { effectiveUserId, fallbackUserId } = await resolveEffectiveUserId(request);

    if (!effectiveUserId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const directSnapshot = await getProjectSnapshotWithLegacyFallback(
      projectId,
      effectiveUserId,
      fallbackUserId ? [fallbackUserId] : [],
    );
    if (directSnapshot) {
      return NextResponse.json({
        success: true,
        data: {
          id: directSnapshot.projectId,
          urlId: directSnapshot.urlId,
          title: directSnapshot.title || directSnapshot.description || 'Untitled Project',
          description: directSnapshot.description,
          timestamp: directSnapshot.updatedAt,
          createdAt: directSnapshot.createdAt,
          updatedAt: directSnapshot.updatedAt,
          messageCount: 0,
          fileCount: Object.keys(directSnapshot.files || {}).length,
          directories: directSnapshot.directories,
          messages: [],
          fileSnapshot: directSnapshot.files,
          webUrl: `/chat/${directSnapshot.urlId || directSnapshot.projectId}`,
        },
      });
    }
    return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
  } catch (error) {
    console.error('Error fetching project detail:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { effectiveUserId } = await resolveEffectiveUserId(request);
    if (!effectiveUserId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => null) as {
      files?: Record<string, string>;
      removePaths?: string[];
      removePathPrefixes?: string[];
      addDirectories?: string[];
      removeDirectories?: string[];
      renamePaths?: Array<{ from: string; to: string }>;
      urlId?: string | null;
      title?: string | null;
      description?: string | null;
      framework?: string | null;
      source?: string | null;
    } | null;

    if (
      !body ||
      (
        !body.files &&
        !body.removePaths?.length &&
        !body.removePathPrefixes?.length &&
        !body.addDirectories?.length &&
        !body.removeDirectories?.length &&
        !body.renamePaths?.length
      )
    ) {
      return NextResponse.json({ success: false, error: 'snapshot delta required' }, { status: 400 });
    }

    const snapshot = await patchProjectSnapshotFiles(effectiveUserId, projectId, {
      files: body.files,
      removePaths: body.removePaths,
      removePathPrefixes: body.removePathPrefixes,
      addDirectories: body.addDirectories,
      removeDirectories: body.removeDirectories,
      renamePaths: body.renamePaths,
      urlId: body.urlId,
      title: body.title,
      description: body.description,
      framework: body.framework,
      source: body.source,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: snapshot.projectId,
        urlId: snapshot.urlId,
        fileCount: Object.keys(snapshot.files).length,
        directories: snapshot.directories,
        updatedAt: snapshot.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error patching project snapshot:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
