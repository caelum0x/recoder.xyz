/**
 * Assistant Message Parser
 * Copied from Kilocode - Parses AI assistant messages to extract
 * tool calls, thinking blocks, and structured content
 */

import { z } from 'zod';
import { atom } from 'nanostores';

// =============================================================================
// Schemas
// =============================================================================

export const ParsedBlockTypeSchema = z.enum([
  'text',
  'thinking',
  'tool_use',
  'code',
  'artifact',
  'error',
]);

export const ParsedBlockSchema = z.object({
  type: ParsedBlockTypeSchema,
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const ThinkingBlockSchema = z.object({
  type: z.literal('thinking'),
  content: z.string(),
  collapsed: z.boolean().default(true),
});

export const ToolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  params: z.record(z.unknown()),
  rawXml: z.string().optional(),
});

export const CodeBlockSchema = z.object({
  type: z.literal('code'),
  language: z.string(),
  content: z.string(),
  filename: z.string().optional(),
});

export const ArtifactBlockSchema = z.object({
  type: z.literal('artifact'),
  identifier: z.string(),
  title: z.string(),
  artifactType: z.string(),
  content: z.string(),
});

export const ParsedMessageSchema = z.object({
  blocks: z.array(ParsedBlockSchema),
  toolCalls: z.array(ToolUseBlockSchema),
  thinkingBlocks: z.array(ThinkingBlockSchema),
  codeBlocks: z.array(CodeBlockSchema),
  artifacts: z.array(ArtifactBlockSchema),
  plainText: z.string(),
  isComplete: z.boolean(),
});

// =============================================================================
// Types
// =============================================================================

export type ParsedBlockType = z.infer<typeof ParsedBlockTypeSchema>;
export type ParsedBlock = z.infer<typeof ParsedBlockSchema>;
export type ThinkingBlock = z.infer<typeof ThinkingBlockSchema>;
export type ToolUseBlock = z.infer<typeof ToolUseBlockSchema>;
export type CodeBlock = z.infer<typeof CodeBlockSchema>;
export type ArtifactBlock = z.infer<typeof ArtifactBlockSchema>;
export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;

// =============================================================================
// State
// =============================================================================

export const isParsing = atom<boolean>(false);
export const parseError = atom<string | null>(null);

// =============================================================================
// XML Tool Parsing
// =============================================================================

/**
 * Parse XML tool calls from message content
 */
export function parseXmlToolCalls(content: string): ToolUseBlock[] {
  const toolCalls: ToolUseBlock[] = [];

  // Match tool use blocks with various formats
  // Format 1: <tool_name>params</tool_name>
  // Format 2: <tool_use name="tool_name">params</tool_use>
  const toolPatterns = [
    // Direct tool name tags
    /<(read_file|write_file|edit_file|delete_file|list_files|search_files|apply_diff|multi_apply_diff|search_replace|execute_command|browser_action|new_task|attempt_completion|update_todo|use_mcp_tool|access_mcp_resource)>([\s\S]*?)<\/\1>/gi,
    // Generic tool_use with name attribute
    /<tool_use\s+name=["']([^"']+)["']>([\s\S]*?)<\/tool_use>/gi,
  ];

  for (const pattern of toolPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const [fullMatch, toolName, innerContent] = match;
      const params = parseToolParams(innerContent);

      toolCalls.push({
        type: 'tool_use',
        id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: toolName.toLowerCase(),
        params,
        rawXml: fullMatch,
      });
    }
  }

  return toolCalls;
}

/**
 * Parse tool parameters from XML content
 */
function parseToolParams(content: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Match parameter tags: <param_name>value</param_name>
  const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = paramRegex.exec(content)) !== null) {
    const [_, paramName, paramValue] = match;

    // Try to parse as JSON if it looks like JSON
    const trimmedValue = paramValue.trim();
    if (
      (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) ||
      (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))
    ) {
      try {
        params[paramName] = JSON.parse(trimmedValue);
        continue;
      } catch {
        // Not valid JSON, use as string
      }
    }

    // Check for boolean/number
    if (trimmedValue === 'true') {
      params[paramName] = true;
    } else if (trimmedValue === 'false') {
      params[paramName] = false;
    } else if (!isNaN(Number(trimmedValue)) && trimmedValue !== '') {
      params[paramName] = Number(trimmedValue);
    } else {
      params[paramName] = trimmedValue;
    }
  }

  return params;
}

// =============================================================================
// Thinking Block Parsing
// =============================================================================

/**
 * Parse thinking blocks from message content
 */
