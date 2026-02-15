/**
 * Enterprise AI Integration Layer
 * Connects advanced AI services to recoder-web chat system
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('EnterpriseIntegration');

const execAsync = promisify(exec);

// Cache for preventing duplicate operations
const operationCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

/**
 * Check for AI loops in conversation
 * Simple pattern detection without requiring Config object
 */
export async function checkForLoops(messages: any[]): Promise<{ hasLoop: boolean; suggestion?: string }> {
  if (!messages || messages.length < 5) {
    return { hasLoop: false };
  }

  // Cache key based on last 5 messages
  const cacheKey = `loop:${messages.slice(-5).map(m => m.content?.substring(0, 50)).join('|')}`;
  const cached = operationCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    // Simple loop detection: check for repeated patterns in recent messages
    const recentMessages = messages.slice(-10);
    const assistantMessages = recentMessages
      .filter(m => m.role === 'assistant')
      .map(m => typeof m.content === 'string' ? m.content.substring(0, 200) : '');

    // Check for identical consecutive responses
    let repeatCount = 0;
    for (let i = 1; i < assistantMessages.length; i++) {
      if (assistantMessages[i] === assistantMessages[i - 1] && assistantMessages[i].length > 50) {
        repeatCount++;
      }
    }

    // Check for similar patterns (simplified hash comparison)
    const contentHashes = assistantMessages.map(content => {
      // Simple hash: first 50 chars + length
      return `${content.substring(0, 50)}_${content.length}`;
    });

    const hashCounts = new Map<string, number>();
    for (const hash of contentHashes) {
      hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
    }

    const maxRepetitions = Math.max(...Array.from(hashCounts.values()));
    const hasLoop = repeatCount >= 2 || maxRepetitions >= 3;

    const response = {
      hasLoop,
      suggestion: hasLoop ? 'The AI appears to be repeating similar responses. Consider rephrasing your request or trying a different approach.' : undefined
    };

    operationCache.set(cacheKey, { result: response, timestamp: Date.now() });
    return response;
  } catch (error) {
    logger.warn('Loop detection failed:', error);
    return { hasLoop: false };
  }
}

// ==============================================
// SECURITY: Command validation and sanitization
// ==============================================

// Commands that are explicitly allowed (whitelist approach)
const ALLOWED_COMMANDS = [
  // Package managers
  'npm', 'yarn', 'pnpm', 'bun', 'pip', 'pip3', 'cargo', 'go', 'composer', 'gem', 'bundle',
  // Build tools
  'vite', 'webpack', 'rollup', 'esbuild', 'tsc', 'node', 'npx',
  // Git commands
  'git',
  // Development servers
  'next', 'remix', 'astro', 'nuxt',
  // Testing
  'jest', 'vitest', 'pytest', 'mocha',
  // Linting/Formatting
  'eslint', 'prettier', 'biome',
  // Utilities
  'ls', 'cat', 'echo', 'pwd', 'find', 'grep', 'head', 'tail', 'wc',
  'mkdir', 'touch', 'cp', 'mv', 'rm',
];

// Patterns that should NEVER be allowed (blocklist for dangerous commands)
const BLOCKED_PATTERNS = [
  /curl\s+.*\|\s*(?:sh|bash)/i,    // Piped curl to shell
  /wget\s+.*\|\s*(?:sh|bash)/i,    // Piped wget to shell
  /rm\s+-rf\s+\/(?!workspace)/,    // rm -rf outside workspace
  />\s*\/(?!workspace)/,           // Redirect to files outside workspace
  /sudo/i,                         // No sudo
  /chmod\s+[0-7]*7[0-7]*\s/,       // Dangerous permissions
  /chown/i,                        // No chown
  /mkfs/i,                         // No filesystem creation
  /dd\s+if=/i,                     // No disk operations
  /mount\s/i,                      // No mount
  /umount/i,                       // No umount
  /nsenter/i,                      // No namespace escape
  /docker\s/i,                     // No docker commands
  /systemctl/i,                    // No systemd
  /service\s/i,                    // No service management
  /reboot/i,                       // No reboot
  /shutdown/i,                     // No shutdown
  /init\s/i,                       // No init
  /\/proc\//,                      // No proc access
  /\/sys\//,                       // No sys access
  /\/dev\//,                       // No dev access
  /nc\s+-/i,                       // No netcat with flags (potential reverse shell)
  /\beval\b/,                      // No eval
  /`.*`/,                          // No backtick command substitution
  /\$\(/,                          // No $() command substitution outside allowed contexts
];

/**
 * Validate and sanitize shell commands for safety
 */
function validateShellCommand(command: string): { valid: boolean; error?: string } {
  if (!command || typeof command !== 'string') {
    return { valid: false, error: 'Command is required' };
  }

  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Command cannot be empty' };
  }

  if (trimmed.length > 10000) {
    return { valid: false, error: 'Command too long' };
  }

  // Check against blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.warn(`[Security] Blocked dangerous command pattern: ${pattern}`);
      return { valid: false, error: 'Command contains blocked pattern' };
    }
  }

  // Extract the base command (first word, handling paths)
  const baseCommand = trimmed.split(/\s+/)[0].split('/').pop() || '';

  // Check if base command is in allowed list
  if (!ALLOWED_COMMANDS.includes(baseCommand)) {
    logger.warn(`[Security] Command not in allowlist: ${baseCommand}`);
    return { valid: false, error: `Command '${baseCommand}' is not allowed` };
  }

  return { valid: true };
}

