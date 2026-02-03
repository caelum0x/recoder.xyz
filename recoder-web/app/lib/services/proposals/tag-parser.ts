/**
 * Tag Parser for Proposals
 *
 * Parses recoder-specific XML tags from AI responses to extract:
 * - File writes (<recoder-write>)
 * - File renames (<recoder-rename>)
 * - File deletions (<recoder-delete>)
 * - Package dependencies (<recoder-dependency>)
 * - SQL queries (<recoder-sql>)
 * - Chat summaries (<recoder-summary>)
 * - Commands (<recoder-command>)
 * - Search/replace edits (<recoder-search-replace>)
 */

import type { SqlQuery } from './types';

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Normalize the path to use forward slashes instead of backslashes.
 * This is important to prevent issues, particularly on Windows.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

// =============================================================================
// XML Escape Utilities
// =============================================================================

/**
 * Escapes special characters in XML attribute values.
 */
export function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Unescapes XML attribute values.
 */
export function unescapeXmlAttr(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/**
 * Escapes special characters in XML content (text between tags).
 */
export function escapeXmlContent(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Unescapes XML content values.
 */
export function unescapeXmlContent(str: string): string {
  return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// =============================================================================
// Write Tag Parser
// =============================================================================

export interface WriteTag {
  path: string;
  content: string;
  description?: string;
}

/**
 * Extract all <recoder-write> tags from a response.
 * Supports both recoder-write and legacy dyad-write tags.
 */
export function getWriteTags(fullResponse: string): WriteTag[] {
  // Match both recoder-write and dyad-write tags
  const recoderWriteRegex = /<recoder-write([^>]*)>([\s\S]*?)<\/recoder-write>/gi;
  const dyadWriteRegex = /<dyad-write([^>]*)>([\s\S]*?)<\/dyad-write>/gi;
  const pathRegex = /(?:path|file_path)="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  const tags: WriteTag[] = [];

  // Process recoder-write tags
  let match;
  while ((match = recoderWriteRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1];
    let content = unescapeXmlContent(match[2].trim());

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = unescapeXmlAttr(pathMatch[1]);
      const description = descriptionMatch?.[1]
        ? unescapeXmlAttr(descriptionMatch[1])
        : undefined;

      // Remove markdown code fences if present
      const contentLines = content.split('\n');
      if (contentLines[0]?.startsWith('```')) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith('```')) {
        contentLines.pop();
      }
      content = contentLines.join('\n');

      tags.push({ path: normalizePath(path), content, description });
    }
  }

  // Process legacy dyad-write tags
  while ((match = dyadWriteRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1];
    let content = unescapeXmlContent(match[2].trim());

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = unescapeXmlAttr(pathMatch[1]);
      const description = descriptionMatch?.[1]
        ? unescapeXmlAttr(descriptionMatch[1])
        : undefined;

      const contentLines = content.split('\n');
      if (contentLines[0]?.startsWith('```')) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith('```')) {
        contentLines.pop();
      }
      content = contentLines.join('\n');

      tags.push({ path: normalizePath(path), content, description });
    }
  }

  return tags;
}

// =============================================================================
// Rename Tag Parser
// =============================================================================

export interface RenameTag {
  from: string;
  to: string;
}

/**
 * Extract all <recoder-rename> tags from a response.
 */
export function getRenameTags(fullResponse: string): RenameTag[] {
  const recoderRenameRegex =
    /<recoder-rename\s+from="([^"]+)"\s+to="([^"]+)"[^>]*>(?:[\s\S]*?<\/recoder-rename>)?/g;
  const dyadRenameRegex =
    /<dyad-rename\s+from="([^"]+)"\s+to="([^"]+)"[^>]*>(?:[\s\S]*?<\/dyad-rename>)?/g;

  const tags: RenameTag[] = [];
  let match;

  while ((match = recoderRenameRegex.exec(fullResponse)) !== null) {
    tags.push({
      from: normalizePath(unescapeXmlAttr(match[1])),
      to: normalizePath(unescapeXmlAttr(match[2])),
    });
  }

  while ((match = dyadRenameRegex.exec(fullResponse)) !== null) {
    tags.push({
      from: normalizePath(unescapeXmlAttr(match[1])),
      to: normalizePath(unescapeXmlAttr(match[2])),
    });
  }

  return tags;
}

// =============================================================================
// Delete Tag Parser
// =============================================================================

/**
 * Extract all <recoder-delete> tags from a response.
 */
export function getDeleteTags(fullResponse: string): string[] {
  const recoderDeleteRegex =
    /<recoder-delete\s+(?:path|file_path)="([^"]+)"[^>]*>(?:[\s\S]*?<\/recoder-delete>)?/g;
  const dyadDeleteRegex =
    /<dyad-delete\s+path="([^"]+)"[^>]*>(?:[\s\S]*?<\/dyad-delete>)?/g;

  const paths: string[] = [];
  let match;

  while ((match = recoderDeleteRegex.exec(fullResponse)) !== null) {
    paths.push(normalizePath(unescapeXmlAttr(match[1])));
  }

  while ((match = dyadDeleteRegex.exec(fullResponse)) !== null) {
    paths.push(normalizePath(unescapeXmlAttr(match[1])));
  }

  return paths;
}