export function parseThinkingBlocks(content: string): ThinkingBlock[] {
  const blocks: ThinkingBlock[] = [];

  // Match <thinking>...</thinking> blocks
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/gi;
  let match;

  while ((match = thinkingRegex.exec(content)) !== null) {
    blocks.push({
      type: 'thinking',
      content: match[1].trim(),
      collapsed: true,
    });
  }

  return blocks;
}

// =============================================================================
// Code Block Parsing
// =============================================================================

/**
 * Parse code blocks from message content
 */
export function parseCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  // Match ```language\ncode``` blocks
  const codeRegex = /```(\w+)?(?:\s+([^\n]+))?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeRegex.exec(content)) !== null) {
    const [_, language, filename, code] = match;
    blocks.push({
      type: 'code',
      language: language || 'text',
      content: code.trim(),
      filename: filename?.trim(),
    });
  }

  return blocks;
}

// =============================================================================
// Artifact Parsing
// =============================================================================

/**
 * Parse artifact blocks from message content
 */
export function parseArtifacts(content: string): ArtifactBlock[] {
  const artifacts: ArtifactBlock[] = [];

  // Match <artifact> blocks
  const artifactRegex = /<artifact\s+identifier=["']([^"']+)["']\s+type=["']([^"']+)["']\s+title=["']([^"']+)["']>([\s\S]*?)<\/artifact>/gi;
  let match;

  while ((match = artifactRegex.exec(content)) !== null) {
    const [_, identifier, type, title, artifactContent] = match;
    artifacts.push({
      type: 'artifact',
      identifier,
      title,
      artifactType: type,
      content: artifactContent.trim(),
    });
  }

  return artifacts;
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse an assistant message into structured blocks
 */
export function parseAssistantMessage(content: string): ParsedMessage {
  isParsing.set(true);
  parseError.set(null);

  try {
    const toolCalls = parseXmlToolCalls(content);
    const thinkingBlocks = parseThinkingBlocks(content);
    const codeBlocks = parseCodeBlocks(content);
    const artifacts = parseArtifacts(content);

    // Extract plain text (content without special blocks)
    let plainText = content
      // Remove thinking blocks
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      // Remove tool calls
      .replace(/<(read_file|write_file|edit_file|delete_file|list_files|search_files|apply_diff|multi_apply_diff|search_replace|execute_command|browser_action|new_task|attempt_completion|update_todo|use_mcp_tool|access_mcp_resource)>[\s\S]*?<\/\1>/gi, '')
      .replace(/<tool_use\s+name=["'][^"']+["']>[\s\S]*?<\/tool_use>/gi, '')
      // Remove artifacts
      .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
      // Remove code blocks (they're tracked separately)
      .replace(/```[\s\S]*?```/g, '')
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Build blocks array
    const blocks: ParsedBlock[] = [];

    // Add thinking blocks
    for (const thinking of thinkingBlocks) {
      blocks.push({
        type: 'thinking',
        content: thinking.content,
        metadata: { collapsed: thinking.collapsed },
      });
    }

    // Add tool calls
    for (const tool of toolCalls) {
      blocks.push({
        type: 'tool_use',
        content: tool.rawXml || JSON.stringify(tool.params),
        metadata: { id: tool.id, name: tool.name, params: tool.params },
      });
    }

    // Add code blocks
    for (const code of codeBlocks) {
      blocks.push({
        type: 'code',
        content: code.content,
        metadata: { language: code.language, filename: code.filename },
      });
    }

    // Add artifacts
    for (const artifact of artifacts) {
      blocks.push({
        type: 'artifact',
        content: artifact.content,
        metadata: {
          identifier: artifact.identifier,
          title: artifact.title,
          artifactType: artifact.artifactType,
        },
      });
    }

    // Add plain text if any
    if (plainText) {
      blocks.unshift({
        type: 'text',
        content: plainText,
      });
    }

    // Check if message appears complete
    const isComplete = !content.endsWith('...') &&
      !content.match(/<[^>]+$/) && // No unclosed tags at end
      (toolCalls.length === 0 || toolCalls.every(t => t.rawXml?.includes('</')));

    return {
      blocks,
      toolCalls,
      thinkingBlocks,
      codeBlocks,
      artifacts,
      plainText,
      isComplete,
    };
  } catch (error) {
    parseError.set(error instanceof Error ? error.message : 'Parse error');
    return {
      blocks: [{ type: 'text', content }],
      toolCalls: [],
      thinkingBlocks: [],
      codeBlocks: [],
      artifacts: [],
      plainText: content,
      isComplete: true,
    };
  } finally {
    isParsing.set(false);
  }
}

// =============================================================================
// Streaming Parser
// =============================================================================

interface StreamingParserState {
  buffer: string;
  parsedMessage: ParsedMessage;
  partialToolCall: string | null;
  partialThinking: string | null;
  partialCode: string | null;
}

/**
 * Create a streaming parser for incremental message parsing
 */
export function createStreamingParser(): {
  feed: (chunk: string) => ParsedMessage;
  getState: () => StreamingParserState;
  reset: () => void;
} {
  let state: StreamingParserState = {
    buffer: '',
    parsedMessage: {
      blocks: [],
      toolCalls: [],
      thinkingBlocks: [],
      codeBlocks: [],
      artifacts: [],
      plainText: '',
      isComplete: false,
    },
    partialToolCall: null,
    partialThinking: null,
    partialCode: null,
  };

  return {
    feed(chunk: string): ParsedMessage {
      state.buffer += chunk;

      // Check for partial opening tags
      const lastOpenTag = state.buffer.match(/<(\w+)(?:\s[^>]*)?>?$/);
      if (lastOpenTag) {
        // Don't parse yet, might be incomplete
        state.partialToolCall = lastOpenTag[0];
      }

      // Re-parse the full buffer
      state.parsedMessage = parseAssistantMessage(state.buffer);

      return state.parsedMessage;
    },

    getState(): StreamingParserState {
      return { ...state };
    },

    reset(): void {
      state = {
        buffer: '',
        parsedMessage: {
          blocks: [],
          toolCalls: [],
          thinkingBlocks: [],
          codeBlocks: [],
          artifacts: [],
          plainText: '',
          isComplete: false,
        },
        partialToolCall: null,
        partialThinking: null,
        partialCode: null,
      };
    },
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract the first tool call from content
 */
export function extractFirstToolCall(content: string): ToolUseBlock | null {
  const toolCalls = parseXmlToolCalls(content);
  return toolCalls[0] || null;
}

/**
 * Check if content contains any tool calls
 */
export function hasToolCalls(content: string): boolean {
  return parseXmlToolCalls(content).length > 0;
}

/**
 * Check if content contains thinking blocks
 */
export function hasThinkingBlocks(content: string): boolean {
  return /<thinking>/i.test(content);
}

/**
 * Remove all tool calls from content
 */
export function stripToolCalls(content: string): string {
  return content
    .replace(/<(read_file|write_file|edit_file|delete_file|list_files|search_files|apply_diff|multi_apply_diff|search_replace|execute_command|browser_action|new_task|attempt_completion|update_todo|use_mcp_tool|access_mcp_resource)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<tool_use\s+name=["'][^"']+["']>[\s\S]*?<\/tool_use>/gi, '')
    .trim();
}

/**
 * Remove thinking blocks from content
 */
export function stripThinkingBlocks(content: string): string {
  return content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

/**
 * Get display-safe content (no thinking, formatted tool calls)
 */
export function getDisplayContent(content: string): string {
  const parsed = parseAssistantMessage(content);

  let display = parsed.plainText;

  // Add code blocks
  for (const code of parsed.codeBlocks) {
    const filename = code.filename ? ` (${code.filename})` : '';
    display += `\n\n\`\`\`${code.language}${filename}\n${code.content}\n\`\`\``;
  }

  // Add tool call summaries
  for (const tool of parsed.toolCalls) {
    display += `\n\n> Using tool: **${tool.name}**`;
  }

  return display.trim();
}

// =============================================================================
// Native Tool Call Parsing
// =============================================================================

interface NativeToolCall {
  id: string;
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
}

/**
 * Parse native tool calls (from AI provider response)
 */
export function parseNativeToolCalls(
  contentBlocks: Array<{ type: string; [key: string]: unknown }>
): ToolUseBlock[] {
  const toolCalls: ToolUseBlock[] = [];

  for (const block of contentBlocks) {
    if (block.type === 'tool_use') {
      const nativeCall = block as unknown as NativeToolCall;
      toolCalls.push({
        type: 'tool_use',
        id: nativeCall.id,
        name: nativeCall.name,
        params: nativeCall.input,
      });
    }
  }

  return toolCalls;
}

/**
 * Convert native tool call to XML format
 */
export function toolCallToXml(toolCall: ToolUseBlock): string {
  const paramsXml = Object.entries(toolCall.params)
    .map(([key, value]) => {
      const stringValue = typeof value === 'object'
        ? JSON.stringify(value, null, 2)
        : String(value);
      return `<${key}>${stringValue}</${key}>`;
    })
    .join('\n');

  return `<${toolCall.name}>\n${paramsXml}\n</${toolCall.name}>`;
}
