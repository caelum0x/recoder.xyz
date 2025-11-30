import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  const params = await context.params;
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'status') {
      // Check if GitHub is connected for this project/chat
      const project = await prisma.ai_generated_projects.findFirst({
        where: {
          sessionId: params.chatId,
          userId: session.user.id,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!project) {
        return NextResponse.json({ connected: false });
      }

      // For now, return not connected - can be enhanced later with actual GitHub integration
      return NextResponse.json({ 
        connected: false,
        repo: null,
        branch: null 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('GitHub API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  const params = await context.params;
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, repo, branch } = body;

    const project = await prisma.ai_generated_projects.findFirst({
      where: {
        sessionId: params.chatId,
        userId: session.user.id,
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (action === 'connect') {
      // GitHub connection logic would go here
      return NextResponse.json({ 
        success: true,
        message: 'GitHub connection initiated' 
      });
    }

    if (action === 'disconnect') {
      // GitHub disconnection logic would go here
      return NextResponse.json({ 
        success: true,
        message: 'GitHub disconnected' 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('GitHub API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