/**
 * Execute shell command with enhanced safety
 * SECURITY: Validates commands against allowlist and blocks dangerous patterns
 */
export async function executeShellCommand(command: string, projectPath: string): Promise<{ success: boolean; output: string; error?: string; exitCode?: number }> {
  // SECURITY: Validate command before execution
  const validation = validateShellCommand(command);
  if (!validation.valid) {
    logger.warn(`[Security] Rejected shell command: ${command.substring(0, 100)}...`);
    return {
      success: false,
      output: '',
      error: validation.error || 'Command validation failed',
      exitCode: 1
    };
  }

  // SECURITY: Ensure projectPath is within /workspace
  if (!projectPath || !projectPath.startsWith('/workspace')) {
    return {
      success: false,
      output: '',
      error: 'Invalid project path: must be within /workspace',
      exitCode: 1
    };
  }

  try {
    const { stdout, stderr } = await execAsync(command, { cwd: projectPath, timeout: 30000 });
    return {
      success: true,
      output: stdout || '',
      error: stderr || undefined,
      exitCode: 0
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || (error instanceof Error ? error.message : String(error)),
      exitCode: error.code || 1
    };
  }
}

/**
 * Record chat session for analytics
 * Simple file-based recording without requiring Config object
 */
export async function recordChatSession(sessionId: string, messages: any[]): Promise<void> {
  try {
    // Simple logging - can be expanded to file storage later
    logger.info(`[ChatRecording] Session ${sessionId}: ${messages.length} messages`);

    // Optionally save to a temp directory if needed
    const tempDir = process.env.CHAT_LOGS_DIR;
    if (tempDir) {
      const logFile = path.join(tempDir, `${sessionId}.json`);
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(logFile, JSON.stringify({
        sessionId,
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        // Don't store full messages for privacy, just metadata
        summary: messages.slice(-3).map(m => ({
          role: m.role,
          contentLength: typeof m.content === 'string' ? m.content.length : 0
        }))
      }, null, 2));
    }
  } catch (error) {
    logger.warn('Chat recording failed:', error);
  }
}

/**
 * Get chat analytics
 */
export async function getChatAnalytics(sessionId: string): Promise<any> {
  try {
    const tempDir = process.env.CHAT_LOGS_DIR;
    if (tempDir) {
      const logFile = path.join(tempDir, `${sessionId}.json`);
      const data = await fs.readFile(logFile, 'utf-8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    logger.warn('Analytics retrieval failed:', error);
    return null;
  }
}

/**
 * Smart file discovery for project context
 * Uses glob patterns to find relevant files
 * SECURITY: Uses sanitized paths and safe command construction
 */
export async function discoverRelevantFiles(query: string, projectPath: string): Promise<string[]> {
  // SECURITY: Validate projectPath is within /workspace
  if (!projectPath || !projectPath.startsWith('/workspace')) {
    logger.warn('[Security] discoverRelevantFiles: Invalid project path');
    return [];
  }

  // SECURITY: Sanitize projectPath to prevent injection
  const safePath = projectPath.replace(/[^a-zA-Z0-9/_.-]/g, '');
  if (safePath !== projectPath) {
    logger.warn('[Security] discoverRelevantFiles: Path contained invalid characters');
    return [];
  }

  const cacheKey = `files:${query}:${safePath}`;
  const cached = operationCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    // Common patterns to search based on query
    const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    // SECURITY: Use array-based exec with execFile to prevent shell injection
    // We construct a safe find command with validated path
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync('find', [
      safePath,
      '-type', 'f',
      '(',
        '-name', '*.ts',
        '-o', '-name', '*.tsx',
        '-o', '-name', '*.js',
        '-o', '-name', '*.jsx',
        '-o', '-name', '*.json',
        '-o', '-name', '*.md',
      ')',
      '-not', '-path', '*/node_modules/*',
      '-not', '-path', '*/.git/*',
    ], { timeout: 10000, maxBuffer: 1024 * 1024 });

    const allFiles = stdout.trim().split('\n').filter(Boolean).slice(0, 100);

    // Filter files based on query terms
    const relevantFiles = allFiles.filter(file => {
      const fileName = path.basename(file).toLowerCase();
      const filePath = file.toLowerCase();
      return searchTerms.some(term =>
        fileName.includes(term) || filePath.includes(term)
      );
    });

    // If no specific matches, return some relevant files
    const result = relevantFiles.length > 0 ? relevantFiles.slice(0, 20) : allFiles.slice(0, 10);

    operationCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  } catch (error) {
    logger.warn('File discovery failed:', error);
    return [];
  }
}

/**
 * Clean expired cache entries (call periodically)
 */
export function cleanCache() {
  const now = Date.now();
  for (const [key, value] of operationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      operationCache.delete(key);
    }
  }
}

