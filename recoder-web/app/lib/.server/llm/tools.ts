/**
 * Tool definitions for Vercel AI SDK
 * These tools enable structured, validated interactions with the AI
 */

import { tool } from 'ai';
import { z } from 'zod';
import { searchReplace } from './tools/search-replace';

// Enterprise AI integrations
import { LoopDetectionService } from './services/loopDetectionService';
// Note: ShellExecutionService disabled due to @xterm/headless incompatibility with Vite
// import { ShellExecutionService } from './services/shellExecutionService';
import { SubagentManager } from './subagents/subagent-manager';

// Advanced tools from recoder-code
import { RipGrepTool } from './tools/ripGrep';
import { EditTool } from './tools/edit';
import { WriteFileTool } from './tools/write-file';
import { ReadManyFilesTool } from './tools/read-many-files';
import { WebFetchTool } from './tools/web-fetch';
import { WebSearchTool } from './tools/web-search';
import { MemoryTool } from './tools/memoryTool';
import { DiscoveredMCPTool } from './tools/mcp-tool';
import { GlobTool } from './tools/glob';

/**
 * Enhanced tool for reading file contents with line ranges and smart truncation
 */
export const readFileTool = tool({
  description: 'Read file contents with optional line ranges. Supports binary files, images, and smart truncation for large files.',
  parameters: z.object({
    filePath: z.string().describe('Relative path to the file to read (e.g., "src/App.tsx")'),
    startLine: z.number().optional().describe('Start line number (1-based, optional)'),
    endLine: z.number().optional().describe('End line number (1-based, optional)'),
    maxLines: z.number().optional().describe('Maximum lines to read (optional, for large files)'),
  }),
  execute: async ({ filePath, startLine, endLine, maxLines }) => {
    return {
      success: true,
      filePath,
      startLine,
      endLine,
      maxLines,
      action: 'read_file',
    };
  },
});

/**
 * Tool for listing files in a directory
 */
export const listFilesTool = tool({
  description: 'List all files in a directory or show project structure. Use this to understand what files exist.',
  parameters: z.object({
    path: z.string().optional().describe('Directory path to list (default: root directory)'),
    recursive: z.boolean().optional().describe('List files recursively (default: false)'),
  }),
  execute: async ({ path, recursive }) => {
    return {
      success: true,
      path: path || '.',
      recursive: recursive || false,
      action: 'list_files',
    };
  },
});

/**
 * Tool for searching files by content (grep)
 */
export const searchFilesTool = tool({
  description: 'Search for text across all files in the project (like grep). Use this to find where something is defined or used.',
  parameters: z.object({
    query: z.string().describe('Text to search for'),
    filePattern: z.string().optional().describe('File pattern to search in (e.g., "*.tsx", "src/**")'),
  }),
  execute: async ({ query, filePattern }) => {
    return {
      success: true,
      query,
      filePattern: filePattern || '**/*',
      action: 'search_files',
    };
  },
});

/**
 * Tool for targeted string replacement in files (str_replace)
 * More precise than full file regeneration - only replaces specific text
 */
export const strReplaceTool = tool({
  description: 'Replace specific text in a file with new text. Use this for targeted edits instead of regenerating entire files. Much more precise and safer than createFile.',
  parameters: z.object({
    filePath: z.string().describe('Relative path to the file to edit'),
    oldString: z.string().describe('Exact text to find and replace (must match exactly including whitespace)'),
    newString: z.string().describe('New text to replace the old text with'),
  }),
  execute: async ({ filePath, oldString, newString }) => {
    return {
      success: true,
      filePath,
      oldString: oldString.substring(0, 50) + (oldString.length > 50 ? '...' : ''),
      newString: newString.substring(0, 50) + (newString.length > 50 ? '...' : ''),
      action: 'str_replace',
    };
  },
});

/**
 * Tool for creating or updating files
 */
export const createFileTool = tool({
  description: 'Create or update a file in the project',
  parameters: z.object({
    filePath: z.string().describe('Relative path to the file (e.g., "src/App.tsx")'),
    content: z.string().describe('Complete content of the file'),
    reason: z.string().describe('Brief explanation of what this file does'),
  }),
  execute: async ({ filePath, content, reason }) => {
    // This is just a marker - actual execution happens in the client
    return {
      success: true,
      filePath,
      contentLength: content.length,
      reason,
    };
  },
});

/**
 * Tool for running shell commands
 */
export const runShellCommandTool = tool({
  description: 'Run a shell command (npm install, build commands, etc.)',
  parameters: z.object({
    command: z.string().describe('The shell command to execute'),
    reason: z.string().describe('Brief explanation of why this command is needed'),
  }),
  execute: async ({ command, reason }) => {
    // This is just a marker - actual execution happens in the client
    return {
      success: true,
      command,
      reason,
    };
  },
});

