/**
 * File Operations API (giselle-style)
 *
 * Handles file operations following giselle HTTP router patterns.
 * This complements the existing api.files.ts with additional operations.
 *
 * GET /api/file-operations?workspaceId=xxx&fileId=xxx&text=true - Get file text content
 * POST /api/file-operations - Upload a file
 * POST /api/file-operations?action=copy - Copy a file
 * POST /api/file-operations?action=addWebPage - Add web page as file
 * DELETE /api/file-operations - Remove a file
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { JsonResponse } from '~/lib/http/json-response';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FileOperations');
import { memoryStorageDriver } from '../../../packages/storage/src/memory-storage-driver';
import { z } from 'zod';

// Dynamic import for session verification
async function verifySession(request: Request) {
  const { verifySession: verify } = await import('~/lib/auth/session.server');
  return verify(request);
}

// Request body type
interface FileOperationRequestBody {
  workspaceId?: string;
  fileId?: string;
  fileName?: string;
  content?: string;
  encoding?: 'utf-8' | 'base64';
  mimeType?: string;
  sourceFileId?: string;
  destinationFileId?: string;
  webpage?: { url: string; title?: string; selector?: string };
}

// Schema definitions
const FileId = z.string().min(1).brand<'FileId'>();
const WorkspaceId = z.string().min(1);

const FileEntry = z.object({
  id: FileId,
  workspaceId: WorkspaceId,
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  content: z.string().optional(),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const UploadFileInput = z.object({
  workspaceId: WorkspaceId,
  fileId: FileId.optional(),
  fileName: z.string(),
  content: z.string(),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  mimeType: z.string().optional(),
});

const CopyFileInput = z.object({
  workspaceId: WorkspaceId,
  sourceFileId: FileId,
  destinationFileId: FileId,
});

const FetchingWebPage = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  selector: z.string().optional(),
});

const AddWebPageInput = z.object({
  workspaceId: WorkspaceId,
  webpage: FetchingWebPage,
});

type FileEntryType = z.infer<typeof FileEntry>;

const fileStorage = memoryStorageDriver();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getFileStoragePath(workspaceId: string, fileId: string): string {
  return `workspaces/${workspaceId}/files/${fileId}.json`;
}

async function storeFile(file: FileEntryType): Promise<void> {
  await fileStorage.setBlob(
    getFileStoragePath(file.workspaceId, file.id),
    textEncoder.encode(JSON.stringify(file)),
    { contentType: 'application/json' },
  );
}

async function readFile(workspaceId: string, fileId: string): Promise<FileEntryType | null> {
  const path = getFileStoragePath(workspaceId, fileId);
  if (!(await fileStorage.exists(path))) {
    return null;
  }

  const blob = await fileStorage.getBlob(path);
  const parsed = JSON.parse(textDecoder.decode(blob));
  const result = FileEntry.safeParse(parsed);
  return result.success ? result.data : null;
}

async function deleteFile(workspaceId: string, fileId: string): Promise<void> {
  await fileStorage.remove(getFileStoragePath(workspaceId, fileId));
}

async function listWorkspaceFiles(workspaceId: string): Promise<FileEntryType[]> {
  const prefix = `workspaces/${workspaceId}/files/`;
  const results: FileEntryType[] = [];
  let cursor: string | undefined;

  do {
    const page = await fileStorage.listBlobs({ prefix, cursor, limit: 200 });
    for (const blob of page.blobs) {
      try {
        const content = await fileStorage.getBlob(blob.pathname);
        const parsed = JSON.parse(textDecoder.decode(content));
        const result = FileEntry.safeParse(parsed);
        if (result.success) {
          results.push(result.data);
        }
      } catch {
        // Skip malformed entries
      }
    }
    cursor = page.cursor;
  } while (cursor);

  return results;
}

/**
 * Generate a unique file ID
 */
