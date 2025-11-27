import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

const RECODER_WEB_URL = process.env.RECODER_WEB_URL || 'http://localhost:5173';

export async function GET(request: NextRequest) {
  try {
    // Get session from better-auth
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '50';

    // Fetch projects from recoder-web API
    const url = new URL(`${RECODER_WEB_URL}/api/chat-history`);
    url.searchParams.set('userId', session.user.id);
    url.searchParams.set('limit', limit);

    const response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch projects from recoder-web:', response.statusText);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch projects' },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.success || !data.data) {
      return NextResponse.json(
        { success: false, error: 'Invalid response from recoder-web' },
        { status: 500 }
      );
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
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
