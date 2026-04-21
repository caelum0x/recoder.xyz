import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import { logger } from '@/lib/logger';
import { userOwnsProjectSnapshot } from '@/lib/project-snapshots';

export async function POST(request: NextRequest) {
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

    const isOwner = await userOwnsProjectSnapshot(userId, projectId);
    return NextResponse.json({ isOwner });
  } catch (error) {
    logger.error('Project ownership verification error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