// =============================================================================
// Dependency Tag Parser
// =============================================================================

/**
 * Extract all <recoder-dependency> tags from a response.
 * Returns list of package names to install.
 */
export function getDependencyTags(fullResponse: string): string[] {
  const recoderDependencyRegex =
    /<recoder-dependency(?:\s+packages="([^"]+)")?>([^<]*)<\/recoder-dependency>/g;
  const dyadDependencyRegex =
    /<dyad-add-dependency\s+packages="([^"]+)">[^<]*<\/dyad-add-dependency>/g;

  const packages: string[] = [];
  let match;

  while ((match = recoderDependencyRegex.exec(fullResponse)) !== null) {
    // packages attribute takes precedence
    const packagesAttr = match[1];
    const content = match[2]?.trim();

    if (packagesAttr) {
      packages.push(...unescapeXmlAttr(packagesAttr).split(/\s+/));
    } else if (content) {
      packages.push(...content.split(/\s+/));
    }
  }

  while ((match = dyadDependencyRegex.exec(fullResponse)) !== null) {
    packages.push(...unescapeXmlAttr(match[1]).split(/\s+/));
  }

  // Filter empty strings and deduplicate
  return [...new Set(packages.filter(Boolean))];
}

// =============================================================================
// SQL Tag Parser
// =============================================================================

/**
 * Extract all <recoder-sql> or <recoder-execute-sql> tags from a response.
 */
export function getSqlTags(fullResponse: string): SqlQuery[] {
  const recoderSqlRegex = /<recoder-(?:execute-)?sql([^>]*)>([\s\S]*?)<\/recoder-(?:execute-)?sql>/g;
  const dyadSqlRegex = /<dyad-execute-sql([^>]*)>([\s\S]*?)<\/dyad-execute-sql>/g;
  const descriptionRegex = /description="([^"]+)"/;

  const queries: SqlQuery[] = [];
  let match;

  while ((match = recoderSqlRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || '';
    let content = unescapeXmlContent(match[2].trim());
    const descriptionMatch = descriptionRegex.exec(attributesString);
    const description = descriptionMatch?.[1]
      ? unescapeXmlAttr(descriptionMatch[1])
      : undefined;

    // Handle markdown code blocks if present
    const contentLines = content.split('\n');
    if (contentLines[0]?.startsWith('```')) {
      contentLines.shift();
    }
    if (contentLines[contentLines.length - 1]?.startsWith('```')) {
      contentLines.pop();
    }
    content = contentLines.join('\n');

    queries.push({ content, description });
  }

  while ((match = dyadSqlRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || '';
    let content = unescapeXmlContent(match[2].trim());
    const descriptionMatch = descriptionRegex.exec(attributesString);
    const description = descriptionMatch?.[1]
      ? unescapeXmlAttr(descriptionMatch[1])
      : undefined;

    const contentLines = content.split('\n');
    if (contentLines[0]?.startsWith('```')) {
      contentLines.shift();
    }
    if (contentLines[contentLines.length - 1]?.startsWith('```')) {
      contentLines.pop();
    }
    content = contentLines.join('\n');

    queries.push({ content, description });
  }

  return queries;
}

// =============================================================================
// Summary Tag Parser
// =============================================================================

/**
 * Extract <recoder-summary> or <recoder-chat-summary> tag content.
 */
export function getSummaryTag(fullResponse: string): string | null {
  const recoderSummaryRegex =
    /<recoder-(?:chat-)?summary>([\s\S]*?)<\/recoder-(?:chat-)?summary>/g;
  const dyadSummaryRegex = /<dyad-chat-summary>([\s\S]*?)<\/dyad-chat-summary>/g;

  let match = recoderSummaryRegex.exec(fullResponse);
  if (match && match[1]) {
    return unescapeXmlContent(match[1].trim());
  }

  match = dyadSummaryRegex.exec(fullResponse);
  if (match && match[1]) {
    return unescapeXmlContent(match[1].trim());
  }

  return null;
}

// =============================================================================
// Command Tag Parser
// =============================================================================

export type CommandType = 'rebuild' | 'restart' | 'refresh' | 'install';

/**
 * Extract all <recoder-command> tags from a response.
 */
export function getCommandTags(fullResponse: string): CommandType[] {
  const recoderCommandRegex =
    /<recoder-command\s+type="([^"]+)"[^>]*><\/recoder-command>/g;
  const dyadCommandRegex =
    /<dyad-command\s+type="([^"]+)"[^>]*><\/dyad-command>/g;

  const commands: CommandType[] = [];
  let match;

  while ((match = recoderCommandRegex.exec(fullResponse)) !== null) {
    const type = unescapeXmlAttr(match[1]) as CommandType;
    if (['rebuild', 'restart', 'refresh', 'install'].includes(type)) {
      commands.push(type);
    }
  }

  while ((match = dyadCommandRegex.exec(fullResponse)) !== null) {
    const type = unescapeXmlAttr(match[1]) as CommandType;
    if (['rebuild', 'restart', 'refresh', 'install'].includes(type)) {
      commands.push(type);
    }
  }

  return commands;
}

