import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUserFromAuthUser, requireAuth } from '@/lib/auth-helpers';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';

const RECODER_WEB_URL =
  process.env.RECODER_WEB_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://web.recoder.xyz' : 'http://localhost:5173');

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

    // Fetch projects from recoder-web API
    const url = new URL(`${RECODER_WEB_URL}/api/chat-history`);
    url.searchParams.set('userId', effectiveUserId);
    url.searchParams.set('limit', limit);

    let response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    let data: any = null;
    const shouldRetryByStatus =
      (response.status === 400 || response.status === 404 || response.status === 422) && !!fallbackUserId;

    if (response.ok) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    }

    const shouldRetryByEmptyData = Boolean(
      fallbackUserId
      && response.ok
      && data
      && data.success
      && Array.isArray(data.data)
      && data.data.length === 0
    );

    // Retry with app user ID if Better Auth ID has no history on recoder-web side.
    if (shouldRetryByStatus || shouldRetryByEmptyData) {
      const retryUrl = new URL(`${RECODER_WEB_URL}/api/chat-history`);
      retryUrl.searchParams.set('userId', fallbackUserId);
      retryUrl.searchParams.set('limit', limit);
      response = await fetch(retryUrl.toString(), {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      data = null;
      if (response.ok) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      }
    }

    if (!response.ok) {
      console.error('Failed to fetch projects from recoder-web:', response.status, response.statusText);
      return NextResponse.json({
        success: true,
        data: [],
        total: 0,
        warning: 'Projects backend unavailable'
      });
    }

    if (!data || !data.success || !Array.isArray(data.data)) {
      return NextResponse.json({
        success: true,
        data: [],
        total: 0,
        warning: 'Projects response unavailable'
      });
    }

    // Transform data to include calculated fields
    const projects = data.data.map((project: any) => ({
      id: project.id,
      urlId: project.urlId,
      title: project.title || project.description || 'Untitled Project',
      description: project.description,
      timestamp: project.timestamp,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      messageCount: project.messageCount || project.messages?.length || 0,
      fileCount: project.fileCount || Object.keys(project.fileSnapshot || {}).length,
      messages: project.messages,
      fileSnapshot: project.fileSnapshot,
      webUrl: `${RECODER_WEB_URL}/chat/${project.urlId}`,
    }));

    return NextResponse.json({
      success: true,
      data: projects,
      total: projects.length,
    });
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({
      success: true,
      data: [],
      total: 0,
      warning: 'Projects unavailable'
    });
  }
}
