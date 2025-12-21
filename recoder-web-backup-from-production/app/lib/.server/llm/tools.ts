/**
 * Tool definitions for Vercel AI SDK
 * These tools enable structured, validated interactions with the AI
 */

import { tool } from 'ai';
import { z } from 'zod';

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
 * All available tools
 */
export const boltTools = {
  createFile: createFileTool,
  runShellCommand: runShellCommandTool,
  createFiles: createFilesTool,
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
