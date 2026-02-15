import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';

const RECODER_WEB_URL = process.env.RECODER_WEB_URL || 'http://localhost:5173';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const hasInternalHeaders = Boolean(
      request.headers.get('x-internal-service-key')
      || request.headers.get('x-internal-signature')
      || request.headers.get('x-internal-timestamp')
      || request.headers.get('x-internal-nonce')
    );
    let effectiveUserId: string | null = null;

    if (hasInternalHeaders) {
      const authResult = verifyInternalServiceRequest(request, { rawBody: '' });
      if (!authResult.ok) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
      effectiveUserId = request.headers.get('x-user-id');
    } else {
      const session = await auth.api.getSession({ headers: await headers() });
      effectiveUserId = session?.user?.id || null;
    }

    if (!effectiveUserId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const url = new URL(`${RECODER_WEB_URL}/api/chat-history`);
    url.searchParams.set('userId', effectiveUserId);
    url.searchParams.set('limit', '200');

    const response = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return NextResponse.json({ success: false, error: 'Failed to fetch projects' }, { status: response.status });
    }

    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    const found = rows.find((project: any) => project?.id === projectId || project?.urlId === projectId);
    if (!found) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: found.id,
        urlId: found.urlId,
        title: found.title || found.description || 'Untitled Project',
        description: found.description,
        timestamp: found.timestamp,
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
        messageCount: found.messageCount || found.messages?.length || 0,
        fileCount: found.fileCount || Object.keys(found.fileSnapshot || {}).length,
        messages: found.messages,
        fileSnapshot: found.fileSnapshot,
        webUrl: `${RECODER_WEB_URL}/chat/${found.urlId}`,
      },
    });
  } catch (error: any) {
    console.error('Error fetching project detail:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

