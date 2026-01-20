/**
 * Client-side helper for calling enterprise tools API
 * Use this to access server-side tools from client components
 */

const API_ENDPOINT = '/api/enterprise-tools';

interface ToolResponse<T = any> {
  success: boolean;
  error?: string;
  [key: string]: T | boolean | string | undefined;
}

async function callTool<T>(tool: string, params: Record<string, any>): Promise<ToolResponse<T>> {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, params }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Enhanced file reading with line numbers, smart truncation
 */
export async function readFileEnhanced(
  filePath: string,
  options?: { startLine?: number; endLine?: number; maxLines?: number }
) {
  return callTool('readFileEnhanced', { filePath, ...options });
}

/**
 * Search and replace in a file (targeted edit)
 */
export async function searchReplace(
  filePath: string,
  oldString: string,
  newString: string
) {
  return callTool('searchReplace', { file_path: filePath, old_string: oldString, new_string: newString });
}

/**
 * Discover relevant files for a query
 */
export async function discoverFiles(query: string, workingDir = '/workspace') {
  return callTool<string[]>('discoverFiles', { query, workingDir });
}

/**
 * Auto-commit changes with AI-generated message
 */
export async function autoCommit(files: string[], workingDir = '/workspace') {
  return callTool('autoCommit', { files, workingDir });
}

/**
 * Code assist query
 */
export async function codeAssist(query: string, context?: any) {
  return callTool('codeAssist', { query, context });
}

/**
 * Delegate task to specialized subagent
 */
export async function delegateSubagent(
  agentType: 'coder' | 'debugger' | 'architect' | 'tester',
  task: string,
  context?: any
) {
  return callTool('delegateSubagent', { agentType, task, context });
}

/**
 * Fetch content from a URL
 */
export async function webFetch(url: string, options?: { timeout?: number; extractText?: boolean }) {
  return callTool<string>('webFetch', { url, options });
}

/**
 * Memory operations (store/retrieve/list/delete)
 */
export async function memory(
  operation: 'store' | 'retrieve' | 'list' | 'delete',
  data?: { key?: string; value?: string }
) {
  return callTool('memory', { operation, data });
}

/**
 * Glob file search
 */
export async function globSearch(
  pattern: string,
  options?: { path?: string; ignore?: string[] }
) {
  return callTool<string[]>('glob', { pattern, ...options });
}

/**
 * Grep-like search across files
 */
export async function grepSearch(
  pattern: string,
  path = '/workspace',
  options?: { caseSensitive?: boolean; maxResults?: number }
) {
  return callTool<Array<{ file: string; line: number; content: string }>>('ripGrep', {
    pattern,
    path,
    ...options,
  });
}

/**
 * Apply line-based edits to a file
 */
export async function editFile(
  filePath: string,
  edits: Array<{
    lineNumber: number;
    operation: 'insert' | 'delete' | 'replace';
    content?: string;
    endLine?: number;
  }>,
  workingDir = '/workspace'
) {
  return callTool('editFile', { filePath, edits, workingDir });
}

/**
 * Read multiple files at once
 */
export async function readManyFiles(
  files: string[],
  workingDir = '/workspace',
  options?: { maxFileSize?: number }
) {
  return callTool<Array<{ path: string; content?: string; error?: string }>>('readManyFiles', {
    files,
    workingDir,
    ...options,
  });
}

/**
 * Check for AI conversation loops
 */
export async function checkForLoops(messages: any[]) {
  return callTool<{ hasLoop: boolean; suggestion?: string }>('checkLoops', { messages });
}

/**
 * Execute shell command on server
 */
export async function executeShell(command: string, workingDir = '/workspace') {
  return callTool<{ output: string }>('executeShell', { command, workingDir });
}

// Export all tools as a namespace
export const enterpriseTools = {
  readFileEnhanced,
  searchReplace,
  discoverFiles,
  autoCommit,
  codeAssist,
  delegateSubagent,
  webFetch,
  memory,
  globSearch,
  grepSearch,
  editFile,
  readManyFiles,
  checkForLoops,
  executeShell,
};

export default enterpriseTools;