function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'txt': 'text/plain',
    'md': 'text/markdown',
    'json': 'application/json',
    'js': 'application/javascript',
    'ts': 'application/typescript',
    'jsx': 'application/javascript',
    'tsx': 'application/typescript',
    'html': 'text/html',
    'css': 'text/css',
    'scss': 'text/scss',
    'py': 'text/x-python',
    'go': 'text/x-go',
    'rs': 'text/x-rust',
    'java': 'text/x-java',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Fetch and extract content from a web page
 */
async function fetchWebPageContent(url: string, selector?: string): Promise<{ title: string; content: string }> {
  try {
    // Validate URL to prevent SSRF
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS URLs are allowed');
    }
    const h = parsed.hostname.toLowerCase();
    if (
      h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' ||
      h === '::1' || h === '[::1]' ||
      h.startsWith('10.') || h.startsWith('172.') || h.startsWith('192.168.') ||
      h === '169.254.169.254' || h.endsWith('.internal') || h.endsWith('.local')
    ) {
      throw new Error('Internal network addresses are not allowed');
    }

    const response = await fetch(url);
    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    // Extract body content (simplified - in production use proper HTML parser)
    let content = html;

    // Remove script and style tags
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove HTML tags
    content = content.replace(/<[^>]+>/g, ' ');

    // Clean up whitespace
    content = content.replace(/\s+/g, ' ').trim();

    return { title, content };
  } catch (error) {
    throw new Error('Failed to fetch web page');
  }
}

/**
 * GET /api/file-operations
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return JsonResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const fileId = url.searchParams.get('fileId');
    const getText = url.searchParams.get('text') === 'true';

    if (!workspaceId) {
      return JsonResponse.json({ success: false, error: 'workspaceId required' }, { status: 400 });
    }

    // Get file text content
    if (fileId && getText) {
      const file = await readFile(workspaceId, fileId);
      if (!file) {
        return JsonResponse.json({ success: false, error: 'File not found' }, { status: 404 });
      }

      // Return text content
      const text = file.encoding === 'base64' && file.content
        ? Buffer.from(file.content, 'base64').toString('utf-8')
        : file.content || '';

      return JsonResponse.json({ success: true, text });
    }

    // Get file metadata
    if (fileId) {
      const file = await readFile(workspaceId, fileId);
      if (!file) {
        return JsonResponse.json({ success: false, error: 'File not found' }, { status: 404 });
      }

      // Return file without content (for metadata only)
      const { content, ...metadata } = file;
      return JsonResponse.json({ success: true, file: metadata });
    }

    // List all files in workspace
    const files = (await listWorkspaceFiles(workspaceId)).map(({ content, ...metadata }) => metadata);

    return JsonResponse.json({ success: true, files });
  } catch (error) {
    logger.error('[FileOperations] Loader error:', error);
    return JsonResponse.json({
      success: false,
      error: 'Failed to get files',
    }, { status: 500 });
  }
}

/**
 * POST /api/file-operations - Upload file
 * DELETE /api/file-operations - Remove file
 */
