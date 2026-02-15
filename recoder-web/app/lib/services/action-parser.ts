/**
 * Action Parser Service
 *
 * Parses special XML tags from AI responses to extract structured actions.
 * Inspired by December's dec-write, dec-rename, dec-delete pattern.
 *
 * Supported action tags:
 * - <recoder-write path="file">content</recoder-write> - Create/update files
 * - <recoder-rename from="old" to="new"/> - Rename files
 * - <recoder-delete path="file"/> - Delete files
 * - <recoder-shell>command</recoder-shell> - Run shell commands
 * - <recoder-dependency>package</recoder-dependency> - Install packages
 *
 * Supported message block tags:
 * - <recoder-thinking>content</recoder-thinking> - AI thinking/reasoning (collapsible)
 * - <recoder-error>content</recoder-error> - Error messages (red styling)
 * - <recoder-success>content</recoder-success> - Success messages (green styling)
 * - <recoder-warning>content</recoder-warning> - Warning messages (yellow styling)
 * - <recoder-info>content</recoder-info> - Info messages (blue styling)
 * - <recoder-code lang="ts">content</recoder-code> - Syntax highlighted code blocks
 * - <console-logs>content</console-logs> - Terminal output styling
 * - <current-route>content</current-route> - Route/URL information
 * - <recoder-diff>content</recoder-diff> - Show file changes/diffs
 */

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ActionParser');


// Action types
export type ActionType = 'write' | 'rename' | 'delete' | 'shell' | 'dependency';

// Message block types
export type MessageBlockType =
  | 'thinking'
  | 'error'
  | 'success'
  | 'warning'
  | 'info'
  | 'code'
  | 'console'
  | 'route'
  | 'diff';

export interface MessageBlock {
  id: string;
  type: MessageBlockType;
  content: string;
  raw: string;
  index: number;
  language?: string; // For code blocks
}

export interface BaseAction {
  id: string;
  type: ActionType;
  raw: string; // Original matched text
  index: number; // Position in the source string
}

export interface WriteAction extends BaseAction {
  type: 'write';
  path: string;
  content: string;
}

export interface RenameAction extends BaseAction {
  type: 'rename';
  from: string;
  to: string;
}

export interface DeleteAction extends BaseAction {
  type: 'delete';
  path: string;
}

export interface ShellAction extends BaseAction {
  type: 'shell';
  command: string;
}

export interface DependencyAction extends BaseAction {
  type: 'dependency';
  packageName: string;
  version?: string;
  isDev?: boolean;
}

export type ParsedAction =
  | WriteAction
  | RenameAction
  | DeleteAction
  | ShellAction
  | DependencyAction;

export interface ParseResult {
  actions: ParsedAction[];
  textSegments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  hasActions: boolean;
}

export interface MessageBlockParseResult {
  blocks: MessageBlock[];
  textSegments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  hasBlocks: boolean;
}

// Regex patterns for matching action tags
const PATTERNS = {
  // <recoder-write path="file.ts">content</recoder-write>
  // Also supports file_path attribute for flexibility
  write: /<recoder-write\s+(?:path|file_path)="([^"]+)">([\s\S]*?)<\/recoder-write>/g,

  // <recoder-rename from="old.ts" to="new.ts"/>
  // Supports both self-closing and explicit closing
  rename: /<recoder-rename\s+from="([^"]+)"\s+to="([^"]+)"\s*\/?>/g,

  // <recoder-delete path="file.ts"/>
  // Also supports file_path attribute
  delete: /<recoder-delete\s+(?:path|file_path)="([^"]+)"\s*\/?>/g,

  // <recoder-shell>npm install</recoder-shell>
  shell: /<recoder-shell>([\s\S]*?)<\/recoder-shell>/g,

  // <recoder-dependency name="react" version="^18.0.0" dev="true">react</recoder-dependency>
  // or simply <recoder-dependency>react</recoder-dependency>
  dependency:
    /<recoder-dependency(?:\s+name="([^"]+)")?(?:\s+version="([^"]+)")?(?:\s+dev="([^"]+)")?\s*>(.*?)<\/recoder-dependency>/g,
};

