/**
 * Enterprise tools actions - extracted from action-runner.ts
 * Handles str_replace, multi_apply_diff, web_search, web_fetch, memory_operation,
 * glob_search, ripgrep_search, edit_file, and read_many_files actions.
 */

import { createScopedLogger } from '~/utils/logger';
import type { ActionState } from '../action-runner';
import { unreachable } from '~/utils/unreachable';
import { dockerExec, waitForFile } from './docker-operations';

const logger = createScopedLogger('EnterpriseTools');

// Response type for enterprise tools API
export interface EnterpriseToolsResponse {
  success?: boolean;
  message?: string;
  content?: string;
  lineCount?: number;
  truncated?: boolean;
  isBinary?: boolean;
  suggestions?: string;
  output?: string;
  data?: any;
  results?: Array<{ file: string; line: number; content: string; title?: string; snippet?: string }>;
  files?: Array<string | { path: string; content?: string; error?: string }>;
  matches?: Array<{ file: string; line: number; content: string }>;
  items?: Array<{ key: string; value: string }>;
  value?: string;
  error?: string;
  diff?: string;
  commitHash?: string;
  appliedCount?: number;
  totalCount?: number;
  workflow?: {
    mode?: string;
    summary?: string;
    lanes?: Array<{ laneId: string; title: string }>;
    nextActions?: string[];
  };
  source?: 'docker-backend' | 'local-fallback';
  fallbackReason?: string;
  backend?: {
    endpoint?: string;
    contract?: string;
    responseContract?: string | null;
    contractStatus?: 'match' | 'mismatch' | 'missing';
    strictContract?: boolean;
    authMode?: string;
    authSource?: string;
    attempts?: number;
    maxAttempts?: number;
    warnings?: string[];
  };
}

/**
 * Context for enterprise tools that need Docker access
 */
export interface EnterpriseToolsContext {
  projectId: string;
  ensureDockerReady: () => Promise<boolean>;
}

/**
 * Run a str_replace action - search and replace text in a file
 */
export async function runStrReplaceAction(
  action: ActionState,
  ctx: EnterpriseToolsContext
): Promise<void> {
  if (action.type !== 'str_replace') {
    unreachable('Expected str_replace action');
  }

  logger.info(`Replacing text in: ${action.filePath}`);

  try {
    await ctx.ensureDockerReady();

    // 🔒 FIX 0C: Wait for file to exist (may be created by preceding action)
    const filePath = action.filePath?.startsWith('/') ? action.filePath : `/workspace/${action.filePath}`;
    const fileExists = await waitForFile(ctx.projectId, action.filePath || '', 5000);

    if (!fileExists) {
      // 🚨 CRITICAL FIX: Return error instructing AI to use type="file" for new files
      const errorMessage = `ERROR: File "${action.filePath}" does not exist. Cannot use str_replace on a non-existent file.

To create a NEW file, use:
<recoderAction type="file" filePath="${action.filePath}">
[file contents here]
</recoderAction>

str_replace is ONLY for modifying EXISTING files.`;

      logger.error(`str_replace attempted on non-existent file: ${action.filePath}`);
      action.content = errorMessage;
      // Throw error - action-runner.ts will mark action as 'failed'
      throw new Error(errorMessage);
    } else {
      logger.debug(`File ${action.filePath} exists, proceeding with str_replace`);
    }

    // Call enterprise tools API for search-replace
    const replaceResponse = await fetch('/api/enterprise-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'searchReplace',
        params: {
          file_path: action.filePath,
          old_string: action.oldString,
          new_string: action.newString,
        }
      })
    });

    const result = await replaceResponse.json() as EnterpriseToolsResponse;

    if (result.success) {
      action.content = (result.message || '') + (result.diff ? `\n\nDiff:\n${result.diff}` : '');
      logger.info(`Successfully replaced text in ${action.filePath}`);

      // Enterprise enhancement: Auto-commit changes
      try {
        const commitResponse = await fetch('/api/enterprise-tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'autoCommit',
            params: {
              files: [action.filePath],
              workingDir: '/workspace'
            }
          })
        });
        const commitResult = await commitResponse.json() as EnterpriseToolsResponse;

        if (commitResult.success) {
          action.content += `\n\n✅ Auto-committed: ${commitResult.commitHash}`;
        }
      } catch (error) {
        logger.warn('Auto-commit failed:', error);
      }
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    logger.error(`String replacement failed:`, error);
    throw new Error(`Could not replace text in: ${action.filePath}`);
  }
}

