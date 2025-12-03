/**
 * Tool definitions for Vercel AI SDK
 * These tools enable structured, validated interactions with the AI
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tool for reading file contents
 */
export const readFileTool = tool({
  description: 'Read the contents of a file. Use this to see what exists before editing.',
  parameters: z.object({
    filePath: z.string().describe('Relative path to the file to read (e.g., "src/App.tsx")'),
  }),
  execute: async ({ filePath }) => {
    return {
      success: true,
      filePath,
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
 * All available tools
 */
export const recoderTools = {
  readFile: readFileTool,
  listFiles: listFilesTool,
  searchFiles: searchFilesTool,
  createFile: createFileTool,
  runShellCommand: runShellCommandTool,
  createFiles: createFilesTool,
  importStarterTemplate: importStarterTemplateTool,
  cloneGitHubRepo: cloneGitHubRepoTool,
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
