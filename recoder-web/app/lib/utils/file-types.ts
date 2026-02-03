/**
 * File type definitions and utilities
 * Provides type-safe file and directory structures
 */

import { z } from 'zod';

/**
 * File type with modification tracking
 */
export type FileType = {
  type: 'file';
  modified: string;
  original: string | null;
  path: string;
  basename: string;
  dirname: string;
  description: string;
  isNew?: boolean;
};

/**
 * File and directory structure type definitions
 */
export type TFolder = {
  id: string;
  type: 'folder';
  name: string;
  children: (TFile | TFolder)[];
};

export type TFile = {
  id: string;
  type: 'file';
  name: string;
};

export type TTab = TFile & {
  saved: boolean;
};

/**
 * File content mapping type
 */
export type FileContentMap = {
  [path: string]: {
    content: string;
    isBinary: boolean;
    type: string;
    parentPath?: string | null;
  };
};

/**
 * Tree node type definition
 */
export type TreeNode = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  _links: { self: string };
  depth: number;
  parentPath: string | null;
  children?: TreeNode[];
  content?: string;
};

/**
 * File structure type definitions
 */
export type FileEntry = {
  type: 'file';
  isBinary: boolean;
  content: string;
};

export type DirectoryEntry = {
  type: 'directory';
  children: Record<string, FileEntry | DirectoryEntry>;
};

export type FileOrDirEntry = FileEntry | DirectoryEntry;

export type FileStructure = Record<string, FileOrDirEntry>;

export type GetFileContentInput = {
  path: string;
};

// Zod schemas for validation
export const fileEntrySchema = z.object({
  type: z.literal('file'),
  isBinary: z.boolean(),
  content: z.string(),
});

// Directory entry schema - uses z.any() for children to handle recursive types
export const directoryEntrySchema = z.object({
  type: z.literal('directory'),
  children: z.record(z.string(), z.any()),
});

export const fileOrDirEntrySchema = z.union([fileEntrySchema, directoryEntrySchema]);

export const fileStructureSchema = z.record(z.string(), fileOrDirEntrySchema);

/**
 * Validates a file structure at runtime
 */
export function validateFileStructure(data: unknown): FileStructure | null {
  const result = fileStructureSchema.safeParse(data);
  return result.success ? (result.data as FileStructure) : null;
}

export const getFileContentSchema = z.object({
  path: z.string().min(1, 'File path cannot be empty'),
});

/**
 * File diff type for tracking changes
 */
export type FileDiffType = {
  modified: string;
  original: string | null;
  basename: string;
  dirname: string;
  path: string;
  additions: number;
  deletions: number;
  type: 'edit' | 'create' | 'delete';
};

/**
 * File utility functions
 */

/**
 * Check if an entry is a file
 */
export function isFile(entry: FileOrDirEntry): entry is FileEntry {
  return entry.type === 'file';
}

/**
 * Check if an entry is a directory
 */
export function isDirectory(entry: FileOrDirEntry): entry is DirectoryEntry {
  return entry.type === 'directory';
}

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (lastDot > lastSlash && lastDot !== -1) {
    return path.slice(lastDot + 1).toLowerCase();
  }
  return '';
}

/**
 * Get file basename from path
 */
export function getBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

/**
 * Get directory name from path
 */
export function getDirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return '';
  return normalized.slice(0, lastSlash) || '/';
}

/**
 * Join path segments
 */
export function joinPath(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

/**
 * Normalize path separators
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * Check if path is absolute
 */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path);
}

/**
 * Get relative path from base
 */
export function getRelativePath(from: string, to: string): string {
  const fromParts = normalizePath(from).split('/').filter(Boolean);
  const toParts = normalizePath(to).split('/').filter(Boolean);

  let commonLength = 0;
  for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
    if (fromParts[i] === toParts[i]) {
      commonLength++;
    } else {
      break;
    }
  }

  const upCount = fromParts.length - commonLength;
  const downParts = toParts.slice(commonLength);

  return [...Array(upCount).fill('..'), ...downParts].join('/') || '.';
}

/**
 * Check if a file is binary based on extension
 */
export function isBinaryFile(path: string): boolean {
  const binaryExtensions = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'bmp',
    'ico',
    'webp',
    'avif',
    'svg',
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'zip',
    'tar',
    'gz',
    'rar',
    '7z',
    'exe',
    'dll',
    'so',
    'dylib',
    'wasm',
    'ttf',
    'otf',
    'woff',
    'woff2',
    'eot',
    'mp3',
    'mp4',
    'wav',
    'ogg',
    'webm',
    'avi',
    'mov',
    'mkv',
    'sqlite',
    'db',
  ]);

  const ext = getFileExtension(path);
  return binaryExtensions.has(ext);
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(path: string): string {
  const mimeTypes: Record<string, string> = {
    // Text
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    mjs: 'text/javascript',
    json: 'application/json',
    xml: 'application/xml',
    txt: 'text/plain',
    md: 'text/markdown',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    jsx: 'text/javascript',
    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    avif: 'image/avif',
    // Fonts
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    // Audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    // Video
    mp4: 'video/mp4',
    webm: 'video/webm',
    // Documents
    pdf: 'application/pdf',
    zip: 'application/zip',
  };

  const ext = getFileExtension(path);
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Check if file should be ignored (e.g., node_modules, .git)
 */
export function shouldIgnoreFile(path: string): boolean {
  const ignoredPatterns = [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    '.DS_Store',
    'Thumbs.db',
    '.env.local',
    '.env.*.local',
    '*.log',
    'dist',
    'build',
    '.cache',
    '.next',
    '.nuxt',
    '.output',
    'coverage',
  ];

  const normalized = normalizePath(path);
  return ignoredPatterns.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      return regex.test(getBasename(normalized));
    }
    return normalized.includes(`/${pattern}/`) || normalized.endsWith(`/${pattern}`);
  });
}

/**
 * Sort files and directories (directories first, then alphabetically)
 */
export function sortFileEntries<T extends { name: string; type: 'file' | 'folder' | 'dir' }>(
  entries: T[]
): T[] {
  return [...entries].sort((a, b) => {
    const aIsDir = a.type === 'folder' || a.type === 'dir';
    const bIsDir = b.type === 'folder' || b.type === 'dir';

    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Convert flat file map to tree structure
 */
export function fileMapToTree(fileMap: FileContentMap): TreeNode[] {
  const root: TreeNode[] = [];

  const sortedPaths = Object.keys(fileMap).sort();

  for (const path of sortedPaths) {
    const parts = normalizePath(path).split('/').filter(Boolean);
    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      let existing = currentLevel.find((n) => n.name === part);

      if (!existing) {
        const node: TreeNode = {
          name: part,
          path: currentPath,
          type: isLast ? 'file' : 'dir',
          _links: { self: currentPath },
          depth: i,
          parentPath: i > 0 ? parts.slice(0, i).join('/') : null,
        };

        if (!isLast) {
          node.children = [];
        } else {
          node.content = fileMap[path]?.content;
        }

        currentLevel.push(node);
        existing = node;
      }

      if (!isLast && existing.children) {
        currentLevel = existing.children;
      }
    }
  }

  return root;
}