// Generate unique action ID
let actionIdCounter = 0;
function generateActionId(): string {
  return `action_${Date.now()}_${++actionIdCounter}`;
}

/**
 * Unescape HTML entities in content.
 * AI responses may contain escaped characters that need to be decoded.
 */
function unescapeContent(content: string): string {
  return content
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Parse a single write action from a regex match.
 */
function parseWriteAction(match: RegExpExecArray): WriteAction {
  const path = match[1].trim();
  // Trim the content but preserve internal whitespace
  let content = match[2];

  // Remove leading/trailing empty lines but preserve indentation
  const lines = content.split('\n');

  // Find first non-empty line
  let startIndex = 0;
  while (startIndex < lines.length && lines[startIndex].trim() === '') {
    startIndex++;
  }

  // Find last non-empty line
  let endIndex = lines.length - 1;
  while (endIndex >= 0 && lines[endIndex].trim() === '') {
    endIndex--;
  }

  if (startIndex <= endIndex) {
    content = lines.slice(startIndex, endIndex + 1).join('\n');
  } else {
    content = '';
  }

  // Unescape any HTML entities
  content = unescapeContent(content);

  return {
    id: generateActionId(),
    type: 'write',
    path,
    content,
    raw: match[0],
    index: match.index,
  };
}

/**
 * Parse a single rename action from a regex match.
 */
function parseRenameAction(match: RegExpExecArray): RenameAction {
  return {
    id: generateActionId(),
    type: 'rename',
    from: match[1].trim(),
    to: match[2].trim(),
    raw: match[0],
    index: match.index,
  };
}

/**
 * Parse a single delete action from a regex match.
 */
function parseDeleteAction(match: RegExpExecArray): DeleteAction {
  return {
    id: generateActionId(),
    type: 'delete',
    path: match[1].trim(),
    raw: match[0],
    index: match.index,
  };
}

/**
 * Parse a single shell action from a regex match.
 */
function parseShellAction(match: RegExpExecArray): ShellAction {
  let command = match[1].trim();
  command = unescapeContent(command);

  return {
    id: generateActionId(),
    type: 'shell',
    command,
    raw: match[0],
    index: match.index,
  };
}

/**
 * Parse a single dependency action from a regex match.
 */
function parseDependencyAction(match: RegExpExecArray): DependencyAction {
  // Priority: name attribute > content
  const packageName = (match[1] || match[4] || '').trim();
  const version = match[2]?.trim();
  const isDev = match[3]?.toLowerCase() === 'true';

  return {
    id: generateActionId(),
    type: 'dependency',
    packageName,
    version,
    isDev,
    raw: match[0],
    index: match.index,
  };
}

/**
 * Parse all actions from an AI response string.
 *
 * @param content - The AI response content to parse
 * @returns ParseResult with all found actions and text segments between them
 */
export function parseActions(content: string): ParseResult {
  const actions: ParsedAction[] = [];
  const matches: Array<{ action: ParsedAction; start: number; end: number }> = [];

  // Parse all write actions
  PATTERNS.write.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATTERNS.write.exec(content)) !== null) {
    try {
      const action = parseWriteAction(match);
      matches.push({
        action,
        start: match.index,
        end: match.index + match[0].length,
      });
    } catch (e) {
      logger.warn('[ActionParser] Failed to parse write action:', e);
    }
  }

  // Parse all rename actions
  PATTERNS.rename.lastIndex = 0;
  while ((match = PATTERNS.rename.exec(content)) !== null) {
    try {
      const action = parseRenameAction(match);
      matches.push({
        action,
        start: match.index,
        end: match.index + match[0].length,
      });
    } catch (e) {
      logger.warn('[ActionParser] Failed to parse rename action:', e);
    }
  }

  // Parse all delete actions
  PATTERNS.delete.lastIndex = 0;
  while ((match = PATTERNS.delete.exec(content)) !== null) {
    try {
      const action = parseDeleteAction(match);
      matches.push({
        action,
        start: match.index,
        end: match.index + match[0].length,
      });
    } catch (e) {
      logger.warn('[ActionParser] Failed to parse delete action:', e);
    }
  }

  // Parse all shell actions
  PATTERNS.shell.lastIndex = 0;
  while ((match = PATTERNS.shell.exec(content)) !== null) {
    try {
      const action = parseShellAction(match);
      matches.push({
        action,
        start: match.index,
        end: match.index + match[0].length,
      });
    } catch (e) {
      logger.warn('[ActionParser] Failed to parse shell action:', e);
    }
  }

  // Parse all dependency actions
  PATTERNS.dependency.lastIndex = 0;
  while ((match = PATTERNS.dependency.exec(content)) !== null) {
    try {
      const action = parseDependencyAction(match);
      if (action.packageName) {
        matches.push({
          action,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    } catch (e) {
      logger.warn('[ActionParser] Failed to parse dependency action:', e);
    }
  }

  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);

  // Extract actions in order
  for (const m of matches) {
    actions.push(m.action);
  }

  // Calculate text segments (content between actions)
  const textSegments: Array<{ start: number; end: number; text: string }> = [];
  let currentIndex = 0;

  for (const m of matches) {
    if (m.start > currentIndex) {
      const text = content.slice(currentIndex, m.start);
      if (text.trim()) {
        textSegments.push({
          start: currentIndex,
          end: m.start,
          text: text.trim(),
        });
      }
    }
    currentIndex = m.end;
  }

  // Add remaining text after last action
  if (currentIndex < content.length) {
    const text = content.slice(currentIndex);
    if (text.trim()) {
      textSegments.push({
        start: currentIndex,
        end: content.length,
        text: text.trim(),
      });
    }
  }

  return {
    actions,
    textSegments,
    hasActions: actions.length > 0,
  };
}

/**
 * Check if content contains any action tags.
 * This is a fast check that doesn't parse the full content.
 */
export function hasActionTags(content: string): boolean {
  return /<recoder-(write|rename|delete|shell|dependency)/.test(content);
}

/**
 * Extract just the text content from an AI response, removing all action tags.
 */
export function stripActionTags(content: string): string {
  let result = content;

  // Remove all action tags
  result = result.replace(PATTERNS.write, '');
  result = result.replace(PATTERNS.rename, '');
  result = result.replace(PATTERNS.delete, '');
  result = result.replace(PATTERNS.shell, '');
  result = result.replace(PATTERNS.dependency, '');

  // Clean up excessive whitespace
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.trim();

  return result;
}

/**
 * Get actions of a specific type from a parse result.
 */
export function getActionsByType<T extends ParsedAction>(
  result: ParseResult,
  type: ActionType
): T[] {
  return result.actions.filter((a) => a.type === type) as T[];
}

/**
 * Get all file paths affected by actions.
 * Includes paths from write, rename (both from and to), and delete actions.
 */
export function getAffectedPaths(result: ParseResult): string[] {
  const paths = new Set<string>();

  for (const action of result.actions) {
    switch (action.type) {
      case 'write':
      case 'delete':
        paths.add(action.path);
        break;
      case 'rename':
        paths.add(action.from);
        paths.add(action.to);
        break;
    }
  }

  return Array.from(paths);
}

/**
 * Validate an action for common issues.
 */
export function validateAction(action: ParsedAction): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  switch (action.type) {
    case 'write':
      if (!action.path) {
        errors.push('Write action missing path');
      }
      if (action.path.includes('..')) {
        errors.push('Write action path contains directory traversal');
      }
      break;

    case 'rename':
      if (!action.from) {
        errors.push('Rename action missing source path');
      }
      if (!action.to) {
        errors.push('Rename action missing destination path');
      }
      if (action.from === action.to) {
        errors.push('Rename action source and destination are the same');
      }
      break;

    case 'delete':
      if (!action.path) {
        errors.push('Delete action missing path');
      }
      if (action.path.includes('..')) {
        errors.push('Delete action path contains directory traversal');
      }
      break;

    case 'shell':
      if (!action.command) {
        errors.push('Shell action missing command');
      }
      // Warn about potentially dangerous commands
      const dangerousPatterns = [
        /rm\s+-rf\s+\/(?!\w)/, // rm -rf / (but allow /project paths)
        /:\s*\(\)\s*\{.*\};/, // Fork bomb pattern
        />\s*\/dev\/sd/, // Write to disk devices
      ];
      for (const pattern of dangerousPatterns) {
        if (pattern.test(action.command)) {
          errors.push('Shell action contains potentially dangerous command');
          break;
        }
      }
      break;

    case 'dependency':
      if (!action.packageName) {
        errors.push('Dependency action missing package name');
      }
      // Check for potentially malicious package name patterns
      if (action.packageName.includes('..') || action.packageName.includes('/')) {
        errors.push('Dependency action package name is invalid');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate all actions in a parse result.
 */
export function validateAllActions(result: ParseResult): {
  valid: boolean;
  actionErrors: Map<string, string[]>;
} {
  const actionErrors = new Map<string, string[]>();
  let allValid = true;

  for (const action of result.actions) {
    const validation = validateAction(action);
    if (!validation.valid) {
      allValid = false;
      actionErrors.set(action.id, validation.errors);
    }
  }

  return {
    valid: allValid,
    actionErrors,
  };
}

/**
 * Create a summary of actions for display purposes.
 */
export function createActionSummary(result: ParseResult): string {
  if (!result.hasActions) {
    return 'No actions found';
  }

  const counts = {
    write: 0,
    rename: 0,
    delete: 0,
    shell: 0,
    dependency: 0,
  };

  for (const action of result.actions) {
    counts[action.type]++;
  }

  const parts: string[] = [];
  if (counts.write > 0) {
    parts.push(`${counts.write} file${counts.write > 1 ? 's' : ''} to write`);
  }
  if (counts.rename > 0) {
    parts.push(`${counts.rename} file${counts.rename > 1 ? 's' : ''} to rename`);
  }
  if (counts.delete > 0) {
    parts.push(`${counts.delete} file${counts.delete > 1 ? 's' : ''} to delete`);
  }
  if (counts.shell > 0) {
    parts.push(`${counts.shell} command${counts.shell > 1 ? 's' : ''} to run`);
  }
  if (counts.dependency > 0) {
    parts.push(`${counts.dependency} package${counts.dependency > 1 ? 's' : ''} to install`);
  }

  return parts.join(', ');
}

// ============================================================================
// Message Block Parsing
// ============================================================================

// Regex patterns for matching message block tags
const MESSAGE_BLOCK_PATTERNS = {
  // <recoder-thinking>AI reasoning process</recoder-thinking>
  thinking: /<recoder-thinking>([\s\S]*?)<\/recoder-thinking>/g,

  // <recoder-error>Error message</recoder-error>
  error: /<recoder-error>([\s\S]*?)<\/recoder-error>/g,

  // <recoder-success>Success message</recoder-success>
  success: /<recoder-success>([\s\S]*?)<\/recoder-success>/g,

  // <recoder-warning>Warning message</recoder-warning>
  warning: /<recoder-warning>([\s\S]*?)<\/recoder-warning>/g,

  // <recoder-info>Info message</recoder-info>
  info: /<recoder-info>([\s\S]*?)<\/recoder-info>/g,

  // <recoder-code lang="ts">code content</recoder-code>
  // Also supports language attribute
  code: /<recoder-code(?:\s+(?:lang|language)="([^"]+)")?\s*>([\s\S]*?)<\/recoder-code>/g,

  // <console-logs>terminal output</console-logs>
  console: /<console-logs>([\s\S]*?)<\/console-logs>/g,

  // <current-route>/path/to/route</current-route>
  route: /<current-route>([\s\S]*?)<\/current-route>/g,

  // <recoder-diff>diff content</recoder-diff>
  diff: /<recoder-diff>([\s\S]*?)<\/recoder-diff>/g,
};

// Generate unique block ID
let blockIdCounter = 0;
function generateBlockId(): string {
  return `block_${Date.now()}_${++blockIdCounter}`;
}

/**
 * Parse a message block from a regex match.
 */
function parseMessageBlock(
  type: MessageBlockType,
  match: RegExpExecArray
): MessageBlock {
  let content: string;
  let language: string | undefined;

  if (type === 'code') {
    // Code blocks have optional language attribute
    language = match[1]?.trim() || 'plaintext';
    content = match[2] || '';
  } else {
    content = match[1] || '';
  }

  // Trim content but preserve internal whitespace
  content = content.trim();

  // Unescape HTML entities
  content = unescapeContent(content);

  return {
    id: generateBlockId(),
    type,
    content,
    raw: match[0],
    index: match.index,
    language,
  };
}

/**
 * Parse all message blocks from an AI response string.
 *
 * @param content - The AI response content to parse
 * @returns MessageBlockParseResult with all found blocks and text segments
 */
export function parseMessageBlocks(content: string): MessageBlockParseResult {
  const blocks: MessageBlock[] = [];
  const matches: Array<{ block: MessageBlock; start: number; end: number }> = [];

  // Parse all block types
  for (const [type, pattern] of Object.entries(MESSAGE_BLOCK_PATTERNS)) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      try {
        const block = parseMessageBlock(type as MessageBlockType, match);
        matches.push({
          block,
          start: match.index,
          end: match.index + match[0].length,
        });
      } catch (e) {
        logger.warn(`[ActionParser] Failed to parse ${type} block:`, e);
      }
    }
  }

  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);

  // Extract blocks in order
  for (const m of matches) {
    blocks.push(m.block);
  }

  // Calculate text segments (content between blocks)
  const textSegments: Array<{ start: number; end: number; text: string }> = [];
  let currentIndex = 0;

  for (const m of matches) {
    if (m.start > currentIndex) {
      const text = content.slice(currentIndex, m.start);
      if (text.trim()) {
        textSegments.push({
          start: currentIndex,
          end: m.start,
          text: text.trim(),
        });
      }
    }
    currentIndex = m.end;
  }

  // Add remaining text after last block
  if (currentIndex < content.length) {
    const text = content.slice(currentIndex);
    if (text.trim()) {
      textSegments.push({
        start: currentIndex,
        end: content.length,
        text: text.trim(),
      });
    }
  }

  return {
    blocks,
    textSegments,
    hasBlocks: blocks.length > 0,
  };
}

