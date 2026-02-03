/**
 * Text utility functions for diff strategies
 * Provides text normalization, line number handling, and output processing
 */

/**
 * Common character mappings for normalization
 */
export const NORMALIZATION_MAPS = {
  // Smart quotes to regular quotes
  SMART_QUOTES: {
    '\u201C': '"', // Left double quote (U+201C)
    '\u201D': '"', // Right double quote (U+201D)
    '\u2018': "'", // Left single quote (U+2018)
    '\u2019': "'", // Right single quote (U+2019)
  } as Record<string, string>,
  // Other typographic characters
  TYPOGRAPHIC: {
    '\u2026': '...', // Ellipsis
    '\u2014': '-', // Em dash
    '\u2013': '-', // En dash
    '\u00A0': ' ', // Non-breaking space
  } as Record<string, string>,
};

/**
 * Options for string normalization
 */
export interface NormalizeOptions {
  smartQuotes?: boolean; // Replace smart quotes with straight quotes
  typographicChars?: boolean; // Replace typographic characters
  extraWhitespace?: boolean; // Collapse multiple whitespace to single space
  trim?: boolean; // Trim whitespace from start and end
}

/**
 * Default options for normalization
 */
const DEFAULT_OPTIONS: NormalizeOptions = {
  smartQuotes: true,
  typographicChars: true,
  extraWhitespace: true,
  trim: true,
};

/**
 * Normalizes a string based on the specified options
 * Handles smart quotes, typographic characters, and whitespace
 *
 * @param str The string to normalize
 * @param options Normalization options
 * @returns The normalized string
 */
export function normalizeString(
  str: string,
  options: NormalizeOptions = DEFAULT_OPTIONS
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let normalized = str;

  // Replace smart quotes
  if (opts.smartQuotes) {
    for (const [smart, regular] of Object.entries(NORMALIZATION_MAPS.SMART_QUOTES)) {
      normalized = normalized.replace(new RegExp(smart, 'g'), regular);
    }
  }

  // Replace typographic characters
  if (opts.typographicChars) {
    for (const [typographic, regular] of Object.entries(NORMALIZATION_MAPS.TYPOGRAPHIC)) {
      normalized = normalized.replace(new RegExp(typographic, 'g'), regular);
    }
  }

  // Normalize whitespace
  if (opts.extraWhitespace) {
    normalized = normalized.replace(/\s+/g, ' ');
  }

  // Trim whitespace
  if (opts.trim) {
    normalized = normalized.trim();
  }

  return normalized;
}

/**
 * Unescapes common HTML entities in a string
 *
 * @param text The string containing HTML entities to unescape
 * @returns The unescaped string with HTML entities converted to their literal characters
 */
export function unescapeHtmlEntities(text: string): string {
  if (!text) return text;

  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&lsqb;/g, '[')
    .replace(/&rsqb;/g, ']')
    .replace(/&amp;/g, '&');
}

/**
 * Add line numbers to content
 * Format: "  1 | content"
 *
 * @param content The content to add line numbers to
 * @param startLine The starting line number (default: 1)
 * @returns Content with line numbers added
 */
export function addLineNumbers(content: string, startLine: number = 1): string {
  // If content is empty, return empty string - empty files should not have line numbers
  // If content is empty but startLine > 1, return "startLine | " because we know the file is not empty
  // but the content is empty at that line offset
  if (content === '') {
    return startLine === 1 ? '' : `${startLine} | \n`;
  }

  // Split into lines and handle trailing line feeds (\n)
  const lines = content.split('\n');
  const lastLineEmpty = lines[lines.length - 1] === '';
  if (lastLineEmpty) {
    lines.pop();
  }

  const maxLineNumberWidth = String(startLine + lines.length - 1).length;
  const numberedContent = lines
    .map((line, index) => {
      const lineNumber = String(startLine + index).padStart(maxLineNumberWidth, ' ');
      return `${lineNumber} | ${line}`;
    })
    .join('\n');

  return numberedContent + '\n';
}

/**
 * Checks if every line in the content has line numbers prefixed
 * Line numbers must be followed by a single pipe character (not double pipes)
 *
 * @param content The content to check
 * @returns True if every line has line numbers
 */
