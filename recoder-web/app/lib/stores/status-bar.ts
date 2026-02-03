/**
 * Status Bar Store - State management for editor status bar
 * Tracks cursor position, file sync status, and file metadata
 */

import { atom, computed } from 'nanostores';

// ============================================
// Types
// ============================================

export interface CursorPosition {
  line: number;
  column: number;
  selection?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
    selectedChars: number;
    selectedLines: number;
  };
}

export interface FileMetadata {
  encoding: 'UTF-8' | 'UTF-16' | 'ASCII' | 'unknown';
  eol: 'LF' | 'CRLF';
  language: string;
  indentType: 'Spaces' | 'Tabs';
  indentSize: number;
}

export type FileSyncStatus = 'synced' | 'syncing' | 'unsaved' | 'error';

// ============================================
// Atoms
// ============================================

/** Current cursor position in the active editor */
export const cursorPositionAtom = atom<CursorPosition>({
  line: 1,
  column: 1,
});

/** File sync status */
export const fileSyncStatusAtom = atom<FileSyncStatus>('synced');

/** Current file metadata */
export const fileMetadataAtom = atom<FileMetadata>({
  encoding: 'UTF-8',
  eol: 'LF',
  language: 'plaintext',
  indentType: 'Spaces',
  indentSize: 2,
});

/** Git branch name (null if not a git repo) */
export const gitBranchAtom = atom<string | null>(null);

/** Is git initialized in the project */
export const isGitInitializedAtom = atom<boolean>(false);

// ============================================
// Actions
// ============================================

/**
 * Update cursor position from editor
 */
export function setCursorPosition(position: CursorPosition): void {
  cursorPositionAtom.set(position);
}

/**
 * Update file sync status
 */
export function setFileSyncStatus(status: FileSyncStatus): void {
  fileSyncStatusAtom.set(status);
}

/**
 * Update file metadata based on current file
 */
export function setFileMetadata(metadata: Partial<FileMetadata>): void {
  fileMetadataAtom.set({
    ...fileMetadataAtom.get(),
    ...metadata,
  });
}

/**
 * Update git branch info
 */
export function setGitBranch(branch: string | null): void {
  gitBranchAtom.set(branch);
  isGitInitializedAtom.set(branch !== null);
}

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    'js': 'JavaScript',
    'jsx': 'JavaScript React',
    'ts': 'TypeScript',
    'tsx': 'TypeScript React',
    'mjs': 'JavaScript',
    'cjs': 'JavaScript',

    // Web
    'html': 'HTML',
    'htm': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'sass': 'Sass',
    'less': 'Less',
    'vue': 'Vue',
    'svelte': 'Svelte',

    // Data/Config
    'json': 'JSON',
    'jsonc': 'JSON with Comments',
    'yaml': 'YAML',
    'yml': 'YAML',
    'xml': 'XML',
    'toml': 'TOML',
    'ini': 'INI',
    'env': 'Environment',

    // Backend
    'py': 'Python',
    'rb': 'Ruby',
    'php': 'PHP',
    'java': 'Java',
    'kt': 'Kotlin',
    'go': 'Go',
    'rs': 'Rust',
    'c': 'C',
    'cpp': 'C++',
    'h': 'C Header',
    'hpp': 'C++ Header',
    'cs': 'C#',
    'swift': 'Swift',

    // Shell/Scripts
    'sh': 'Shell',
    'bash': 'Bash',
    'zsh': 'Zsh',
    'fish': 'Fish',
    'ps1': 'PowerShell',
    'bat': 'Batch',

    // Markup/Docs
    'md': 'Markdown',
    'mdx': 'MDX',
    'rst': 'reStructuredText',
    'tex': 'LaTeX',

    // Config files
    'dockerfile': 'Dockerfile',
    'makefile': 'Makefile',
    'gitignore': 'Git Ignore',

    // Database
    'sql': 'SQL',
    'graphql': 'GraphQL',
    'gql': 'GraphQL',

    // Other
    'log': 'Log',
    'txt': 'Plain Text',
  };

  // Check for special filenames
  const filename = filePath.split('/').pop()?.toLowerCase() || '';

  if (filename === 'dockerfile') return 'Dockerfile';
  if (filename === 'makefile') return 'Makefile';
  if (filename === '.gitignore') return 'Git Ignore';
  if (filename === '.env' || filename.startsWith('.env.')) return 'Environment';
  if (filename === 'package.json') return 'JSON (Package)';
  if (filename === 'tsconfig.json') return 'JSON (TypeScript Config)';

  return languageMap[ext] || 'Plain Text';
}

/**
 * Detect EOL from file content
 */
export function detectEOL(content: string): 'LF' | 'CRLF' {
  if (content.includes('\r\n')) return 'CRLF';
  return 'LF';
}

/**
 * Detect indent type and size from file content
 */
export function detectIndent(content: string): { type: 'Spaces' | 'Tabs'; size: number } {
  const lines = content.split('\n');
  let spacesCount = 0;
  let tabsCount = 0;
  const spaceSizes: number[] = [];

  for (const line of lines) {
    if (line.length === 0) continue;

    const match = line.match(/^(\s+)/);
    if (!match) continue;

    const indent = match[1];
    if (indent.includes('\t')) {
      tabsCount++;
    } else {
      spacesCount++;
      // Try to detect space size
      const spaceCount = indent.length;
      if (spaceCount > 0 && spaceCount <= 8) {
        spaceSizes.push(spaceCount);
      }
    }
  }

  const type = tabsCount > spacesCount ? 'Tabs' : 'Spaces';

  // Calculate most common indent size
  let size = 2; // default
  if (spaceSizes.length > 0) {
    // Find the GCD of all indent sizes to determine the base indent
    const counts: Record<number, number> = {};
    for (const s of spaceSizes) {
      for (let i = 2; i <= Math.min(s, 8); i++) {
        if (s % i === 0) {
          counts[i] = (counts[i] || 0) + 1;
        }
      }
    }

    // Find most common divisor (2 or 4 are most common)
    let maxCount = 0;
    for (const [s, count] of Object.entries(counts)) {
      const sNum = parseInt(s, 10);
      if (count > maxCount || (count === maxCount && (sNum === 2 || sNum === 4))) {
        maxCount = count;
        size = sNum;
      }
    }
  }

  return { type, size: type === 'Tabs' ? 1 : size };
}

/**
 * Update metadata based on file content and path
 */
export function updateMetadataFromFile(filePath: string, content: string): void {
  const language = detectLanguage(filePath);
  const eol = detectEOL(content);
  const indent = detectIndent(content);

  setFileMetadata({
    language,
    eol,
    indentType: indent.type,
    indentSize: indent.size,
    encoding: 'UTF-8', // Default for web
  });
}