export async function action({ request }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return JsonResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const actionType = url.searchParams.get('action');
    const contentType = request.headers.get('content-type') || '';

    // Handle multipart form data (file upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const workspaceId = formData.get('workspaceId') as string;
      const fileIdParam = formData.get('fileId') as string;
      const fileName = formData.get('fileName') as string;
      const file = formData.get('file') as File;

      if (!workspaceId || !fileName || !file) {
        return JsonResponse.json({
          success: false,
          error: 'workspaceId, fileName, and file are required',
        }, { status: 400 });
      }

      const fileId = fileIdParam || generateFileId();
      const now = new Date().toISOString();

      // Read file content
      const arrayBuffer = await file.arrayBuffer();
      const content = Buffer.from(arrayBuffer).toString('base64');

      const newFile: FileEntryType = {
        id: fileId as any,
        workspaceId,
        name: fileName,
        path: `/${fileName}`,
        type: 'file',
        mimeType: file.type || getMimeType(fileName),
        size: file.size,
        content,
        encoding: 'base64',
        createdAt: now,
        updatedAt: now,
        metadata: { userId: session.user.id },
      };

      await storeFile(newFile);

      logger.info(`[FileOperations] Uploaded: ${fileId} (${fileName})`);
      return new Response(null, { status: 202 });
    }

    // Handle JSON body
    const body = await request.json() as FileOperationRequestBody;

    // Copy file
    if (actionType === 'copy') {
      const validation = CopyFileInput.safeParse(body);
      if (!validation.success) {
        return JsonResponse.json({
          success: false,
          error: 'Invalid input',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const { workspaceId, sourceFileId, destinationFileId } = validation.data;
      const sourceFile = await readFile(workspaceId, sourceFileId);

      if (!sourceFile) {
        return JsonResponse.json({ success: false, error: 'Source file not found' }, { status: 404 });
      }

      const now = new Date().toISOString();
      const copiedFile: FileEntryType = {
        ...sourceFile,
        id: destinationFileId,
        createdAt: now,
        updatedAt: now,
      };

      await storeFile(copiedFile);

      logger.info(`[FileOperations] Copied: ${sourceFileId} -> ${destinationFileId}`);
      return new Response(null, { status: 204 });
    }

    // Add web page as file
    if (actionType === 'addWebPage') {
      const validation = AddWebPageInput.safeParse(body);
      if (!validation.success) {
        return JsonResponse.json({
          success: false,
          error: 'Invalid input',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const { workspaceId, webpage } = validation.data;
      const { title, content } = await fetchWebPageContent(webpage.url, webpage.selector);

      const fileId = generateFileId();
      const now = new Date().toISOString();
      const fileName = `${webpage.title || title || 'webpage'}.md`;

      const newFile: FileEntryType = {
        id: fileId as any,
        workspaceId,
        name: fileName,
        path: `/${fileName}`,
        type: 'file',
        mimeType: 'text/markdown',
        size: content.length,
        content: `# ${title}\n\nSource: ${webpage.url}\n\n${content}`,
        encoding: 'utf-8',
        createdAt: now,
        updatedAt: now,
        metadata: {
          userId: session.user.id,
          sourceUrl: webpage.url,
        },
      };

      await storeFile(newFile);

      logger.info(`[FileOperations] Added web page: ${fileId} (${webpage.url})`);
      return JsonResponse.json({ success: true, file: { id: fileId, name: fileName, path: newFile.path } });
    }

    // POST - Upload file (JSON body)
    if (request.method === 'POST') {
      const validation = UploadFileInput.safeParse(body);
      if (!validation.success) {
        return JsonResponse.json({
          success: false,
          error: 'Invalid input',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const fileId = validation.data.fileId || generateFileId();
      const now = new Date().toISOString();

      const newFile: FileEntryType = {
        id: fileId as any,
        workspaceId: validation.data.workspaceId,
        name: validation.data.fileName,
        path: `/${validation.data.fileName}`,
        type: 'file',
        mimeType: validation.data.mimeType || getMimeType(validation.data.fileName),
        size: validation.data.content.length,
        content: validation.data.content,
        encoding: validation.data.encoding,
        createdAt: now,
        updatedAt: now,
        metadata: { userId: session.user.id },
      };

      await storeFile(newFile);

      logger.info(`[FileOperations] Uploaded: ${fileId} (${validation.data.fileName})`);
      return new Response(null, { status: 202 });
    }

    // DELETE - Remove file
    if (request.method === 'DELETE') {
      const workspaceId = body.workspaceId;
      const fileId = body.fileId;

      if (!workspaceId || !fileId) {
        return JsonResponse.json({ success: false, error: 'workspaceId and fileId required' }, { status: 400 });
      }

      const file = await readFile(workspaceId, fileId);

      if (!file) {
        return JsonResponse.json({ success: false, error: 'File not found' }, { status: 404 });
      }

      await deleteFile(workspaceId, fileId);

      logger.info(`[FileOperations] Removed: ${fileId}`);
      return new Response(null, { status: 204 });
    }

    return JsonResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    logger.error('[FileOperations] Action error:', error);
    return JsonResponse.json({
      success: false,
      error: 'File operation failed',
    }, { status: 500 });
  }
}