/**
 * Run a multi_apply_diff action - apply multiple diffs atomically
 */
export async function runMultiApplyDiffAction(
  action: ActionState,
  ctx: EnterpriseToolsContext
): Promise<void> {
  if (action.type !== 'multi_apply_diff') {
    unreachable('Expected multi_apply_diff action');
  }

  const diffCount = action.diffs?.length || 0;
  logger.info(`Applying ${diffCount} atomic diffs`);

  try {
    await ctx.ensureDockerReady();

    // Call enterprise tools API for multi-file atomic diff
    const response = await fetch('/api/enterprise-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'multiApplyDiff',
        params: {
          diffs: action.diffs,
          workingDir: '/workspace',
          commitMessage: action.commitMessage
        }
      })
    });

    const result = await response.json() as EnterpriseToolsResponse & {
      results?: Array<{ status: string; filePath: string; diff?: string; error?: string }>;
    };

    if (result.success) {
      let summary = `✅ ${result.message}\n\n`;

      // Show per-file results
      if (result.results) {
        for (const fileResult of result.results) {
          if (fileResult.status === 'applied') {
            summary += `📝 ${fileResult.filePath}: Applied\n`;
            if (fileResult.diff) {
              summary += `\`\`\`diff\n${fileResult.diff.substring(0, 500)}${fileResult.diff.length > 500 ? '...' : ''}\n\`\`\`\n`;
            }
          } else if (fileResult.status === 'failed') {
            summary += `❌ ${fileResult.filePath}: ${fileResult.error}\n`;
          }
        }
      }

      action.content = summary;
      logger.info(`Multi-diff applied: ${result.appliedCount}/${result.totalCount} successful`);
    } else {
      throw new Error(result.message || 'Multi-diff failed');
    }
  } catch (error) {
    logger.error(`Multi-apply diff failed:`, error);
    throw error;
  }
}

/**
 * Run a web_search action
 */
export async function runWebSearchAction(action: ActionState): Promise<void> {
  if (action.type !== 'web_search') {
    unreachable('Expected web_search action');
  }

  logger.info(`Web searching: ${action.query}`);

  try {
    const response = await fetch('/api/enterprise-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'webSearch',
        params: {
          query: action.query,
          options: { maxResults: action.maxResults || 5 }
        }
      })
    });
    const result = await response.json() as EnterpriseToolsResponse;

    if (!result || !result.results || result.results.length === 0) {
      action.content = `Web search completed but no results found for "${action.query}"`;
      return;
    }

    action.content = `Web search results for "${action.query}":\n${result.results.map((r: any) => `• ${r.title}: ${r.snippet}`).join('\n')}`;
    logger.info(`Web search completed with ${result.results.length} results`);
  } catch (error) {
    logger.warn('Web search unavailable:', error);
    action.content = `Web search for "${action.query}" - Service temporarily unavailable. Try using webFetch with a specific URL instead.`;
  }
}

/**
 * Run a web_fetch action
 */
