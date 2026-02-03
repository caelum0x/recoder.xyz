/**
 * File Operations API
 * Handles file tree and file content operations for projects
 *
 * GET /api/files - Get file tree for a project
 * POST /api/files - Write/update a file
 * DELETE /api/files - Delete a file
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileEntry[];
  size?: number;
  lastModified?: string;
}

interface FileRequest {
  projectId: string;
  path: string;
  content?: string;
  encoding?: 'utf-8' | 'base64';
}

// File extension to language mapping
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.md': 'markdown',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
};

// Default Vite template file structure
const DEFAULT_FILE_STRUCTURE: FileEntry = {
  name: 'root',
  path: '/',
  type: 'directory',
  children: [
    {
      name: 'src',
      path: '/src',
      type: 'directory',
      children: [
        { name: 'App.tsx', path: '/src/App.tsx', type: 'file' },
        { name: 'main.tsx', path: '/src/main.tsx', type: 'file' },
        { name: 'index.css', path: '/src/index.css', type: 'file' },
        { name: 'vite-env.d.ts', path: '/src/vite-env.d.ts', type: 'file' },
        {
          name: 'components',
          path: '/src/components',
          type: 'directory',
          children: [],
        },
        {
          name: 'lib',
          path: '/src/lib',
          type: 'directory',
          children: [
            { name: 'utils.ts', path: '/src/lib/utils.ts', type: 'file' },
          ],
        },
      ],
    },
    {
      name: 'public',
      path: '/public',
      type: 'directory',
      children: [],
    },
    { name: 'index.html', path: '/index.html', type: 'file' },
    { name: 'package.json', path: '/package.json', type: 'file' },
    { name: 'vite.config.ts', path: '/vite.config.ts', type: 'file' },
    { name: 'tsconfig.json', path: '/tsconfig.json', type: 'file' },
    { name: 'tailwind.config.js', path: '/tailwind.config.js', type: 'file' },
    { name: 'postcss.config.js', path: '/postcss.config.js', type: 'file' },
  ],
};

/**
 * Get file language from extension
 */
function getFileLanguage(path: string): string {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  return LANGUAGE_MAP[ext] || 'plaintext';
}

/**
 * Flatten file tree to list of file paths
 */
function flattenFileTree(entry: FileEntry, files: string[] = []): string[] {
  if (entry.type === 'file') {
    files.push(entry.path);
  }
  if (entry.children) {
    for (const child of entry.children) {
      flattenFileTree(child, files);
    }
  }
  return files;
}

/**
 * GET /api/files - Get file tree
 * Query params:
 * - projectId: Project ID (required)
 * - path: Specific path to get (optional)
 * - flat: Return flat file list instead of tree (optional)
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const path = url.searchParams.get('path');
    const flat = url.searchParams.get('flat') === 'true';

    if (!projectId) {
      return json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }

    // In production, fetch file tree from docker-backend or sandbox
    // For now, return default structure
    const env = context?.cloudflare?.env || process.env || {};
    const dockerBackendUrl = (env as any).DOCKER_BACKEND_URL || 'http://localhost:3100';

    try {
      // Try to get files from docker-backend
      const response = await fetch(`${dockerBackendUrl}/files/${projectId}?path=${path || '/'}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json() as { files: FileEntry };

        if (flat) {
          const files = flattenFileTree(data.files);
          return json({ success: true, files });
        }

        return json({ success: true, fileTree: data.files });
      }
    } catch (fetchError) {
      // Fall through to default structure if docker-backend is unavailable
      console.log('[Files] Docker backend unavailable, using default structure');
    }

    // Return default structure
    if (flat) {
      const files = flattenFileTree(DEFAULT_FILE_STRUCTURE);
      return json({ success: true, files });
    }

    return json({
      success: true,
      fileTree: DEFAULT_FILE_STRUCTURE,
      isDefault: true,
    });
  } catch (error) {
    console.error('[Files] Get file tree error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get file tree',
    }, { status: 500 });
  }
}

/**
 * POST /api/files - Write/update file
 * Body: { projectId, path, content, encoding? }
 *
 * DELETE /api/files - Delete file
 * Body: { projectId, path }
 */
export async function action({ request, context }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json() as FileRequest;
    const { projectId, path, content, encoding = 'utf-8' } = body;

    if (!projectId) {
      return json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }

    if (!path) {
      return json({ success: false, error: 'File path is required' }, { status: 400 });
    }

    const env = context?.cloudflare?.env || process.env || {};
    const dockerBackendUrl = (env as any).DOCKER_BACKEND_URL || 'http://localhost:3100';

    // Extract session token from cookies
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionToken = extractSessionToken(cookieHeader);

    // POST - Write file
    if (request.method === 'POST') {
      if (content === undefined) {
        return json({ success: false, error: 'File content is required' }, { status: 400 });
      }

      try {
        const response = await fetch(`${dockerBackendUrl}/files/${projectId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken && { 'Authorization': `Bearer ${sessionToken}` }),
          },
          body: JSON.stringify({
            path,
            content,
            encoding,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(errorData.error || 'Failed to write file');
        }

        console.log(`[Files] File written: ${path} in project ${projectId}`);

        return json({
          success: true,
          message: 'File written successfully',
          path,
          language: getFileLanguage(path),
        });
      } catch (fetchError) {
        console.error('[Files] Write error:', fetchError);
        return json({
          success: false,
          error: fetchError instanceof Error ? fetchError.message : 'Failed to write file',
        }, { status: 500 });
      }
    }

    // DELETE - Delete file
    if (request.method === 'DELETE') {
      try {
        const response = await fetch(`${dockerBackendUrl}/files/${projectId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken && { 'Authorization': `Bearer ${sessionToken}` }),
          },
          body: JSON.stringify({ path }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(errorData.error || 'Failed to delete file');
        }

        console.log(`[Files] File deleted: ${path} in project ${projectId}`);

        return json({
          success: true,
          message: 'File deleted successfully',
          path,
        });
      } catch (fetchError) {
        console.error('[Files] Delete error:', fetchError);
        return json({
          success: false,
          error: fetchError instanceof Error ? fetchError.message : 'Failed to delete file',
        }, { status: 500 });
      }
    }

    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('[Files] Action error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'File operation failed',
    }, { status: 500 });
  }
}

/**
 * Extract session token from cookies
 */
function extractSessionToken(cookieHeader: string): string | undefined {
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'recoder.session_token' || name === 'session_token') {
      return decodeURIComponent(value);
    }
  }
  return undefined;
}
