import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';

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

    if (!body.userId?.trim() || !body.projectId?.trim()) {
      return NextResponse.json({ error: 'userId and projectId are required' }, { status: 400 });
    }

    // Collaboration ACL is not yet modeled in app DB. Return explicit false.
    return NextResponse.json({ isCollaborator: false });
  } catch (error: any) {
    console.error('Project collaborator verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}