export async function runWebFetchAction(action: ActionState): Promise<void> {
  if (action.type !== 'web_fetch') {
    unreachable('Expected web_fetch action');
  }

  logger.info(`Fetching URL: ${action.url}`);

  try {
    const response = await fetch('/api/enterprise-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'webFetch',
        params: {
          url: action.url,
          options: { selector: action.selector }
        }
      })
    });
    const result = await response.json() as EnterpriseToolsResponse;

    if (!result || !result.content) {
      action.content = `Failed to fetch content from ${action.url}`;
      return;
    }

    action.content = `Content from ${action.url}:\n${result.content.substring(0, 5000)}${result.content.length > 5000 ? '\n\n[Content truncated - use selector to get specific sections]' : ''}`;
    logger.info(`URL fetch completed, ${result.content.length} chars`);
  } catch (error) {
    logger.warn('URL fetch unavailable:', error);
    action.content = `Failed to fetch ${action.url} - Service temporarily unavailable or URL inaccessible.`;
  }
}

/**
 * Run a memory_operation action
 */
export async function runMemoryAction(action: ActionState): Promise<void> {
  if (action.type !== 'memory_operation') {
    unreachable('Expected memory_operation action');
  }

  logger.info(`Memory operation: ${action.operation}`);

  try {
    const response = await fetch('/api/enterprise-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'memory',
        params: {
          operation: action.operation,
          data: { key: action.key, value: action.value }
        }
      })
    });
    const result = await response.json() as EnterpriseToolsResponse;

    if (action.operation === 'list') {
      action.content = `Stored memories:\n${result.items?.map((i: any) => `• ${i.key}: ${i.value}`).join('\n') || 'No memories stored yet'}`;
    } else if (action.operation === 'retrieve') {
      action.content = result.value ? `Retrieved: ${result.value}` : `No memory found for key: ${action.key}`;
    } else {
      action.content = `Memory stored: ${action.key}`;
    }

    logger.info(`Memory ${action.operation} completed`);
  } catch (error) {
    logger.warn('Memory operation unavailable:', error);
    action.content = `Memory ${action.operation} - Service temporarily unavailable. Memory will be available in next session.`;
  }
}

/**
 * Run a glob_search action
 */
export async function runGlobAction(action: ActionState): Promise<void> {
  if (action.type !== 'glob_search') {
    unreachable('Expected glob_search action');
  }

  logger.info(`Glob search: ${action.pattern}`);

  try {
    const response = await fetch('/api/enterprise-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'glob',
        params: {
          pattern: action.pattern,
          path: '/workspace',
          ignore: action.exclude
        }
      })
    });
    const result = await response.json() as EnterpriseToolsResponse;

    if (!result.success || !result.files || (Array.isArray(result.files) && result.files.length === 0)) {
      action.content = `No files found matching pattern "${action.pattern}"`;
      return;
    }

    const filesArray = Array.isArray(result.files) ? result.files : [];
    const fileList = filesArray.slice(0, 100).join('\n');
    const truncated = filesArray.length > 100 ? `\n\n[Showing 100 of ${filesArray.length} files]` : '';

    action.content = `Files matching "${action.pattern}":\n${fileList}${truncated}`;
    logger.info(`Glob search found ${filesArray.length} files`);
  } catch (error) {
    logger.warn('Glob search unavailable:', error);
    action.content = `Glob search for "${action.pattern}" - Using fallback to listFiles instead.`;
  }
}

/**
 * Run a ripgrep_search action
 */
export async function runRipGrepAction(
  action: ActionState,
  fallbackSearch?: (action: ActionState) => Promise<void>
): Promise<void> {
  if (action.type !== 'ripgrep_search') {
    unreachable('Expected ripgrep_search action');
  }

  logger.info(`RipGrep search: ${action.query}`);

  try {
    const response = await fetch('/api/enterprise-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'ripGrep',
        params: {
          pattern: action.query,
          path: '/workspace',
          caseSensitive: action.caseSensitive,
          maxResults: action.maxResults || 100
        }
      })
    });
    const result = await response.json() as EnterpriseToolsResponse;

    if (!result.success || !result.matches || result.matches.length === 0) {
      action.content = `No matches found for "${action.query}"${action.filePattern ? ` in ${action.filePattern}` : ''}`;
      return;
    }

    const matchLines = result.matches.slice(0, 50).map(
      (m: any) => `${m.file}:${m.line}: ${m.content}`
    );
    const truncated = result.matches.length > 50 ? `\n\n[Showing 50 of ${result.matches.length} matches]` : '';

    action.content = `RipGrep results for "${action.query}":\n${matchLines.join('\n')}${truncated}`;
    logger.info(`RipGrep found ${result.matches.length} matches`);
  } catch (error) {
    logger.warn('RipGrep unavailable, using fallback:', error);
    // Fallback to basic search
    if (fallbackSearch) {
      try {
        await fallbackSearch({ ...action, type: 'searchFiles' } as any);
      } catch {
        action.content = `Search for "${action.query}" - Service temporarily unavailable.`;
      }
    } else {
      action.content = `Search for "${action.query}" - Service temporarily unavailable.`;
    }
  }
}