export function everyLineHasLineNumbers(content: string): boolean {
  const lines = content.split(/\r?\n/); // Handles both CRLF and LF line endings
  return lines.length > 0 && lines.every((line) => /^\s*\d+\s+\|(?!\|)/.test(line));
}

/**
 * Strips line numbers from content while preserving the actual content.
 *
 * @param content The content to process
 * @param aggressive When false (default): Only strips lines with clear number patterns like "123 | content"
 *                   When true: Uses a more lenient pattern that also matches lines with just a pipe character,
 *                   which can be useful when LLMs don't perfectly format the line numbers in diffs
 * @returns The content with line numbers removed
 */
export function stripLineNumbers(content: string, aggressive: boolean = false): string {
  // Split into lines to handle each line individually
  const lines = content.split(/\r?\n/);

  // Process each line
  const processedLines = lines.map((line) => {
    // Match line number pattern and capture everything after the pipe
    const match = aggressive
      ? line.match(/^\s*(?:\d+\s)?\|\s(.*)$/)
      : line.match(/^\s*\d+\s+\|(?!\|)\s?(.*)$/);
    return match ? match[1] : line;
  });

  // Join back with original line endings (carriage return + line feed or just line feed)
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
  let result = processedLines.join(lineEnding);

  // Preserve trailing newline if present in original content
  if (content.endsWith(lineEnding)) {
    if (!result.endsWith(lineEnding)) {
      result += lineEnding;
    }
  }

  return result;
}

/**
 * Truncates multi-line output while preserving context from both the beginning and end.
 * When truncation is needed, it keeps 20% of the lines from the start and 80% from the end,
 * with a clear indicator of how many lines were omitted in between.
 *
 * @param content The multi-line string to truncate
 * @param lineLimit Optional maximum number of lines to keep
 * @param characterLimit Optional maximum number of characters to keep (takes priority)
 * @returns The truncated string with an indicator of omitted content
 */
export function truncateOutput(
  content: string,
  lineLimit?: number,
  characterLimit?: number
): string {
  // If no limits are specified, return original content
  if (!lineLimit && !characterLimit) {
    return content;
  }

  // Character limit takes priority over line limit
  if (characterLimit && content.length > characterLimit) {
    const beforeLimit = Math.floor(characterLimit * 0.2); // 20% of characters before
    const afterLimit = characterLimit - beforeLimit; // remaining 80% after

    const startSection = content.slice(0, beforeLimit);
    const endSection = content.slice(-afterLimit);
    const omittedChars = content.length - characterLimit;

    return startSection + `\n[...${omittedChars} characters omitted...]\n` + endSection;
  }

  // If character limit is not exceeded or not specified, check line limit
  if (!lineLimit) {
    return content;
  }

  // Count total lines
  let totalLines = 0;
  let pos = -1;
  while ((pos = content.indexOf('\n', pos + 1)) !== -1) {
    totalLines++;
  }
  totalLines++; // Account for last line without line feed

  if (totalLines <= lineLimit) {
    return content;
  }

  const beforeLimit = Math.floor(lineLimit * 0.2); // 20% of lines before
  const afterLimit = lineLimit - beforeLimit; // remaining 80% after

  // Find start section end position
  let startEndPos = -1;
  let lineCount = 0;
  pos = 0;
  while (lineCount < beforeLimit && (pos = content.indexOf('\n', pos)) !== -1) {
    startEndPos = pos;
    lineCount++;
    pos++;
  }

  // Find end section start position
  let endStartPos = content.length;
  lineCount = 0;
  pos = content.length;
  while (lineCount < afterLimit && (pos = content.lastIndexOf('\n', pos - 1)) !== -1) {
    endStartPos = pos + 1; // Start after the line feed
    lineCount++;
  }

  const omittedLines = totalLines - lineLimit;
  const startSection = content.slice(0, startEndPos + 1);
  const endSection = content.slice(endStartPos);
  return startSection + `\n[...${omittedLines} lines omitted...]\n\n` + endSection;
}
