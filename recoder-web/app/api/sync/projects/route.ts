/**
 * Project Synchronization API Endpoints
 * Provides REST API for project sync across platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectSync } from '@/lib/sync/project-sync';
import { auth } from '@/lib/auth/unified-auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const projectId = searchParams.get('projectId');

    switch (action) {
      case 'list':
        // Get all projects for the user
        const projects = await projectSync.getUserProjects(session.user.id);
        return NextResponse.json({ projects });

      case 'get':
        // Get specific project
        if (!projectId) {
          return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
        }
        
        const project = await projectSync.getProject(projectId, session.user.id);
        if (!project) {
          return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }
        return NextResponse.json({ project });

      case 'files':
        // Get file tree for project
        if (!projectId) {
          return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
        }
        
        const fileTree = await projectSync.getProjectFileTree(projectId, session.user.id);
        return NextResponse.json({ files: fileTree });

      case 'file':
        // Get specific file content
        if (!projectId) {
          return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
        }
        
        const filePath = searchParams.get('path');
        if (!filePath) {
          return NextResponse.json({ error: 'File path required' }, { status: 400 });
        }
        
        const fileData = await projectSync.getFileContent(projectId, filePath, session.user.id);
        if (!fileData) {
          return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }
        
        return NextResponse.json(fileData);

      case 'templates':
        // Get available project templates
        const category = searchParams.get('category') || undefined;
        const language = searchParams.get('language') || undefined;
        const templates = await projectSync.getProjectTemplates(category, language);
        return NextResponse.json({ templates });

      case 'events':
        // Get project events
        if (!projectId) {
          return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
        }
        
        const limit = parseInt(searchParams.get('limit') || '100');
        const events = await projectSync.getProjectEvents(projectId, limit);
        return NextResponse.json({ events });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Project sync API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, projectId, ...data } = body;
    const sessionId = request.headers.get('x-session-id') || 'unknown';
    const platform = request.headers.get('x-platform') || 'web';

    switch (action) {
      case 'create':
        // Create new project
        const newProject = await projectSync.createProject(
          session.user.id,
          sessionId,
          platform,
          data
        );
        return NextResponse.json({ project: newProject });

      case 'update':
        // Update project
        if (!projectId) {
          return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
        }
        
        const updatedProject = await projectSync.updateProject(
          projectId,
          session.user.id,
          sessionId,
          platform,
          data
        );
        
        if (!updatedProject) {
          return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 });
        }
        
        return NextResponse.json({ project: updatedProject });

      case 'updateFile':
        // Update file content
        if (!projectId || !data.filePath) {
          return NextResponse.json({ error: 'Project ID and file path required' }, { status: 400 });
        }
        
        const updatedFile = await projectSync.updateFile(
          projectId,
          data.filePath,
          data.content,
          session.user.id,
          sessionId,
          platform
        );
        
        if (!updatedFile) {
          return NextResponse.json({ error: 'File update failed' }, { status: 400 });
        }
        
        return NextResponse.json({ file: updatedFile });

      case 'lockFile':
        // Lock file for editing
        if (!projectId || !data.filePath) {
          return NextResponse.json({ error: 'Project ID and file path required' }, { status: 400 });
        }
        
        const lockSuccess = await projectSync.lockFile(
          projectId,
          data.filePath,
          session.user.id,
          sessionId,
          platform,
          data.duration
        );
        
        return NextResponse.json({ success: lockSuccess });

      case 'unlockFile':
        // Unlock file
        if (!projectId || !data.filePath) {
          return NextResponse.json({ error: 'Project ID and file path required' }, { status: 400 });
        }
        
        const unlockSuccess = await projectSync.unlockFile(
          projectId,
          data.filePath,
          session.user.id,
          sessionId,
          platform
        );
        
        return NextResponse.json({ success: unlockSuccess });

      case 'createDirectory':
        // Create directory
        if (!projectId || !data.dirPath) {
          return NextResponse.json({ error: 'Project ID and directory path required' }, { status: 400 });
        }
        
        const newDirectory = await projectSync.createDirectory(
          projectId,
          data.dirPath,
          session.user.id,
          sessionId,
          platform
        );
        
        if (!newDirectory) {
          return NextResponse.json({ error: 'Directory creation failed' }, { status: 400 });
        }
        
        return NextResponse.json({ directory: newDirectory });

      case 'deleteFile':
        // Delete file or directory
        if (!projectId || !data.filePath) {
          return NextResponse.json({ error: 'Project ID and file path required' }, { status: 400 });
        }
        
        const deleteSuccess = await projectSync.deleteFile(
          projectId,
          data.filePath,
          session.user.id,
          sessionId,
          platform
        );
        
        return NextResponse.json({ success: deleteSuccess });

      case 'createFromTemplate':
        // Create project from template
        if (!data.templateId || !data.projectName) {
          return NextResponse.json({ error: 'Template ID and project name required' }, { status: 400 });
        }
        
        const templateProject = await projectSync.createProjectFromTemplate(
          data.templateId,
          session.user.id,
          sessionId,
          platform,
          data.projectName,
          data.customizations
        );
        
        return NextResponse.json({ project: templateProject });

      case 'syncFileSystem':
        // Sync project with external filesystem
        if (!projectId) {
          return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
        }
        
        const syncSuccess = await projectSync.syncProjectWithFileSystem(
          projectId,
          session.user.id,
          sessionId,
          platform
        );
        
        return NextResponse.json({ success: syncSuccess });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Project sync API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
