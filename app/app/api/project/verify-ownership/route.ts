import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import { logger } from '@/lib/logger';

const RECODER_WEB_URL = process.env.RECODER_WEB_URL || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:5173');

export async function POST(request: NextRequest) {
  if (!RECODER_WEB_URL) {
    return NextResponse.json({ error: 'Service URL not configured' }, { status: 503 });
  }

  try {
    const rawBody = await request.text();
    let body: { userId?: string; projectId?: string } = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const authResult = verifyInternalServiceRequest(request, { rawBody });
    if (!authResult.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = body.userId?.trim();
    const projectId = body.projectId?.trim();
    if (!userId || !projectId) {
      return NextResponse.json({ error: 'userId and projectId are required' }, { status: 400 });
    }

    const url = new URL(`${RECODER_WEB_URL}/api/chat-history`);
    url.searchParams.set('userId', userId);
    url.searchParams.set('limit', '200');

    const response = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return NextResponse.json({ isOwner: false });
    }

    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    const isOwner = rows.some((project: any) => project?.id === projectId || project?.urlId === projectId);
    return NextResponse.json({ isOwner });
  } catch (error) {
    logger.error('Project ownership verification error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}

