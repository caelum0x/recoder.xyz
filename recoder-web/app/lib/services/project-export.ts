/**
 * Project Export Service
 * Exports project files as ZIP with filtering, sanitization, and README generation
 * Inspired by December's export service
 */

import JSZip from 'jszip';
import {
  exportProgress,
  exportOptions,
  type ExportOptions,
  type ExportHistoryEntry,
  addExportHistoryEntry,
  updateFileProgress,
  setExportStatus,
  resetExportProgress,
  completeExport,
  setExportError,
  startExport,
  DEFAULT_EXCLUDE_PATTERNS,
} from '~/lib/stores/export';
import { dockerReadFileTree, dockerGet, dockerFetch, DOCKER_URL, getSessionToken } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectExport');

// ==================== TYPES ====================

export interface FileEntry {
  path: string;
  content: string;
  type: 'file';
}

export interface DirectoryEntry {
  path: string;
  type: 'directory';
}

export type TreeEntry = FileEntry | DirectoryEntry;

export interface ExportResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  fileCount?: number;
  sizeBytes?: number;
  durationMs?: number;
  error?: string;
}

export interface ProjectInfo {
  name: string;
  description?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

// ==================== PATTERN MATCHING ====================

/**
 * Convert glob pattern to regex
 * Supports: *, **, ?, [abc], [!abc]
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = pattern
    // Escape special regex chars except glob chars
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Convert ** to match any path segment
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    // Convert * to match any chars except /
    .replace(/\*/g, '[^/]*')
    // Restore ** as any chars including /
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
    // Convert ? to match single char
    .replace(/\?/g, '.');

  // Handle [!...] negation in character classes
  regexStr = regexStr.replace(/\[!/g, '[^');

  return new RegExp(`^${regexStr}$`);
}

/**
 * Check if a file path matches a glob pattern
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Normalize path (remove leading /)
  const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

  // Handle directory patterns (ending with /)
  const isDirectoryPattern = pattern.endsWith('/');
  const normalizedPattern = isDirectoryPattern ? pattern.slice(0, -1) : pattern;

  const regex = globToRegex(normalizedPattern);

  // For directory patterns, also match files within the directory
  if (isDirectoryPattern) {
    return regex.test(normalizedPath) || normalizedPath.startsWith(normalizedPattern + '/');
  }

  return regex.test(normalizedPath);
}

/**
 * Check if file should be included based on include/exclude patterns
 */
export function shouldIncludeFile(
  filePath: string,
  includePatterns: string[],
  excludePatterns: string[]
): boolean {
  // Normalize path
  const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

  // Check exclude patterns first (they take precedence)
  for (const pattern of excludePatterns) {
    if (matchesPattern(normalizedPath, pattern)) {
      return false;
    }
  }

  // Check include patterns
  for (const pattern of includePatterns) {
    if (matchesPattern(normalizedPath, pattern)) {
      return true;
    }
  }

  // Default to include if no patterns match (when include patterns is ['**/*'])
  return includePatterns.includes('**/*');
}

// ==================== ENV SANITIZATION ====================

/**
 * Sanitize .env content to create .env.example
 * Preserves keys but removes sensitive values
 */
export function sanitizeEnvFile(content: string): string {
  const lines = content.split('\n');
  const sanitizedLines = lines.map((line) => {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      return line;
    }

    // Parse key=value
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      return line;
    }

    const key = line.substring(0, equalIndex).trim();
    const value = line.substring(equalIndex + 1).trim();

    // Generate placeholder based on key name
    let placeholder = '';

    if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
      placeholder = 'your_secret_key_here';
    } else if (key.toLowerCase().includes('url') || key.toLowerCase().includes('host')) {
      placeholder = 'https://example.com';
    } else if (key.toLowerCase().includes('port')) {
      placeholder = '3000';
    } else if (key.toLowerCase().includes('database') || key.toLowerCase().includes('db')) {
      placeholder = 'your_database_connection_string';
    } else if (key.toLowerCase().includes('token')) {
      placeholder = 'your_token_here';
    } else if (key.toLowerCase().includes('password') || key.toLowerCase().includes('pwd')) {
      placeholder = 'your_password_here';
    } else if (key.toLowerCase().includes('email')) {
      placeholder = 'your@email.com';
    } else if (key.toLowerCase().includes('user')) {
      placeholder = 'your_username';
    } else if (value === 'true' || value === 'false') {
      placeholder = value; // Keep boolean values
    } else if (!isNaN(Number(value))) {
      placeholder = value; // Keep numeric values
    } else {
      placeholder = 'your_value_here';
    }

    return `${key}=${placeholder}`;
  });

  return sanitizedLines.join('\n');
}

