/**
 * Slash Command Parser
 *
 * Parses slash commands from user input and provides fuzzy matching for suggestions.
 */

import { type Command, getAllCommands, getCommand } from '~/lib/stores/commands';

// =============================================================================
// Types
// =============================================================================

export interface SlashCommandMatch {
  /** The matched command ID (empty if partial) */
  command: string;
  /** Arguments after the command */
  args: string;
  /** Whether this is a partial match (still typing) */
  isPartial: boolean;
  /** Suggested commands for partial matches */
  suggestions: Command[];
  /** The raw input after the slash */
  rawInput: string;
}

export interface ParseResult {
  isSlashCommand: boolean;
  match: SlashCommandMatch | null;
}

// =============================================================================
// Parser Functions
// =============================================================================

/**
 * Check if input starts with a slash command
 */
export function isSlashCommand(input: string): boolean {
  return input.trimStart().startsWith('/');
}

/**
 * Parse slash command from input text
 *
 * Examples:
 *   "/test" -> { command: "test", args: "", isPartial: false }
 *   "/te" -> { command: "", args: "", isPartial: true, suggestions: [test] }
 *   "/deploy --prod" -> { command: "deploy", args: "--prod", isPartial: false }
 *   "hello /test" -> null (not at start)
 */
export function parseSlashCommand(input: string): SlashCommandMatch | null {
  const trimmed = input.trimStart();

  // Must start with /
  if (!trimmed.startsWith('/')) {
    return null;
  }

  // Extract command and args
  const afterSlash = trimmed.slice(1);
  const spaceIndex = afterSlash.indexOf(' ');

  let commandPart: string;
  let args: string;

  if (spaceIndex === -1) {
    // No space, entire thing is command (or partial)
    commandPart = afterSlash;
    args = '';
  } else {
    commandPart = afterSlash.slice(0, spaceIndex);
    args = afterSlash.slice(spaceIndex + 1).trim();
  }

  // Check if it's an exact match
  const exactMatch = getCommand(commandPart);

  if (exactMatch) {
    return {
      command: commandPart,
      args,
      isPartial: false,
      suggestions: [exactMatch],
      rawInput: afterSlash,
    };
  }

  // It's a partial match - get suggestions
  const suggestions = getCommandSuggestions(commandPart);

  return {
    command: '',
    args,
    isPartial: true,
    suggestions,
    rawInput: afterSlash,
  };
}

/**
 * Get command suggestions for partial input
 */
export function getCommandSuggestions(partial: string): Command[] {
  if (!partial) {
    // Return all commands if empty
    return getAllCommands();
  }

  const query = partial.toLowerCase();
  const commands = getAllCommands();

  // Score and sort by relevance
  const scored = commands
    .map((cmd) => ({
      cmd,
      score: getMatchScore(cmd, query),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.cmd);
}

/**
 * Fuzzy match commands
 */
export function fuzzyMatchCommands(query: string, commands: Command[]): Command[] {
  if (!query) return commands;

  const q = query.toLowerCase();

  return commands
    .map((cmd) => ({
      cmd,
      score: getMatchScore(cmd, q),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.cmd);
}

/**
 * Calculate match score for a command
 * Higher score = better match
 */
function getMatchScore(command: Command, query: string): number {
  const id = command.id.toLowerCase();
  const name = command.name.toLowerCase();
  const desc = command.description.toLowerCase();

  // Exact ID match
  if (id === query) return 100;

  // ID starts with query
  if (id.startsWith(query)) return 80;

  // Name starts with query
  if (name.startsWith(query)) return 70;

  // ID contains query
  if (id.includes(query)) return 60;

  // Name contains query
  if (name.includes(query)) return 50;

  // Description contains query
  if (desc.includes(query)) return 30;

  // Fuzzy match - check if all chars appear in order
  if (fuzzyMatch(id, query)) return 20;
  if (fuzzyMatch(name, query)) return 10;

  return 0;
}

/**
 * Simple fuzzy matching - all characters must appear in order
 */
function fuzzyMatch(text: string, query: string): boolean {
  let textIndex = 0;
  let queryIndex = 0;

  while (textIndex < text.length && queryIndex < query.length) {
    if (text[textIndex] === query[queryIndex]) {
      queryIndex++;
    }
    textIndex++;
  }

  return queryIndex === query.length;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format command for display
 */
export function formatCommand(command: Command): string {
  return `/${command.id}`;
}

/**
 * Format command with shortcut
 */
export function formatCommandWithShortcut(command: Command): string {
  if (command.shortcut) {
    return `/${command.id} (${command.shortcut})`;
  }
  return `/${command.id}`;
}

/**
 * Get icon class for command category
 */
export function getCategoryIcon(category: Command['category']): string {
  switch (category) {
    case 'test':
      return 'i-ph-test-tube';
    case 'deploy':
      return 'i-ph-rocket-launch';
    case 'lint':
      return 'i-ph-magnifying-glass';
    case 'build':
      return 'i-ph-hammer';
    case 'custom':
      return 'i-ph-star';
    default:
      return 'i-ph-terminal';
  }
}

/**
 * Get color class for command category
 */
export function getCategoryColor(category: Command['category']): string {
  switch (category) {
    case 'test':
      return 'text-green-500';
    case 'deploy':
      return 'text-blue-500';
    case 'lint':
      return 'text-yellow-500';
    case 'build':
      return 'text-purple-500';
    case 'custom':
      return 'text-pink-500';
    default:
      return 'text-gray-500';
  }
}