/**
 * Run an edit_file action - line-based file editing
 */
export async function runEditFileAction(action: ActionState): Promise<void> {
  if (action.type !== 'edit_file') {
    unreachable('Expected edit_file action');
  }

  logger.info(`Editing file: ${action.filePath} at line ${action.lineNumber}`);

  try {
    // Validate line numbers
    if (action.lineNumber < 1) {
      action.content = `Invalid line number: ${action.lineNumber}. Line numbers start at 1.`;
      return;
    }

    if (action.endLineNumber && action.endLineNumber < action.lineNumber) {
      action.content = `Invalid range: end line (${action.endLineNumber}) must be >= start line (${action.lineNumber})`;
      return;
    }

    const response = await fetch('/api/enterprise-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'editFile',
        params: {
          filePath: action.filePath,
          edits: [{
            lineNumber: action.lineNumber,
            operation: action.operation,
            content: action.content,
            endLine: action.endLineNumber
          }],
          workingDir: '/workspace'
        }
      })
    });
    const result = await response.json() as EnterpriseToolsResponse;

    if (!result.success) {
      action.content = `File edit failed: ${result.error || 'Unknown error'}`;
      return;
    }

    action.content = `File edit completed. Modified ${action.filePath} at line ${action.lineNumber}`;
    logger.info(`File edit completed: ${action.operation} at line ${action.lineNumber}`);
  } catch (error) {
    logger.warn('EditFile unavailable, using strReplace:', error);
    action.content = `Line-based edit failed. Use strReplace for this change instead.`;
  }
}

/**
 * Run a read_many_files action - batch file reading
 */
export async function runReadManyFilesAction(action: ActionState): Promise<void> {
  if (action.type !== 'read_many_files') {
    unreachable('Expected read_many_files action');
  }

  logger.info(`Reading ${action.filePaths?.length || 0} files`);

  try {
    if (!action.filePaths || action.filePaths.length === 0) {
      action.content = 'No files specified to read';
      return;
    }

    if (action.filePaths.length > 20) {
      action.content = `Too many files requested (${action.filePaths.length}). Maximum is 20 files per batch. Use glob or listFiles to find files first.`;
      return;
    }

    const response = await fetch('/api/enterprise-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'readManyFiles',
        params: {
          paths: action.filePaths,
          workingDir: '/workspace',
          maxSize: (action as any).maxSizePerFile || 50000
        }
      })
    });
    const result = await response.json() as EnterpriseToolsResponse;

    if (!result.success || !result.files) {
      action.content = `Failed to read files: ${result.error || 'Unknown error'}`;
      return;
    }

    let output = '';
    for (const file of result.files as Array<{ path: string; content?: string; error?: string }>) {
      if (file.error) {
        output += `\n--- ${file.path} ---\n[Error: ${file.error}]\n`;
      } else {
        output += `\n--- ${file.path} ---\n${file.content}\n`;
      }
    }

    action.content = output;
    logger.info(`Read ${result.files.length} files`);
  } catch (error) {
    logger.warn('ReadManyFiles unavailable:', error);
    action.content = `Batch file read failed. Use readFile for individual files instead.`;
  }
}