/**
 * Check if content contains any message block tags.
 * This is a fast check that doesn't parse the full content.
 */
export function hasMessageBlockTags(content: string): boolean {
  return /<(recoder-(thinking|error|success|warning|info|code|diff)|console-logs|current-route)/.test(
    content
  );
}

/**
 * Extract just the text content from an AI response, removing all message block tags.
 */
export function stripMessageBlockTags(content: string): string {
  let result = content;

  // Remove all message block tags
  for (const pattern of Object.values(MESSAGE_BLOCK_PATTERNS)) {
    result = result.replace(pattern, '');
  }

  // Clean up excessive whitespace
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.trim();

  return result;
}

/**
 * Get blocks of a specific type from a parse result.
 */
export function getBlocksByType(
  result: MessageBlockParseResult,
  type: MessageBlockType
): MessageBlock[] {
  return result.blocks.filter((b) => b.type === type);
}

/**
 * Check if content has any special tags (actions or message blocks).
 */
export function hasAnySpecialTags(content: string): boolean {
  return hasActionTags(content) || hasMessageBlockTags(content);
}

/**
 * Parse both actions and message blocks from content.
 * Returns a combined result with all parsed elements.
 */
export function parseAllTags(content: string): {
  actions: ParseResult;
  blocks: MessageBlockParseResult;
  hasAny: boolean;
} {
  const actions = parseActions(content);
  const blocks = parseMessageBlocks(content);

  return {
    actions,
    blocks,
    hasAny: actions.hasActions || blocks.hasBlocks,
  };
}
