import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import ServerAuth from '@/lib/auth/server-auth';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}

interface SaveRequest {
  id: string;
  name: string;
  description: string;
  framework: string;
  files: FileNode[];
  chat: ChatMessage[];
  isPublic: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const session = await ServerAuth.validateSession(request);
    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const body: SaveRequest = await request.json();
    const { id, name, description, framework, files, chat, isPublic } = body;

    // Check if project exists (using name as identifier since we don't have sessionId)
    const existingProject = await prisma.aiGeneratedProject.findFirst({
      where: {
        name: name || 'Untitled Project',
        userId: session.user.id
      }
    });

    const projectData = {
      userId: session.user.id,
      name: name || 'Untitled Project',
      description: description || 'AI-generated project',
      framework,
      files: files as any,
      isPublic: isPublic || false,
      metadata: { chat: chat } as any
    };

    let savedProject;

    if (existingProject) {
      // Update existing project
      savedProject = await prisma.aiGeneratedProject.update({
        where: { id: existingProject.id },
        data: projectData
      });
    } else {
      // Create new project
      savedProject = await prisma.aiGeneratedProject.create({
        data: projectData
      });
    }

    // Log project save activity
    await prisma.usageRecord.create({
      data: {
        userId: session.user.id,
        feature: 'ai_project_save',
        tokens: 0,
        cost: 0,
        metadata: {
          projectId: savedProject.id,
          framework,
          fileCount: countFiles(files),
          chatMessages: chat.length
        }
      }
    });

    return NextResponse.json({
      success: true,
      projectId: savedProject.id,
      message: 'Project saved successfully'
    });

  } catch (error) {
    console.error('Project save error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to save project',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const session = await ServerAuth.validateSession(request);
    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const sessionId = searchParams.get('sessionId');

    let project;

    if (projectId) {
      // Load by project ID
      project = await prisma.aiGeneratedProject.findFirst({
        where: {
          id: projectId,
          OR: [
            { userId: session.user.id },
            { isPublic: true }
          ]
        }
      });
    } else if (sessionId) {
      // Load by name as fallback since sessionId doesn't exist in schema
      project = await prisma.aiGeneratedProject.findFirst({
        where: {
          name: { contains: sessionId },
          userId: session.user.id
        }
      });
    } else {
      // List user's projects
      const projects = await prisma.aiGeneratedProject.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          name: true,
          description: true,
          framework: true,
          isPublic: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return NextResponse.json({
        success: true,
        projects
      });
    }

    if (!project) {
      return NextResponse.json({
        success: false,
        error: 'Project not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      project
    });

  } catch (error) {
    console.error('Project load error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to load project',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function countFiles(files: FileNode[]): number {
  let count = 0;
  files.forEach(file => {
    if (file.type === 'file') {
      count++;
    }
    if (file.type === 'folder' && file.children) {
      count += countFiles(file.children);
    }
  });
  return count;
}