// Auto-cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanCache, 300000);
}

/**
 * Auto-commit changes with AI-generated messages
 * Uses safe command execution to prevent injection
 * SECURITY: Uses execFile for git commands instead of shell execution
 */
export async function autoCommitChanges(projectPath: string, files: string[]): Promise<{ success: boolean; commitHash?: string; message?: string }> {
  // SECURITY: Validate projectPath is within /workspace
  if (!projectPath || !projectPath.startsWith('/workspace')) {
    return {
      success: false,
      message: 'Invalid project path: must be within /workspace'
    };
  }

  // SECURITY: Sanitize projectPath
  const safePath = projectPath.replace(/[^a-zA-Z0-9/_.-]/g, '');
  if (safePath !== projectPath) {
    return {
      success: false,
      message: 'Project path contains invalid characters'
    };
  }

  // SECURITY: Import execFile for safe command execution
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  try {
    // Check if git is available and this is a git repo
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: safePath });
    } catch {
      return {
        success: false,
        message: 'Not a git repository'
      };
    }

    // SECURITY: Validate and sanitize file paths
    const safeFiles: string[] = [];
    for (const file of files) {
      // Reject files with path traversal or special characters
      if (file.includes('..') || file.startsWith('/') || /[;&|`$(){}]/.test(file)) {
        logger.warn(`[Security] autoCommitChanges: Rejected unsafe file path: ${file}`);
        continue;
      }
      // Only allow alphanumeric, slashes, dots, dashes, underscores
      const safeFile = file.replace(/[^a-zA-Z0-9/_.-]/g, '');
      if (safeFile === file && safeFile.length > 0) {
        safeFiles.push(safeFile);
      }
    }

    // Stage the specified files using execFile (no shell injection possible)
    if (safeFiles.length > 0) {
      await execFileAsync('git', ['add', ...safeFiles], { cwd: safePath });
    } else {
      // Stage all changes
      await execFileAsync('git', ['add', '-A'], { cwd: safePath });
    }

    // Check if there are changes to commit
    const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], { cwd: safePath });
    if (!status.trim()) {
      return {
        success: true,
        message: 'No changes to commit'
      };
    }

    // Generate commit message based on changed files
    const changedFiles = status.trim().split('\n').map(line => line.slice(3));
    const commitMessage = generateCommitMessage(changedFiles);

    // SECURITY: Commit using execFile - message is passed as argument, not in shell
    await execFileAsync('git', ['commit', '-m', commitMessage], { cwd: safePath });

    // Get the commit hash
    const { stdout: hash } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: safePath });

    return {
      success: true,
      commitHash: hash.trim(),
      message: commitMessage
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Generate a commit message based on changed files
 */
function generateCommitMessage(files: string[]): string {
  if (files.length === 0) return 'Auto-commit: update files';

  if (files.length === 1) {
    const file = files[0];
    const ext = path.extname(file);
    const name = path.basename(file, ext);
    return `Update ${name}${ext}`;
  }

  // Group by extension
  const extensions = new Set(files.map(f => path.extname(f)));
  if (extensions.size === 1) {
    const ext = Array.from(extensions)[0];
    return `Update ${files.length} ${ext} files`;
  }

  // Check for common patterns
  const dirs = new Set(files.map(f => path.dirname(f).split('/').pop()));
  if (dirs.size === 1 && dirs.has('components')) {
    return `Update components`;
  }

  return `Auto-commit: update ${files.length} files`;
}