// ==================== README GENERATION ====================

/**
 * Generate README.md for exported project
 */
export function generateReadme(projectInfo: ProjectInfo, exportedFiles: string[]): string {
  const { name, description, version, dependencies, devDependencies, scripts } = projectInfo;

  let readme = `# ${name}\n\n`;

  if (description) {
    readme += `${description}\n\n`;
  }

  if (version) {
    readme += `**Version:** ${version}\n\n`;
  }

  readme += `## Getting Started\n\n`;
  readme += `1. Install dependencies:\n`;
  readme += `   \`\`\`bash\n   npm install\n   # or\n   pnpm install\n   # or\n   yarn install\n   \`\`\`\n\n`;

  if (scripts && Object.keys(scripts).length > 0) {
    readme += `2. Available scripts:\n`;

    // Prioritize common scripts
    const priorityScripts = ['dev', 'start', 'build', 'test', 'lint'];
    const orderedScripts = Object.entries(scripts).sort(([a], [b]) => {
      const aIndex = priorityScripts.indexOf(a);
      const bIndex = priorityScripts.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });

    for (const [scriptName, scriptCmd] of orderedScripts.slice(0, 8)) {
      readme += `   - \`npm run ${scriptName}\` - ${scriptCmd}\n`;
    }
    readme += '\n';
  }

  readme += `## Project Structure\n\n`;
  readme += `\`\`\`\n`;

  // Generate simple tree structure (top-level files and first-level directories)
  const dirs = new Set<string>();
  const topLevelFiles: string[] = [];

  for (const file of exportedFiles) {
    const parts = file.split('/').filter(Boolean);
    if (parts.length === 1) {
      topLevelFiles.push(parts[0]);
    } else if (parts.length > 1) {
      dirs.add(parts[0] + '/');
    }
  }

  // Sort and display directories first, then files
  const sortedDirs = Array.from(dirs).sort();
  const sortedFiles = topLevelFiles.sort();

  for (const dir of sortedDirs) {
    readme += `${dir}\n`;
  }
  for (const file of sortedFiles) {
    readme += `${file}\n`;
  }

  readme += `\`\`\`\n\n`;

  if (dependencies && Object.keys(dependencies).length > 0) {
    readme += `## Dependencies\n\n`;
    const depList = Object.entries(dependencies).slice(0, 10);
    for (const [dep, ver] of depList) {
      readme += `- ${dep}: ${ver}\n`;
    }
    if (Object.keys(dependencies).length > 10) {
      readme += `- ... and ${Object.keys(dependencies).length - 10} more\n`;
    }
    readme += '\n';
  }

  readme += `---\n\n`;
  readme += `*Exported from [Recoder](https://recoder.xyz) on ${new Date().toISOString().split('T')[0]}*\n`;

  return readme;
}

// ==================== MAIN EXPORT FUNCTION ====================

/**
 * Export project files as ZIP
 * Reads files from Docker container and creates ZIP with filtering
 */
