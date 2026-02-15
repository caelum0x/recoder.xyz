/**
 * AI Context Manager Service
 * Manages which files are included in AI context with smart detection
 *
 * Features:
 * - Auto-detect relevant files based on current file
 * - Smart context selection (imports, related files)
 * - Context token budget management
 * - Preview context before sending
 */

import {
  type AIContextFile,
  type AIContextSettings,
  type ContextPreview,
  aiContextSettingsStore,
  selectedFilesStore,
  autoDetectedFilesStore,
  activeFileStore,
  autoDetectLoading,
  autoDetectError,
  setAutoDetectedFiles,
  clearAutoDetectedFiles,
  getAllContextFiles,
  getTotalTokens,
} from '~/lib/stores/ai-context';
import {
  extractImports,
  detectLanguage,
  resolveImportPath,
  findRelatedFiles,
  loadProjectContext,
  type FileContext,
  type ProjectContext,
} from './code-context';
import { dockerReadFile, DOCKER_URL, getSessionToken } from './docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AIContextManager');

// Simple token estimation (~4 chars per token)
function estimateTokens(content: string): number {
  if (!content) return 0;
  return Math.ceil(content.length / 4);
}

/**
 * Check if a file path matches any of the given patterns
 */
function matchesPattern(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple pattern matching (supports * wildcard)
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(path)) return true;
    } else if (path.includes(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate priority score for a file
 */
function calculatePriority(
  path: string,
  priorityPatterns: string[],
  source: AIContextFile['source']
): number {
  let score = 0;

  // Manual selections get highest base priority
  if (source === 'manual') score += 100;

  // Priority patterns get bonus
  if (matchesPattern(path, priorityPatterns)) {
    score += 50;
  }

  // Entry points and main files
  if (path.includes('index.') || path.includes('main.') || path.includes('App.')) {
    score += 30;
  }

  // Types and configs are useful
  if (path.includes('types') || path.endsWith('.d.ts')) {
    score += 20;
  }
  if (path.endsWith('.json') && (path.includes('config') || path === 'package.json')) {
    score += 25;
  }

  // Imports from active file get priority
  if (source === 'auto-import') score += 40;
  if (source === 'auto-importedBy') score += 30;

  // Tests and configs lower priority than actual code
  if (source === 'auto-test') score += 10;
  if (source === 'auto-config') score += 15;

  return score;
}

/**
 * Create an AIContextFile from path and content
 */
function createContextFile(
  path: string,
  content: string,
  source: AIContextFile['source'],
  settings: AIContextSettings
): AIContextFile {
  const name = path.split('/').pop() || path;
  const extension = name.includes('.') ? name.split('.').pop() || '' : '';

  return {
    path,
    name,
    extension,
    content,
    tokenEstimate: estimateTokens(content),
    source,
    priority: calculatePriority(path, settings.priorityPatterns, source),
    included: true,
  };
}

/**
 * Fetch file content from Docker container
 */
async function fetchFileContent(projectId: string, path: string): Promise<string | null> {
  try {
    const content = await dockerReadFile(projectId, path, { timeout: 10000 });
    return content;
  } catch (error) {
    logger.warn(`[AIContextManager] Failed to read file ${path}:`, error);
    return null;
  }
}

/**
 * Get file list from Docker container
 */
async function getFileList(projectId: string): Promise<Array<{ path: string; type: string }>> {
  try {
    const response = await fetch(`${DOCKER_URL}/api/files/${projectId}`, {
      headers: {
        'Authorization': `Bearer ${getSessionToken() || ''}`,
      },
    });

    if (!response.ok) return [];

    const data = await response.json() as { files: Array<{ path: string; type: string; name: string }> };
    return data.files || [];
  } catch (error) {
    logger.warn('[AIContextManager] Failed to get file list:', error);
    return [];
  }
}

/**
 * Auto-detect related files based on current file and settings
 */
export async function autoDetectContextFiles(
  projectId: string,
  activeFilePath: string | null
): Promise<AIContextFile[]> {
  const settings = aiContextSettingsStore.get();

  if (!settings.autoContextEnabled || !activeFilePath) {
    return [];
  }

  autoDetectLoading.set(true);
  autoDetectError.set(null);

  try {
    const detectedFiles: AIContextFile[] = [];
    const addedPaths = new Set<string>();

    // Get file list
    const fileList = await getFileList(projectId);
    const filePaths = fileList
      .filter(f => f.type === 'file')
      .map(f => f.path);

    // Filter out excluded files
    const validPaths = filePaths.filter(
      path => !matchesPattern(path, settings.excludePatterns)
    );

    // Read active file content
    const activeContent = await fetchFileContent(projectId, activeFilePath);
    if (!activeContent) {
      autoDetectError.set('Failed to read active file');
      return [];
    }

    // Parse imports from active file
    const language = detectLanguage(activeFilePath);
    const imports = extractImports(activeContent, language);

    // Mode-specific detection
    switch (settings.autoContextMode) {
      case 'imports':
        // Only include direct imports
        if (settings.includeImports) {
          for (const imp of imports) {
            const resolvedPath = resolveImportPath(imp, activeFilePath);
            // Try to find the file with various extensions
            const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

            for (const ext of extensions) {
              const fullPath = resolvedPath + ext;
              if (validPaths.includes(fullPath) && !addedPaths.has(fullPath)) {
                const content = await fetchFileContent(projectId, fullPath);
                if (content) {
                  detectedFiles.push(createContextFile(
                    fullPath,
                    content,
                    'auto-import',
                    settings
                  ));
                  addedPaths.add(fullPath);
                }
                break;
              }
            }

            // Limit auto-detected files
            if (detectedFiles.length >= settings.maxAutoFiles) break;
          }
        }
        break;

      case 'related':
        // Include imports, importedBy, tests, and configs
        const context = await loadProjectContext(projectId);
        if (context) {
          const related = await findRelatedFiles(projectId, activeFilePath, context.files);

          // Add direct imports
          if (settings.includeImports) {
            for (const path of related.direct) {
              if (!addedPaths.has(path) && detectedFiles.length < settings.maxAutoFiles) {
                const content = await fetchFileContent(projectId, path);
                if (content) {
                  detectedFiles.push(createContextFile(path, content, 'auto-import', settings));
                  addedPaths.add(path);
                }
              }
            }
          }

          // Add files that import this file
          if (settings.includeImportedBy) {
            for (const path of related.indirect) {
              if (!addedPaths.has(path) && detectedFiles.length < settings.maxAutoFiles) {
                const content = await fetchFileContent(projectId, path);
                if (content) {
                  detectedFiles.push(createContextFile(path, content, 'auto-importedBy', settings));
                  addedPaths.add(path);
                }
              }
            }
          }

          // Add test files
          if (settings.includeTests) {
            for (const path of related.tests) {
              if (!addedPaths.has(path) && detectedFiles.length < settings.maxAutoFiles) {
                const content = await fetchFileContent(projectId, path);
                if (content) {
                  detectedFiles.push(createContextFile(path, content, 'auto-test', settings));
                  addedPaths.add(path);
                }
              }
            }
          }

          // Add config files
          if (settings.includeConfigs) {
            for (const path of related.configs.slice(0, 3)) {
              if (!addedPaths.has(path) && detectedFiles.length < settings.maxAutoFiles) {
                const content = await fetchFileContent(projectId, path);
                if (content) {
                  detectedFiles.push(createContextFile(path, content, 'auto-config', settings));
                  addedPaths.add(path);
                }
              }
            }
          }
        }
        break;

      case 'smart':
        // Intelligent selection based on file content analysis
        const projectContext = await loadProjectContext(projectId);
        if (projectContext) {
          // Score all files based on relevance
          const scoredFiles: Array<{ path: string; score: number; source: AIContextFile['source'] }> = [];

          for (const [path, fileContext] of projectContext.files) {
            if (path === activeFilePath || addedPaths.has(path)) continue;
            if (matchesPattern(path, settings.excludePatterns)) continue;

            let score = 0;
            let source: AIContextFile['source'] = 'auto-smart';

            // Direct imports get high score
            if (imports.some(imp => resolveImportPath(imp, activeFilePath).includes(path.replace(/\.[^.]+$/, '')))) {
              score += 50;
              source = 'auto-import';
            }

            // Files that import the active file
            if (fileContext.imports.some(imp => {
              const resolved = resolveImportPath(imp, path);
              return activeFilePath.includes(resolved) || resolved.includes(activeFilePath.replace(/\.[^.]+$/, ''));
            })) {
              score += 30;
              if (source === 'auto-smart') source = 'auto-importedBy';
            }

            // Type files related to the active file
            if (path.includes('types') || path.endsWith('.d.ts')) {
              const baseName = activeFilePath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
              if (path.includes(baseName)) {
                score += 40;
                source = 'auto-type';
              } else {
                score += 10;
              }
            }

            // Config files
            if (path.includes('config') || path === 'package.json' || path === 'tsconfig.json') {
              score += 15;
              source = 'auto-config';
            }

            // Test files for the active file
            const baseName = activeFilePath.replace(/\.[^.]+$/, '');
            if ((path.includes('.test.') || path.includes('.spec.')) && path.includes(baseName.split('/').pop() || '')) {
              score += 25;
              source = 'auto-test';
            }

            // Priority patterns
            if (matchesPattern(path, settings.priorityPatterns)) {
              score += 20;
            }

            if (score > 0) {
              scoredFiles.push({ path, score, source });
            }
          }

          // Sort by score and take top files
          scoredFiles.sort((a, b) => b.score - a.score);

          for (const { path, source } of scoredFiles.slice(0, settings.maxAutoFiles)) {
            if (!addedPaths.has(path)) {
              const content = await fetchFileContent(projectId, path);
              if (content) {
                detectedFiles.push(createContextFile(path, content, source, settings));
                addedPaths.add(path);
              }
            }
          }
        }
        break;

      case 'off':
      default:
        // No auto-detection
        break;
    }

    // Add type definition files if enabled
    if (settings.includeTypes && detectedFiles.length < settings.maxAutoFiles) {
      for (const path of validPaths) {
        if ((path.includes('types') || path.endsWith('.d.ts')) && !addedPaths.has(path)) {
          const content = await fetchFileContent(projectId, path);
          if (content) {
            detectedFiles.push(createContextFile(path, content, 'auto-type', settings));
            addedPaths.add(path);

            if (detectedFiles.length >= settings.maxAutoFiles) break;
          }
        }
      }
    }

    setAutoDetectedFiles(detectedFiles);
    return detectedFiles;
  } catch (error) {
    logger.error('[AIContextManager] Auto-detection error:', error);
    autoDetectError.set(error instanceof Error ? error.message : 'Auto-detection failed');
    return [];
  } finally {
    autoDetectLoading.set(false);
  }
}

/**
 * Generate context preview
 */
export function generateContextPreview(): ContextPreview {
  const settings = aiContextSettingsStore.get();
  const allFiles = getAllContextFiles();
  const totalTokens = getTotalTokens();
  const budgetExceeded = totalTokens > settings.tokenBudget;

  // Calculate which files to exclude if over budget
  const includedFiles: AIContextFile[] = [];
  const excludedFiles: string[] = [];
  let runningTotal = 0;

  // Files are already sorted by priority
  for (const file of allFiles) {
    if (runningTotal + file.tokenEstimate <= settings.tokenBudget) {
      includedFiles.push(file);
      runningTotal += file.tokenEstimate;
    } else {
      excludedFiles.push(file.path);
    }
  }

  // Calculate breakdown by source
  const breakdown = {
    manual: 0,
    autoImport: 0,
    autoImportedBy: 0,
    autoTest: 0,
    autoConfig: 0,
    autoType: 0,
    autoSmart: 0,
  };

  for (const file of includedFiles) {
    switch (file.source) {
      case 'manual':
        breakdown.manual++;
        break;
      case 'auto-import':
        breakdown.autoImport++;
        break;
      case 'auto-importedBy':
        breakdown.autoImportedBy++;
        break;
      case 'auto-test':
        breakdown.autoTest++;
        break;
      case 'auto-config':
        breakdown.autoConfig++;
        break;
      case 'auto-type':
        breakdown.autoType++;
        break;
      case 'auto-smart':
        breakdown.autoSmart++;
        break;
    }
  }

  // Generate preview text
  const previewLines: string[] = [
    '--- AI CONTEXT FILES ---',
    `Files: ${includedFiles.length} | Tokens: ~${runningTotal.toLocaleString()}`,
    '',
  ];

  for (const file of includedFiles) {
    previewLines.push(`### ${file.path}`);
    previewLines.push(`[${file.source}] ~${file.tokenEstimate.toLocaleString()} tokens`);
    previewLines.push('```' + file.extension);
    if (file.content) {
      // Show first 500 chars for preview
      const preview = file.content.length > 500
        ? file.content.substring(0, 500) + '\n... (truncated)'
        : file.content;
      previewLines.push(preview);
    }
    previewLines.push('```');
    previewLines.push('');
  }

  if (excludedFiles.length > 0) {
    previewLines.push('--- EXCLUDED (over budget) ---');
    for (const path of excludedFiles) {
      previewLines.push(`- ${path}`);
    }
  }

  previewLines.push('--- END CONTEXT ---');

  return {
    files: includedFiles,
    totalTokens: runningTotal,
    budgetExceeded,
    excludedFiles,
    previewText: previewLines.join('\n'),
    breakdown,
  };
}

/**
 * Format context for AI prompt
 */
export function formatContextForPrompt(): string {
  const preview = generateContextPreview();

  if (preview.files.length === 0) {
    return '';
  }

  const lines: string[] = [
    '\n\n--- CONTEXT FILES ---',
    'The following files are provided for context:',
    '',
  ];

  for (const file of preview.files) {
    lines.push(`### ${file.path}`);
    lines.push('```' + file.extension);
    lines.push(file.content || '');
    lines.push('```');
    lines.push('');
  }

  lines.push('--- END CONTEXT FILES ---\n');

  return lines.join('\n');
}

/**
 * Refresh auto-detected files based on current active file
 */
export async function refreshAutoContext(projectId: string): Promise<void> {
  const activeFile = activeFileStore.get();
  if (activeFile) {
    await autoDetectContextFiles(projectId, activeFile);
  }
}

/**
 * Clear all context (manual and auto)
 */
export function clearAllContext(): void {
  selectedFilesStore.set({});
  clearAutoDetectedFiles();
}

/**
 * Get files within token budget, sorted by priority
 */
export function getFilesWithinBudget(): AIContextFile[] {
  const settings = aiContextSettingsStore.get();
  const allFiles = getAllContextFiles();

  const result: AIContextFile[] = [];
  let runningTotal = 0;

  for (const file of allFiles) {
    if (runningTotal + file.tokenEstimate <= settings.tokenBudget) {
      result.push(file);
      runningTotal += file.tokenEstimate;
    }
  }

  return result;
}

/**
 * Estimate tokens for adding a file
 */
export async function estimateFileTokens(
  projectId: string,
  path: string
): Promise<number> {
  const content = await fetchFileContent(projectId, path);
  return content ? estimateTokens(content) : 0;
}

/**
 * Check if a file can be added within budget
 */
export async function canAddFileWithinBudget(
  projectId: string,
  path: string
): Promise<{ canAdd: boolean; tokens: number; remaining: number }> {
  const settings = aiContextSettingsStore.get();
  const currentTotal = getTotalTokens();
  const fileTokens = await estimateFileTokens(projectId, path);
  const remaining = settings.tokenBudget - currentTotal;

  return {
    canAdd: fileTokens <= remaining,
    tokens: fileTokens,
    remaining,
  };
}

/**
 * Suggest files based on user message
 */
export async function suggestFilesForMessage(
  projectId: string,
  message: string
): Promise<string[]> {
  const suggestions: string[] = [];

  try {
    const context = await loadProjectContext(projectId);
    if (!context) return suggestions;

    const lowerMessage = message.toLowerCase();

    // Look for file references in the message
    const filePatterns = [
      /(?:in|from|file|edit|modify|update|change|fix)\s+["'`]?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)["'`]?/gi,
      /["'`]([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|py|css|html))["'`]/gi,
    ];

    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const ref = match[1];
        for (const [path] of context.files) {
          if (path.includes(ref) && !suggestions.includes(path)) {
            suggestions.push(path);
          }
        }
      }
    }

    // Suggest based on keywords
    if (lowerMessage.includes('component')) {
      for (const [path] of context.files) {
        if (path.includes('components/') && !suggestions.includes(path)) {
          suggestions.push(path);
          if (suggestions.length >= 5) break;
        }
      }
    }

    if (lowerMessage.includes('style') || lowerMessage.includes('css')) {
      for (const [path] of context.files) {
        if ((path.endsWith('.css') || path.endsWith('.scss') || path.includes('style')) &&
            !suggestions.includes(path)) {
          suggestions.push(path);
          if (suggestions.length >= 5) break;
        }
      }
    }

    if (lowerMessage.includes('api') || lowerMessage.includes('route')) {
      for (const [path] of context.files) {
        if ((path.includes('api/') || path.includes('routes/')) && !suggestions.includes(path)) {
          suggestions.push(path);
          if (suggestions.length >= 5) break;
        }
      }
    }

    if (lowerMessage.includes('hook')) {
      for (const [path] of context.files) {
        if ((path.includes('hooks/') || path.includes('use')) && !suggestions.includes(path)) {
          suggestions.push(path);
          if (suggestions.length >= 5) break;
        }
      }
    }

  } catch (error) {
    logger.warn('[AIContextManager] Failed to suggest files:', error);
  }

  return suggestions.slice(0, 10);
}