// =============================================================================
// Search/Replace Tag Parser
// =============================================================================

export interface SearchReplaceTag {
  path: string;
  content: string;
  description?: string;
}

/**
 * Extract all <recoder-search-replace> tags from a response.
 */
export function getSearchReplaceTags(fullResponse: string): SearchReplaceTag[] {
  const recoderSearchReplaceRegex =
    /<recoder-search-replace([^>]*)>([\s\S]*?)<\/recoder-search-replace>/gi;
  const dyadSearchReplaceRegex =
    /<dyad-search-replace([^>]*)>([\s\S]*?)<\/dyad-search-replace>/gi;
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  const tags: SearchReplaceTag[] = [];
  let match;

  while ((match = recoderSearchReplaceRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || '';
    let content = unescapeXmlContent(match[2].trim());

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = unescapeXmlAttr(pathMatch[1]);
      const description = descriptionMatch?.[1]
        ? unescapeXmlAttr(descriptionMatch[1])
        : undefined;

      const contentLines = content.split('\n');
      if (contentLines[0]?.startsWith('```')) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith('```')) {
        contentLines.pop();
      }
      content = contentLines.join('\n');

      tags.push({ path: normalizePath(path), content, description });
    }
  }

  while ((match = dyadSearchReplaceRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || '';
    let content = unescapeXmlContent(match[2].trim());

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = unescapeXmlAttr(pathMatch[1]);
      const description = descriptionMatch?.[1]
        ? unescapeXmlAttr(descriptionMatch[1])
        : undefined;

      const contentLines = content.split('\n');
      if (contentLines[0]?.startsWith('```')) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith('```')) {
        contentLines.pop();
      }
      content = contentLines.join('\n');

      tags.push({ path: normalizePath(path), content, description });
    }
  }

  return tags;
}

// =============================================================================
// Shell Command Tag Parser
// =============================================================================

/**
 * Extract all <recoder-shell> tags from a response.
 */
export function getShellTags(fullResponse: string): string[] {
  const recoderShellRegex = /<recoder-shell>([\s\S]*?)<\/recoder-shell>/g;

  const commands: string[] = [];
  let match;

  while ((match = recoderShellRegex.exec(fullResponse)) !== null) {
    const command = unescapeXmlContent(match[1].trim());
    if (command) {
      commands.push(command);
    }
  }

  return commands;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if response contains any actionable tags.
 */
export function hasActionableTags(fullResponse: string): boolean {
  return (
    /<(?:recoder|dyad)-(?:write|rename|delete|dependency|add-dependency|sql|execute-sql|search-replace|shell|command)/.test(
      fullResponse
    )
  );
}

/**
 * Count the number of lines in a code block.
 */
export function countLines(content: string): number {
  return content.split('\n').length;
}

/**
 * Get the file extension from a path.
 */
export function getFileExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  if (lastDot === -1) return '';
  return path.slice(lastDot + 1).toLowerCase();
}

/**
 * Check if a path is a server function (API route, edge function, etc.).
 */
export function isServerFunction(path: string): boolean {
  const normalizedPath = normalizePath(path).toLowerCase();

  // Check for common server function patterns
  const serverPatterns = [
    /\/api\//,
    /\/server\//,
    /\/actions\//,
    /\.server\./,
    /\/edge-functions\//,
    /\/supabase\/functions\//,
    /\/functions\//,
    /\/workers\//,
    /route\.(ts|js)$/,
    /\+server\.(ts|js)$/,
    /\+page\.server\.(ts|js)$/,
  ];

  return serverPatterns.some((pattern) => pattern.test(normalizedPath));
}

/**
 * Extract all tags from a response for proposal generation.
 */
export function parseAllTags(fullResponse: string) {
  return {
    writes: getWriteTags(fullResponse),
    renames: getRenameTags(fullResponse),
    deletes: getDeleteTags(fullResponse),
    dependencies: getDependencyTags(fullResponse),
    sqlQueries: getSqlTags(fullResponse),
    summary: getSummaryTag(fullResponse),
    commands: getCommandTags(fullResponse),
    searchReplaces: getSearchReplaceTags(fullResponse),
    shellCommands: getShellTags(fullResponse),
  };
}
