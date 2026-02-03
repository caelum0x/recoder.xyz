/**
 * AI Utils
 * Utility functions for AI generation
 * Adapted from Libra's AI utils
 */

import type { ImageData, MessageContent, SelectedItem } from './types';

// ============================================================================
// Regex Patterns
// ============================================================================

const CHINESE_REGEX = /[\u4E00-\u9FFF]/;

// ============================================================================
// Language Detection
// ============================================================================

/**
 * Check if text contains Chinese characters
 */
export function containsChinese(text: string): boolean {
  return CHINESE_REGEX.test(text);
}

/**
 * Detect the primary language of the text
 */
export function detectLanguage(text: string): 'chinese' | 'english' | 'unknown' {
  if (containsChinese(text)) {
    return 'chinese';
  }
  // Basic English detection - contains primarily ASCII letters
  const asciiLetters = text.match(/[a-zA-Z]/g)?.length || 0;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars > 0 && asciiLetters / totalChars > 0.5) {
    return 'english';
  }
  return 'unknown';
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build user prompt with XML files and user request
 */
export function buildUserPrompt(
  files: string,
  query: string,
  knowledge?: string | null
): string {
  const userRequestXml = `<userRequest>${query}</userRequest>`;
  const knowledgeSection = knowledge
    ? `\n<projectKnowledge>\n${knowledge}\n</projectKnowledge>\n`
    : '';

  return `Following below are the project XML and the user request.

${files}
${knowledgeSection}
${userRequestXml}`.trim();
}

/**
 * Build selected elements info string
 */
export function buildSelectedElementsInfo(selectedItems: SelectedItem[]): string {
  if (!selectedItems || selectedItems.length === 0) return '';
  return `\n\nSelected elements info:\n${JSON.stringify(selectedItems, null, 2)}`;
}

/**
 * Build message content array with optional image
 */
export function buildMessageContent(
  basePrompt: string,
  imageData?: ImageData | null
): MessageContent[] {
  const content: MessageContent[] = [{ type: 'text', text: basePrompt }];

  if (imageData) {
    content.push({
      type: 'image',
      image: new Uint8Array(imageData.data),
      mimeType: imageData.contentType,
    });
  }

  return content;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate abort signal and throw error if aborted
 */
export function validateAbortSignal(abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted) {
    throw new Error('Request was aborted');
  }
}

/**
 * Check if a string is a valid JSON
 */
export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// String Processing
// ============================================================================

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Strip CDATA wrappers from content
 */
export function stripCDATA(content: string): string {
  return content
    .replace(/^\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*$/, '')
    .trim();
}

/**
 * Wrap content in CDATA
 */
export function wrapInCDATA(content: string): string {
  return `<![CDATA[\n${content}\n]]>`;
}

/**
 * Escape XML special characters
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Unescape XML special characters
 */
export function unescapeXml(text: string): string {
  return text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Extract directory name from a path
 */
export function dirname(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) return '.';
  if (lastSlash === 0) return '/';
  return path.substring(0, lastSlash);
}

/**
 * Extract file name from a path
 */
export function basename(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? path : path.substring(lastSlash + 1);
}

/**
 * Normalize a file path (remove ./, resolve ..)
 */
export function normalizePath(path: string): string {
  // Remove leading ./
  let normalized = path.replace(/^\.\//, '');

  // Split into parts and resolve ..
  const parts = normalized.split('/');
  const result: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }

  return result.join('/');
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Try-catch wrapper that returns [result, error] tuple
 */
export async function tryCatch<T>(
  fn: () => T | Promise<T>
): Promise<[T | null, Error | null]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
}

/**
 * Try-catch wrapper (synchronous version)
 */
export function tryCatchSync<T>(fn: () => T): [T | null, Error | null] {
  try {
    const result = fn();
    return [result, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for a string (rough approximation)
 * Uses the rule of thumb: ~4 characters per token for English
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // More accurate estimation considering:
  // - English: ~4 chars per token
  // - Code: ~3 chars per token (more symbols/keywords)
  // - Chinese: ~1.5 chars per token

  const hasCode = /[{}\[\]();=<>]/.test(text);
  const hasChinese = containsChinese(text);

  if (hasChinese) {
    // Mixed content - use average
    return Math.ceil(text.length / 2.5);
  }
  if (hasCode) {
    return Math.ceil(text.length / 3);
  }
  return Math.ceil(text.length / 4);
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Format duration in human readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// ============================================================================
// UUID Generation
// ============================================================================

/**
 * Generate a simple UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a short ID (8 characters)
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10);
}
