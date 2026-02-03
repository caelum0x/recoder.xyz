import { type LoaderFunctionArgs, type ActionFunctionArgs, json } from '@remix-run/cloudflare';

/**
 * API Route: GET /api/get-sandbox-files
 *
 * Lists all files in the Docker sandbox with optional filtering and content retrieval.
 *
 * Query Parameters:
 * - projectId (required): The project ID for the container
 * - directory (optional): Filter to specific directory (e.g., "src", "src/components")
 * - includeContent (optional): "true" to include file contents (default: false)
 * - maxDepth (optional): Maximum directory depth to traverse (default: 10)
 * - extensions (optional): Comma-separated list of extensions to include (e.g., "ts,tsx,js,jsx")
 * - maxFileSize (optional): Maximum file size in KB to include content for (default: 100)
 *
 * Returns:
 * - files: Array of file info objects
 * - directories: Array of directory paths
 * - structure: Directory structure as string
 * - fileCount: Total number of files found
 */

// Default patterns to exclude from file listing
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.cache',
  'coverage',
  '.turbo',
  '.vercel',
  '.output',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'target', // Rust
  '.cargo',
];

// Common code file extensions (available for reference)
// Can be used with the 'extensions' query parameter
// e.g., ?extensions=ts,tsx,js,jsx
export const CODE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'json', 'css', 'scss', 'less', 'html',
  'vue', 'svelte', 'md', 'mdx', 'yaml', 'yml', 'toml', 'py', 'rs',
  'go', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp', 'sql',
  'graphql', 'prisma', 'env', 'sh', 'bash', 'zsh', 'dockerfile',
  'gitignore', 'prettierrc', 'eslintrc',
];

interface FileInfo {
  path: string;
  relativePath: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedTime?: number;
  content?: string;
  extension?: string;
}

interface SandboxFilesResponse {
  success: boolean;
  files: FileInfo[];
  directories: string[];
  structure: string;
  fileCount: number;
  error?: string;
}

// Get the Docker backend URL from environment
function getDockerBackendUrl(context: LoaderFunctionArgs['context']): string {
  const env = (context as unknown as { cloudflare?: { env?: Record<string, string> } }).cloudflare?.env;
  return env?.DOCKER_BACKEND_URL || process.env.DOCKER_BACKEND_URL || 'http://localhost:3100';
}