export async function exportProject(
  projectId: string,
  options: Partial<ExportOptions> = {}
): Promise<ExportResult> {
  const startTime = Date.now();
  const opts: ExportOptions = { ...exportOptions.get(), ...options };

  logger.debug('Starting export for project:', projectId);
  logger.debug('Export options:', opts);

  try {
    // Phase 1: Preparing
    setExportStatus('preparing');

    // Get file tree from Docker container using the optimized export endpoint
    let allFiles: FileEntry[] = [];
    let allDirectories: DirectoryEntry[] = [];

    try {
      // Build exclude query parameter
      const excludeQuery = opts.excludePatterns
        .filter(p => !p.includes('*')) // Simple patterns only for server-side
        .map(p => p.replace('/**', ''))
        .join(',');

      // Use the optimized export endpoint
      const exportResult = await dockerFetch<{
        success: boolean;
        files: Array<{ path: string; content: string; type: 'file' }>;
        directories: Array<{ path: string; type: 'directory' }>;
        failed: Array<{ path: string; error: string }>;
        stats: { totalFiles: number; failedFiles: number; durationMs: number };
      }>(`/api/export/${projectId}?exclude=${encodeURIComponent(excludeQuery)}`, {
        timeout: 60000, // 60 second timeout for large projects
      });

      if (exportResult.success) {
        allFiles = exportResult.files;
        allDirectories = exportResult.directories || [];
        logger.debug(`Export endpoint returned ${allFiles.length} files in ${exportResult.stats?.durationMs}ms`);
      } else {
        throw new Error('Export endpoint failed');
      }
    } catch (error) {
      // Fallback: Use the batch read approach
      logger.warn('Export endpoint failed, falling back to batch read');

      try {
        const treeResult = await dockerReadFileTree(projectId, {
          concurrency: 30,
          filter: (path) => {
            // Quick filter to skip obvious excludes during read
            const quickExcludes = ['node_modules/', '.git/', '.next/', 'dist/', 'build/'];
            return !quickExcludes.some(exclude => path.includes(exclude));
          },
          onProgress: (loaded, total) => {
            updateFileProgress(`Reading files: ${loaded}/${total}`, 0);
          },
        });

        allFiles = treeResult.files;
        allDirectories = treeResult.directories;

        logger.debug(`Batch read ${allFiles.length} files, ${allDirectories.length} directories`);
      } catch (fallbackError) {
        logger.error('Both export methods failed:', fallbackError);
        throw new Error('Failed to read project files from container');
      }
    }

    // Phase 2: Filter files based on patterns
    setExportStatus('reading');

    let filesToExport: FileEntry[] = [];

    // If selective export (specific files selected)
    if (opts.selectedFiles.length > 0) {
      filesToExport = allFiles.filter((f) => opts.selectedFiles.includes(f.path));
    } else {
      // Apply include/exclude patterns
      filesToExport = allFiles.filter((f) =>
        shouldIncludeFile(f.path, opts.includePatterns, opts.excludePatterns)
      );
    }

    if (filesToExport.length === 0) {
      throw new Error('No files to export after applying filters');
    }

    // Estimate total size
    const estimatedBytes = filesToExport.reduce(
      (sum, f) => sum + (f.content?.length || 0),
      0
    );

    startExport(filesToExport.length, estimatedBytes);

    // Phase 3: Create ZIP
    setExportStatus('compressing');
    const zip = new JSZip();

    // Try to get project info from package.json
    let projectInfo: ProjectInfo = {
      name: opts.projectName,
    };

    const packageJsonFile = allFiles.find(
      (f) => f.path === '/package.json' || f.path === 'package.json'
    );
    if (packageJsonFile?.content) {
      try {
        const pkg = JSON.parse(packageJsonFile.content);
        projectInfo = {
          name: pkg.name || opts.projectName,
          description: pkg.description,
          version: pkg.version,
          dependencies: pkg.dependencies,
          devDependencies: pkg.devDependencies,
          scripts: pkg.scripts,
        };
      } catch (e) {
        logger.warn('Failed to parse package.json:', e);
      }
    }

    // Add files to ZIP
    const exportedPaths: string[] = [];
    let processedBytes = 0;

    for (const file of filesToExport) {
      const cleanPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;

      // Add to ZIP
      if (opts.preserveStructure) {
        zip.file(cleanPath, file.content || '');
      } else {
        // Flatten structure (just filename)
        const filename = cleanPath.split('/').pop() || cleanPath;
        zip.file(filename, file.content || '');
      }

      exportedPaths.push(cleanPath);
      processedBytes += (file.content?.length || 0);

      updateFileProgress(cleanPath, file.content?.length || 0);
    }

    // Add .env.example if requested and .env exists
    if (opts.includeEnvExample) {
      const envFile = allFiles.find(
        (f) => f.path === '/.env' || f.path === '.env' || f.path === '/.env.local' || f.path === '.env.local'
      );
      if (envFile?.content) {
        const sanitizedEnv = sanitizeEnvFile(envFile.content);
        zip.file('.env.example', sanitizedEnv);
        exportedPaths.push('.env.example');
      }
    }

    // Add README if requested
    if (opts.includeReadme) {
      // Check if README already exists
      const hasReadme = filesToExport.some(
        (f) =>
          f.path.toLowerCase().includes('readme.md') ||
          f.path.toLowerCase().includes('readme.txt')
      );

      if (!hasReadme) {
        const readmeContent = generateReadme(projectInfo, exportedPaths);
        zip.file('README.md', readmeContent);
        exportedPaths.push('README.md');
      }
    }

    // Phase 4: Generate ZIP blob
    setExportStatus('compressing');
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Phase 5: Complete
    completeExport();

    const durationMs = Date.now() - startTime;
    const filename = `${opts.projectName}.zip`;

    // Add to history
    const historyEntry: ExportHistoryEntry = {
      id: `export-${Date.now()}`,
      projectId,
      projectName: opts.projectName,
      timestamp: Date.now(),
      fileCount: exportedPaths.length,
      sizeBytes: zipBlob.size,
      format: 'zip',
      durationMs,
      options: opts,
    };
    addExportHistoryEntry(historyEntry);

    logger.debug(`Export complete: ${exportedPaths.length} files, ${zipBlob.size} bytes, ${durationMs}ms`);

    return {
      success: true,
      blob: zipBlob,
      filename,
      fileCount: exportedPaths.length,
      sizeBytes: zipBlob.size,
      durationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Export failed';
    logger.error('Export failed:', error);
    setExportError(errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Export from in-memory files (from workbench store)
 * Used when Docker read fails or for quick exports
 */
export async function exportFromMemory(
  files: Record<string, { type: string; content?: string }>,
  options: Partial<ExportOptions> = {}
): Promise<ExportResult> {
  const startTime = Date.now();
  const opts: ExportOptions = { ...exportOptions.get(), ...options };

  logger.debug('Exporting from memory, files:', Object.keys(files).length);

  try {
    setExportStatus('preparing');

    // Convert to FileEntry format
    const allFiles: FileEntry[] = Object.entries(files)
      .filter(([_, file]) => file.type === 'file' && 'content' in file)
      .map(([path, file]) => ({
        path,
        content: (file as any).content || '',
        type: 'file' as const,
      }));

    if (allFiles.length === 0) {
      throw new Error('No files to export');
    }

    // Filter files
    let filesToExport: FileEntry[];

    if (opts.selectedFiles.length > 0) {
      filesToExport = allFiles.filter((f) => opts.selectedFiles.includes(f.path));
    } else {
      filesToExport = allFiles.filter((f) =>
        shouldIncludeFile(f.path, opts.includePatterns, opts.excludePatterns)
      );
    }

    if (filesToExport.length === 0) {
      throw new Error('No files to export after applying filters');
    }

    const estimatedBytes = filesToExport.reduce(
      (sum, f) => sum + (f.content?.length || 0),
      0
    );

    startExport(filesToExport.length, estimatedBytes);
    setExportStatus('compressing');

    // Create ZIP
    const zip = new JSZip();
    const exportedPaths: string[] = [];

    // Get project info
    let projectInfo: ProjectInfo = { name: opts.projectName };
    const packageJsonFile = allFiles.find(
      (f) => f.path === '/package.json' || f.path === 'package.json'
    );
    if (packageJsonFile?.content) {
      try {
        const pkg = JSON.parse(packageJsonFile.content);
        projectInfo = {
          name: pkg.name || opts.projectName,
          description: pkg.description,
          version: pkg.version,
          dependencies: pkg.dependencies,
          devDependencies: pkg.devDependencies,
          scripts: pkg.scripts,
        };
      } catch (e) {
        logger.warn('Failed to parse package.json:', e);
      }
    }

    // Add files
    for (const file of filesToExport) {
      const cleanPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;

      if (opts.preserveStructure) {
        zip.file(cleanPath, file.content || '');
      } else {
        const filename = cleanPath.split('/').pop() || cleanPath;
        zip.file(filename, file.content || '');
      }

      exportedPaths.push(cleanPath);
      updateFileProgress(cleanPath, file.content?.length || 0);
    }

    // Add .env.example
    if (opts.includeEnvExample) {
      const envFile = allFiles.find(
        (f) => f.path === '/.env' || f.path === '.env'
      );
      if (envFile?.content) {
        zip.file('.env.example', sanitizeEnvFile(envFile.content));
        exportedPaths.push('.env.example');
      }
    }

    // Add README
    if (opts.includeReadme) {
      const hasReadme = filesToExport.some(
        (f) => f.path.toLowerCase().includes('readme')
      );
      if (!hasReadme) {
        zip.file('README.md', generateReadme(projectInfo, exportedPaths));
        exportedPaths.push('README.md');
      }
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    completeExport();

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      blob: zipBlob,
      filename: `${opts.projectName}.zip`,
      fileCount: exportedPaths.length,
      sizeBytes: zipBlob.size,
      durationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Export failed';
    setExportError(errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Download the export result
 * Triggers browser download
 */
export function downloadExportResult(result: ExportResult): void {
  if (!result.success || !result.blob || !result.filename) {
    logger.error('Cannot download: invalid export result');
    return;
  }

  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  logger.debug('Download triggered:', result.filename);
}

/**
 * Quick export - exports with default options and triggers download
 */
export async function quickExport(
  projectId: string,
  projectName?: string
): Promise<ExportResult> {
  const result = await exportProject(projectId, {
    projectName: projectName || 'recoder-project',
  });

  if (result.success) {
    downloadExportResult(result);
  }

  return result;
}

/**
 * Quick export from memory files
 */
export async function quickExportFromMemory(
  files: Record<string, { type: string; content?: string }>,
  projectName?: string
): Promise<ExportResult> {
  const result = await exportFromMemory(files, {
    projectName: projectName || 'recoder-project',
  });

  if (result.success) {
    downloadExportResult(result);
  }

  return result;
}
