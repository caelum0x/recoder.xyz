import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

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

    // Check project_collaborators table for an accepted collaboration record
    const collaborator = await prisma.project_collaborators.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
      select: { role: true, acceptedAt: true },
    });

    if (collaborator && collaborator.acceptedAt) {
      return NextResponse.json({
        isCollaborator: true,
        role: collaborator.role,
      });
    }

    // Also check if the user is the project owner
    const project = await prisma.ai_generated_projects.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (project) {
      return NextResponse.json({
        isCollaborator: true,
        role: 'owner',
      });
    }

    return NextResponse.json({ isCollaborator: false });
  } catch (error) {
    logger.error('Project collaborator verification error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