// Make authenticated request to docker-backend
async function dockerFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((errorData as { error?: string }).error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const directory = url.searchParams.get('directory') || '';
    const includeContent = url.searchParams.get('includeContent') === 'true';
    const maxDepth = parseInt(url.searchParams.get('maxDepth') || '10', 10);
    const extensionsParam = url.searchParams.get('extensions');
    const maxFileSize = parseInt(url.searchParams.get('maxFileSize') || '100', 10) * 1024; // Convert KB to bytes

    if (!projectId) {
      return json<SandboxFilesResponse>(
        {
          success: false,
          files: [],
          directories: [],
          structure: '',
          fileCount: 0,
          error: 'Project ID is required',
        },
        { status: 400 }
      );
    }

    const dockerUrl = getDockerBackendUrl(context);

    // Build the path query parameter
    const basePath = directory ? `/workspace/${directory.replace(/^\//, '')}` : '/workspace';

    // Step 1: Get list of all files using docker-backend's /api/files endpoint
    // This endpoint uses find with maxdepth 2, but we'll use the export endpoint pattern
    // for deeper traversal
    console.log(`[get-sandbox-files] Fetching files for project ${projectId}, directory: ${directory || '/'}`);

    // We'll make a direct call to list files, then optionally read contents
    const filesEndpoint = `${dockerUrl}/api/files/${projectId}?path=${encodeURIComponent(basePath)}`;

    let rawFiles: string[] = [];

    try {
      const filesResponse = await dockerFetch<{ files: string[] }>(filesEndpoint);
      rawFiles = filesResponse.files || [];
    } catch (error) {
      console.error(`[get-sandbox-files] Failed to list files:`, error);
      return json<SandboxFilesResponse>(
        {
          success: false,
          files: [],
          directories: [],
          structure: '',
          fileCount: 0,
          error: error instanceof Error ? error.message : 'Failed to list files',
        },
        { status: 500 }
      );
    }

    // Filter out excluded patterns
    const filteredFiles = rawFiles.filter((filePath) => {
      // Check if any exclude pattern is in the path
      return !DEFAULT_EXCLUDE_PATTERNS.some((pattern) => filePath.includes(`/${pattern}/`) || filePath.endsWith(`/${pattern}`));
    });

    // Separate files and directories
    const allItems: FileInfo[] = [];
    const directories: string[] = [];

    // Get allowed extensions
    const allowedExtensions = extensionsParam
      ? extensionsParam.split(',').map((ext) => ext.trim().toLowerCase())
      : null;

    for (const fullPath of filteredFiles) {
      const relativePath = fullPath.replace('/workspace/', '').replace('/workspace', '');

      // Skip empty paths
      if (!relativePath) continue;

      // Determine if it's a file or directory (we'll assume files have extensions for now)
      const hasExtension = relativePath.includes('.') && !relativePath.endsWith('/');
      const isDirectory = !hasExtension || fullPath.endsWith('/');

      if (isDirectory) {
        directories.push(relativePath);
        allItems.push({
          path: fullPath,
          relativePath,
          type: 'directory',
        });
      } else {
        // Get extension
        const extension = relativePath.split('.').pop()?.toLowerCase() || '';

        // Filter by extension if specified
        if (allowedExtensions && !allowedExtensions.includes(extension)) {
          continue;
        }

        allItems.push({
          path: fullPath,
          relativePath,
          type: 'file',
          extension,
        });
      }
    }

    // Get files only
    const filesOnly = allItems.filter((item) => item.type === 'file');

    console.log(`[get-sandbox-files] Found ${filesOnly.length} files, ${directories.length} directories`);

    // Step 2: Optionally fetch file contents
    if (includeContent && filesOnly.length > 0) {
      console.log(`[get-sandbox-files] Fetching content for ${filesOnly.length} files`);

      // First, get file stats (size) to filter out large files
      // We'll read files in batches to avoid overwhelming the server
      const batchSize = 20;
      const filesToRead = filesOnly.slice(0, 200); // Limit to 200 files max for content

      for (let i = 0; i < filesToRead.length; i += batchSize) {
        const batch = filesToRead.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (file) => {
            try {
              // Read file content
              const fileEndpoint = `${dockerUrl}/api/file/${projectId}?path=${encodeURIComponent(file.path)}`;
              const fileResponse = await dockerFetch<{ content: string; size?: number }>(fileEndpoint);

              const content = fileResponse.content || '';
              const size = Buffer.byteLength(content, 'utf8');

              // Only include content if file is under max size
              if (size <= maxFileSize) {
                file.content = content;
                file.size = size;
              } else {
                // Still record size but skip content
                file.size = size;
              }
            } catch (error) {
              // Skip files that can't be read (binary, permissions, etc.)
              console.debug(`[get-sandbox-files] Could not read ${file.path}:`, error);
            }
          })
        );
      }
    }

    // Build directory structure string
    const uniqueDirs = Array.from(new Set(directories)).sort();
    const structure = uniqueDirs.slice(0, 50).join('\n');

    return json<SandboxFilesResponse>({
      success: true,
      files: filesOnly,
      directories: uniqueDirs,
      structure,
      fileCount: filesOnly.length,
    });
  } catch (error) {
    console.error('[get-sandbox-files] Error:', error);
    return json<SandboxFilesResponse>(
      {
        success: false,
        files: [],
        directories: [],
        structure: '',
        fileCount: 0,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for more complex file queries
 *
 * Request Body:
 * - projectId (required): The project ID
 * - paths (optional): Specific file paths to fetch content for
 * - includePatterns (optional): Glob patterns to include
 * - excludePatterns (optional): Additional glob patterns to exclude
 * - includeContent (optional): Whether to include file contents
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json() as {
      projectId?: string;
      paths?: string[];
      includePatterns?: string[];
      excludePatterns?: string[];
      includeContent?: boolean;
      maxFileSize?: number;
    };

    const { projectId, paths, excludePatterns, includeContent, maxFileSize = 100 } = body;

    if (!projectId) {
      return json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const dockerUrl = getDockerBackendUrl(context);
    const maxFileSizeBytes = maxFileSize * 1024;

    // If specific paths provided, just fetch those
    if (paths && paths.length > 0) {
      const results: FileInfo[] = [];
      const failed: Array<{ path: string; error: string }> = [];

      const batchSize = 20;
      for (let i = 0; i < paths.length; i += batchSize) {
        const batch = paths.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (filePath) => {
            const fullPath = filePath.startsWith('/workspace')
              ? filePath
              : `/workspace/${filePath.replace(/^\//, '')}`;

            try {
              const fileEndpoint = `${dockerUrl}/api/file/${projectId}?path=${encodeURIComponent(fullPath)}`;
              const fileResponse = await dockerFetch<{ content: string }>(fileEndpoint);

              const content = fileResponse.content || '';
              const size = Buffer.byteLength(content, 'utf8');
              const extension = filePath.split('.').pop()?.toLowerCase() || '';

              results.push({
                path: fullPath,
                relativePath: filePath.replace(/^\/workspace\//, '').replace(/^\//, ''),
                type: 'file',
                extension,
                size,
                content: includeContent && size <= maxFileSizeBytes ? content : undefined,
              });
            } catch (error) {
              failed.push({
                path: filePath,
                error: error instanceof Error ? error.message : 'Failed to read file',
              });
            }
          })
        );
      }

      return json({
        success: true,
        files: results,
        failed,
        fileCount: results.length,
      });
    }

    // Otherwise, list all files with optional filters
    const filesEndpoint = `${dockerUrl}/api/files/${projectId}?path=/workspace`;
    const filesResponse = await dockerFetch<{ files: string[] }>(filesEndpoint);
    const rawFiles = filesResponse.files || [];

    // Apply exclusion patterns
    const allExcludePatterns = [...DEFAULT_EXCLUDE_PATTERNS, ...(excludePatterns || [])];
    const filteredFiles = rawFiles.filter((filePath) => {
      return !allExcludePatterns.some(
        (pattern) => filePath.includes(`/${pattern}/`) || filePath.endsWith(`/${pattern}`)
      );
    });

    // Process into file info objects
    const files: FileInfo[] = [];
    const directories: string[] = [];

    for (const fullPath of filteredFiles) {
      const relativePath = fullPath.replace('/workspace/', '').replace('/workspace', '');
      if (!relativePath) continue;

      const hasExtension = relativePath.includes('.') && !relativePath.endsWith('/');
      const isDirectory = !hasExtension || fullPath.endsWith('/');

      if (isDirectory) {
        directories.push(relativePath);
      } else {
        const extension = relativePath.split('.').pop()?.toLowerCase() || '';
        files.push({
          path: fullPath,
          relativePath,
          type: 'file',
          extension,
        });
      }
    }

    // Optionally fetch content
    if (includeContent) {
      const filesToRead = files.slice(0, 200);
      const batchSize = 20;

      for (let i = 0; i < filesToRead.length; i += batchSize) {
        const batch = filesToRead.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (file) => {
            try {
              const fileEndpoint = `${dockerUrl}/api/file/${projectId}?path=${encodeURIComponent(file.path)}`;
              const fileResponse = await dockerFetch<{ content: string }>(fileEndpoint);

              const content = fileResponse.content || '';
              const size = Buffer.byteLength(content, 'utf8');

              file.size = size;
              if (size <= maxFileSizeBytes) {
                file.content = content;
              }
            } catch {
              // Skip files that can't be read
            }
          })
        );
      }
    }

    const uniqueDirectories = Array.from(new Set(directories)).sort();
    return json({
      success: true,
      files,
      directories: uniqueDirectories,
      structure: uniqueDirectories.slice(0, 50).join('\n'),
      fileCount: files.length,
    });
  } catch (error) {
    console.error('[get-sandbox-files] POST error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
