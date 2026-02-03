/**
 * Agent Tools - Shared Types and Utilities
 *
 * These are autonomous code modification tools with safety checks
 * that can be called by an AI agent.
 */

import { z } from 'zod';

// ============================================================================
// XML Escape Helpers
// ============================================================================

/**
 * Escape special characters in XML attribute values
 */
export function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Unescape XML attribute values
 */
export function unescapeXmlAttr(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Escape special characters in XML content
 */
export function escapeXmlContent(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Unescape XML content
 */
export function unescapeXmlContent(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// ============================================================================
// Agent Context
// ============================================================================

/**
 * Context passed to tool execution
 */
export interface AgentContext {
  /** The project ID in the docker backend */
  projectId: string;
  /** Base path for the project (relative path prefix) */
  basePath?: string;
  /** Chat/session ID for tracking */
  chatId?: string;
  /** Request ID for tracing */
  requestId?: string;
  /** Whether the agent can modify files */
  canModify: boolean;
  /**
   * Streams accumulated XML to UI without persisting (for live preview).
   * Call this repeatedly with the full accumulated XML so far.
   */
  onXmlStream?: (accumulatedXml: string) => void;
  /**
   * Writes final XML to UI.
   * Call this once when the tool's XML output is complete.
   */
  onXmlComplete?: (finalXml: string) => void;
  /**
   * Request user consent for an operation
   */
  requireConsent?: (params: {
    toolName: string;
    toolDescription?: string | null;
    inputPreview?: string | null;
  }) => Promise<boolean>;
  /**
   * Log a message for debugging
   */
  log?: (message: string, level?: 'debug' | 'info' | 'warn' | 'error') => void;
}

// ============================================================================
// Tool Result Types
// ============================================================================

/**
 * Tool result can be a simple string
 */
export type ToolResult = string;

/**
 * Tool execution result with status
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: ToolResult;
  error?: string;
  /** XML output for UI display */
  xml?: string;
}

// ============================================================================
// Tool Consent Types
// ============================================================================

export type AgentToolConsent = 'always' | 'ask' | 'never';

// ============================================================================
// Tool Definition Interface
// ============================================================================

export interface ToolDefinition<T = unknown> {
  /** Unique tool name */
  readonly name: string;
  /** Description for the AI agent */
  readonly description: string;
  /** Zod schema for input validation */
  readonly inputSchema: z.ZodType<T>;
  /** Default consent level */
  readonly defaultConsent: AgentToolConsent;
  /**
   * If true, this tool modifies state (files, database, etc.).
   * Used to filter out state-modifying tools in read-only mode.
   */
  readonly modifiesState?: boolean;
  /**
   * Execute the tool with validated arguments
   */
  execute: (args: T, ctx: AgentContext) => Promise<ToolResult>;
  /**
   * Check if the tool should be available in the current context
   */
  isEnabled?: (ctx: AgentContext) => boolean;
  /**
   * Returns a preview string describing what the tool will do.
   * Used for consent prompts.
   */
  getConsentPreview?: (args: T) => string;
  /**
   * Build XML from parsed partial args during streaming.
   */
  buildXml?: (args: Partial<T>, isComplete: boolean) => string | undefined;
}

// ============================================================================
// Partial JSON Parser
// ============================================================================

/**
 * Parse partial/streaming JSON into a partial object.
 * Handles incomplete JSON gracefully during streaming.
 */
export function parsePartialJson<T extends Record<string, unknown>>(
  jsonText: string,
): Partial<T> {
  if (!jsonText.trim()) {
    return {} as Partial<T>;
  }

  try {
    // Try to parse as-is first
    return JSON.parse(jsonText) as Partial<T>;
  } catch {
    // Try to repair common issues
    let repaired = jsonText.trim();

    // Add missing closing braces/brackets
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/]/g) || []).length;

    // Remove trailing comma
    repaired = repaired.replace(/,\s*$/, '');

    // Close open strings
    const quoteCount = (repaired.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }

    // Close open brackets and braces
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      repaired += ']';
    }
    for (let i = 0; i < openBraces - closeBraces; i++) {
      repaired += '}';
    }

    try {
      return JSON.parse(repaired) as Partial<T>;
    } catch {
      return {} as Partial<T>;
    }
  }
}

// ============================================================================
// Path Safety Utilities
// ============================================================================

/**
 * Normalize a file path to prevent directory traversal attacks
 */
export function normalizePath(path: string): string {
  // Remove leading/trailing whitespace
  let normalized = path.trim();

  // Normalize path separators
  normalized = normalized.replace(/\\/g, '/');

  // Remove leading slash if present
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }

  // Split into segments and filter out dangerous ones
  const segments = normalized.split('/').filter(segment => {
    // Remove empty segments
    if (!segment) return false;
    // Remove "." (current directory)
    if (segment === '.') return false;
    // Remove ".." (parent directory) - this is the key safety check
    if (segment === '..') return false;
    return true;
  });

  return segments.join('/');
}

/**
 * Check if a path is safe (no directory traversal)
 */
export function isPathSafe(path: string): boolean {
  const normalized = normalizePath(path);
  // Check that path doesn't escape the project root
  return !normalized.includes('..') && !path.startsWith('/');
}

/**
 * Join paths safely
 */
export function safeJoin(basePath: string, relativePath: string): string {
  const normalizedBase = normalizePath(basePath);
  const normalizedRelative = normalizePath(relativePath);

  if (normalizedBase) {
    return `${normalizedBase}/${normalizedRelative}`;
  }
  return normalizedRelative;
}