/**
 * Tool for creating multiple files at once (batch operation)
 */
export const createFilesTool = tool({
  description: 'Create multiple files in a single operation',
  parameters: z.object({
    files: z.array(z.object({
      filePath: z.string(),
      content: z.string(),
    })).describe('Array of files to create'),
    projectName: z.string().describe('Name of the project'),
  }),
  execute: async ({ files, projectName }) => {
    return {
      success: true,
      fileCount: files.length,
      projectName,
    };
  },
});

/**
 * Tool for importing pre-built starter templates
 * Loads complete project structures from starters-bundle.json
 */
export const importStarterTemplateTool = tool({
  description: 'Import a complete pre-built starter template with all files and dependencies. Use this when user wants a blog, dashboard, API, or any project that matches existing templates. This is MUCH faster than creating files one-by-one.',
  parameters: z.object({
    templateId: z.string().describe('Template ID from starters bundle (e.g., "BlogApp", "angular", "express-typescript-auth", "recoder-vite-react-ts")'),
    reason: z.string().describe('Brief explanation of why this template is being imported'),
    customizations: z.string().optional().describe('What customizations will be made after import'),
  }),
  execute: async ({ templateId, reason, customizations }) => {
    return {
      success: true,
      templateId,
      reason,
      customizations,
      message: `Template ${templateId} will be imported from starters bundle`,
    };
  },
});

/**
 * Tool for cloning GitHub repositories
 * Actually clones real repositories from GitHub
 */
export const cloneGitHubRepoTool = tool({
  description: 'Clone a real GitHub repository with all its files. Use this when user wants to import, clone, or start from an existing GitHub project. Works with public repositories.',
  parameters: z.object({
    repoUrl: z.string().describe('GitHub repository URL or owner/repo format (e.g., "facebook/react", "vercel/next.js", or full URLs like "https://github.com/facebook/react")'),
    reason: z.string().describe('Brief explanation of why this repository is being cloned'),
  }),
  execute: async ({ repoUrl, reason }) => {
    return {
      success: true,
      repoUrl,
      reason,
      message: `Repository ${repoUrl} will be cloned from GitHub`,
    };
  },
});

/**
 * Tool for delegating complex tasks to specialized subagents
 */
export const delegateToSubagentTool = tool({
  description: 'Delegate complex tasks to specialized AI subagents that can work in parallel. Use for multi-step tasks that can be broken down.',
  parameters: z.object({
    taskDescription: z.string().describe('Description of the task to delegate'),
    agentType: z.enum(['coder', 'debugger', 'architect', 'tester']).describe('Type of specialized agent needed'),
    context: z.string().optional().describe('Additional context for the subagent'),
  }),
  execute: async ({ taskDescription, agentType, context }) => {
    return {
      success: true,
      taskDescription,
      agentType,
      context,
      action: 'delegate_subagent',
    };
  },
});

/**
 * Enhanced search tool using ripgrep for fast file searching
 */
export const ripGrepTool = tool({
  description: 'Fast search across all files using ripgrep. Much faster than regular search for large codebases.',
  parameters: z.object({
    query: z.string().describe('Text to search for'),
    filePattern: z.string().optional().describe('File pattern to search in (e.g., "*.tsx", "src/**")'),
    caseSensitive: z.boolean().optional().describe('Case sensitive search'),
    maxResults: z.number().optional().describe('Maximum number of results'),
  }),
  execute: async ({ query, filePattern, caseSensitive, maxResults }) => {
    return {
      success: true,
      query,
      filePattern,
      caseSensitive,
      maxResults,
      action: 'ripgrep_search',
    };
  },
});

/**
 * Advanced file editing with precise line-based operations
 */
export const editFileTool = tool({
  description: 'Advanced file editing with line-based operations. More precise than str_replace for complex edits.',
  parameters: z.object({
    filePath: z.string().describe('Path to the file to edit'),
    operation: z.enum(['insert', 'delete', 'replace']).describe('Type of edit operation'),
    lineNumber: z.number().describe('Line number to operate on (1-based)'),
    content: z.string().optional().describe('Content to insert or replace with'),
    endLineNumber: z.number().optional().describe('End line for multi-line operations'),
  }),
  execute: async ({ filePath, operation, lineNumber, content, endLineNumber }) => {
    return {
      success: true,
      filePath,
      operation,
      lineNumber,
      content,
      endLineNumber,
      action: 'edit_file',
    };
  },
});

/**
 * Read multiple files efficiently in one operation
 */
export const readManyFilesTool = tool({
  description: 'Read multiple files efficiently in a single operation. Better than multiple readFile calls.',
  parameters: z.object({
    filePaths: z.array(z.string()).describe('Array of file paths to read'),
    maxFileSize: z.number().optional().describe('Maximum file size to read (bytes)'),
  }),
  execute: async ({ filePaths, maxFileSize }) => {
    return {
      success: true,
      filePaths,
      maxFileSize,
      action: 'read_many_files',
    };
  },
});

