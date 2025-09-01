import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import logger from '@/lib/logger';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
  size?: number;
  lastModified?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const projectPath = path.join(PROJECTS_DIR, projectId);

    // Check if project exists
    try {
      await fs.access(projectPath);
    } catch {
      return NextResponse.json({ 
        success: false,
        error: 'Project not found' 
      }, { status: 404 });
    }

    // Read the file tree recursively
    async function readFileTree(dirPath: string, relativePath: string = ''): Promise<FileNode[]> {
      const items = await fs.readdir(dirPath);
      const result: FileNode[] = [];

      for (const item of items) {
        if (item.startsWith('.')) continue; // Skip hidden files except .recoder

        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);
        const itemRelativePath = path.join(relativePath, item);

        if (stats.isDirectory()) {
          const children = await readFileTree(itemPath, itemRelativePath);
          result.push({
            name: item,
            type: 'folder',
            path: itemRelativePath,
            children
          });
        } else {
          result.push({
            name: item,
            type: 'file',
            path: itemRelativePath,
            size: stats.size,
            lastModified: stats.mtime.toISOString()
          });
        }
      }

      return result;
    }

    const fileTree = await readFileTree(projectPath);

    return NextResponse.json({
      success: true,
      data: { files: fileTree }
    });

  } catch (error) {
    logger.error('Error reading project files:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to read project files' 
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { fileName, content, filePath: relativeFilePath } = await request.json();

    if (!fileName) {
      return NextResponse.json({ 
        success: false,
        error: 'File name is required' 
      }, { status: 400 });
    }

    const projectPath = path.join(PROJECTS_DIR, projectId);
    
    // Check if project exists
    try {
      await fs.access(projectPath);
    } catch {
      return NextResponse.json({ 
        success: false,
        error: 'Project not found' 
      }, { status: 404 });
    }

    const fullFilePath = relativeFilePath 
      ? path.join(projectPath, relativeFilePath, fileName)
      : path.join(projectPath, fileName);

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullFilePath), { recursive: true });

    // Write the file
    await fs.writeFile(fullFilePath, content || '');

    logger.info(`Created file: ${fileName} in project ${projectId}`);

    return NextResponse.json({
      success: true,
      data: {
        fileName,
        path: relativeFilePath ? path.join(relativeFilePath, fileName) : fileName
      }
    });

  } catch (error) {
    logger.error('Error creating file:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to create file' 
    }, { status: 500 });
  }
}
