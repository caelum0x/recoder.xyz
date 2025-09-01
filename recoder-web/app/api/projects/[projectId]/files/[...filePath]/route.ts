import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import logger from '@/lib/logger';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; filePath: string[] }> }
) {
  try {
    const { projectId, filePath } = await params;
    const projectPath = path.join(PROJECTS_DIR, projectId);
    const fullFilePath = path.join(projectPath, ...filePath);

    // Check if project exists
    try {
      await fs.access(projectPath);
    } catch {
      return NextResponse.json({ 
        success: false,
        error: 'Project not found' 
      }, { status: 404 });
    }

    // Check if file exists
    try {
      const stats = await fs.stat(fullFilePath);
      if (stats.isDirectory()) {
        return NextResponse.json({ 
          success: false,
          error: 'Path is a directory, not a file' 
        }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ 
        success: false,
        error: 'File not found' 
      }, { status: 404 });
    }

    // Read file content
    const content = await fs.readFile(fullFilePath, 'utf-8');
    const stats = await fs.stat(fullFilePath);

    return NextResponse.json({
      success: true,
      data: {
        content,
        fileName: path.basename(fullFilePath),
        filePath: filePath.join('/'),
        size: stats.size,
        lastModified: stats.mtime.toISOString()
      }
    });

  } catch (error) {
    logger.error('Error reading file:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to read file' 
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; filePath: string[] }> }
) {
  try {
    const { projectId, filePath } = await params;
    const { content } = await request.json();

    if (content === undefined) {
      return NextResponse.json({ 
        success: false,
        error: 'Content is required' 
      }, { status: 400 });
    }

    const projectPath = path.join(PROJECTS_DIR, projectId);
    const fullFilePath = path.join(projectPath, ...filePath);

    // Check if project exists
    try {
      await fs.access(projectPath);
    } catch {
      return NextResponse.json({ 
        success: false,
        error: 'Project not found' 
      }, { status: 404 });
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullFilePath), { recursive: true });

    // Write file content
    await fs.writeFile(fullFilePath, content);

    // Update project metadata timestamp
    const metadataPath = path.join(projectPath, '.recoder', 'metadata.json');
    try {
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      metadata.updatedAt = new Date().toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } catch {
      // Metadata file doesn't exist or is invalid, skip update
    }

    logger.info(`Updated file: ${filePath.join('/')} in project ${projectId}`);

    return NextResponse.json({
      success: true,
      data: {
        fileName: path.basename(fullFilePath),
        filePath: filePath.join('/'),
        updatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error updating file:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to update file' 
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; filePath: string[] }> }
) {
  try {
    const { projectId, filePath } = await params;
    const projectPath = path.join(PROJECTS_DIR, projectId);
    const fullFilePath = path.join(projectPath, ...filePath);

    // Check if project exists
    try {
      await fs.access(projectPath);
    } catch {
      return NextResponse.json({ 
        success: false,
        error: 'Project not found' 
      }, { status: 404 });
    }

    // Check if file exists
    try {
      await fs.access(fullFilePath);
    } catch {
      return NextResponse.json({ 
        success: false,
        error: 'File not found' 
      }, { status: 404 });
    }

    // Delete the file
    await fs.unlink(fullFilePath);

    logger.info(`Deleted file: ${filePath.join('/')} from project ${projectId}`);

    return NextResponse.json({
      success: true,
      data: {
        fileName: path.basename(fullFilePath),
        filePath: filePath.join('/')
      }
    });

  } catch (error) {
    logger.error('Error deleting file:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to delete file' 
    }, { status: 500 });
  }
}