/**
 * Web search tool for finding information online
 */
export const webSearchTool = tool({
  description: 'Search the web for current information, documentation, or solutions to problems.',
  parameters: z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().optional().describe('Maximum number of results (default: 5)'),
  }),
  execute: async ({ query, maxResults }) => {
    return {
      success: true,
      query,
      maxResults: maxResults || 5,
      action: 'web_search',
    };
  },
});

/**
 * Web fetch tool for getting content from URLs
 */
export const webFetchTool = tool({
  description: 'Fetch content from a specific URL. Useful for reading documentation, APIs, or web pages.',
  parameters: z.object({
    url: z.string().describe('URL to fetch content from'),
    selector: z.string().optional().describe('CSS selector to extract specific content'),
  }),
  execute: async ({ url, selector }) => {
    return {
      success: true,
      url,
      selector,
      action: 'web_fetch',
    };
  },
});

/**
 * Memory tool for storing and retrieving information across conversations
 */
export const memoryTool = tool({
  description: 'Store or retrieve information that should be remembered across conversations.',
  parameters: z.object({
    operation: z.enum(['store', 'retrieve', 'list']).describe('Memory operation'),
    key: z.string().optional().describe('Key to store/retrieve (required for store/retrieve)'),
    value: z.string().optional().describe('Value to store (required for store)'),
  }),
  execute: async ({ operation, key, value }) => {
    return {
      success: true,
      operation,
      key,
      value,
      action: 'memory_operation',
    };
  },
});

/**
 * Advanced file globbing tool
 */
export const globTool = tool({
  description: 'Find files using glob patterns. More powerful than basic file listing.',
  parameters: z.object({
    pattern: z.string().describe('Glob pattern (e.g., "**/*.ts", "src/**/*.{js,jsx}")'),
    exclude: z.array(z.string()).optional().describe('Patterns to exclude'),
    maxDepth: z.number().optional().describe('Maximum directory depth'),
  }),
  execute: async ({ pattern, exclude, maxDepth }) => {
    return {
      success: true,
      pattern,
      exclude,
      maxDepth,
      action: 'glob_search',
    };
  },
});

/**
 * All available tools organized by category
 */
export const recoderTools = {
  // File Operations (8 tools)
  readFile: readFileTool,
  readManyFiles: readManyFilesTool,
  listFiles: listFilesTool,
  createFile: createFileTool,
  createFiles: createFilesTool,
  strReplace: strReplaceTool,
  editFile: editFileTool,
  glob: globTool,
  
  // Search & Discovery (4 tools)
  searchFiles: searchFilesTool,
  ripGrep: ripGrepTool,
  webSearch: webSearchTool,
  webFetch: webFetchTool,
  
  // Advanced AI (3 tools)
  delegateSubagent: delegateToSubagentTool,
  memory: memoryTool,
  // codeAssist integrated separately
  
  // Project Management (3 tools)
  importStarterTemplate: importStarterTemplateTool,
  cloneGitHubRepo: cloneGitHubRepoTool,
  runShellCommand: runShellCommandTool,
};

/**
 * Tool groups for mode-based access control
 */
export const toolGroups = {
  read: ['readFile', 'readManyFiles', 'listFiles', 'searchFiles', 'ripGrep', 'glob', 'webFetch'],
  edit: ['createFile', 'createFiles', 'strReplace', 'editFile'],
  browser: ['webSearch', 'webFetch'],
  command: ['runShellCommand'],
  advanced: ['delegateSubagent', 'memory'],
  project: ['importStarterTemplate', 'cloneGitHubRepo'],
};

/**
 * Check if tools should be enabled for this model
 */
export function shouldEnableTools(modelId: string): boolean {
  // Models that support tool calling
  const toolSupportedModels = [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro',
    'anthropic/claude-sonnet',
    'anthropic/claude-opus',
  ];

  return toolSupportedModels.some(supported => modelId.includes(supported));
}

/**
 * Get tools for a specific mode (for future mode-based restrictions)
 */
export function getToolsForMode(mode: 'architect' | 'code' | 'debug' | 'ask' = 'code') {
  const modeToolGroups: Record<string, string[]> = {
    architect: ['read', 'browser'], // Read-only + research
    code: ['read', 'edit', 'command', 'advanced', 'project'], // Full access
    debug: ['read', 'edit', 'command'], // No project management
    ask: ['read', 'browser'], // Read-only + research
  };

  const allowedGroups = modeToolGroups[mode];
  const allowedToolNames = allowedGroups.flatMap(group => (toolGroups as Record<string, string[]>)[group] || []);

  return Object.fromEntries(
    Object.entries(recoderTools).filter(([name]) => allowedToolNames.includes(name))
  );
}
