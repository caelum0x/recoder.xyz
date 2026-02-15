/**
 * Streaming XML Parser for AI Responses
 *
 * Parses AI responses in real-time as they stream, extracting:
 * - Thinking/plan content incrementally
 * - File actions (create, update, delete)
 * - Command/npm install actions
 * - Supports new file detection and diff generation
 *
 * Uses a tag-based event handling system inspired by Libra's implementation.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Schema definition for XML nodes
 */
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('StreamingXMLParser');

type NodeSchema = {
  /** Whether this node contains content directly (vs only children) */
  isContentNode?: boolean;
  /** Whether this node can contain CDATA sections */
  hasCdata?: boolean;
  /** List of allowed child tag names */
  allowedChildren?: string[];
  /** Whether content should be streamed incrementally */
  isStreaming?: boolean;
};

/**
 * Parsed XML tag structure
 */
export type TagType = {
  name: string;
  attributes: Record<string, string>;
  content: string;
  children: TagType[];
};

/**
 * Callback for when a complete tag is parsed
 */
export type TagCallbackType = (tag: TagType) => void | Promise<void>;

/**
 * Callback for streaming content updates
 * @param tagName - Name of the tag being streamed
 * @param content - Current content (incremental chunk or full content)
 * @param isComplete - Whether the tag is fully parsed
 */
export type StreamingCallbackType = (
  tagName: string,
  content: string,
  isComplete: boolean
) => void | Promise<void>;

// ============================================================================
// Chunk Types for Stream Output
// ============================================================================

export type ThinkingChunkType = {
  type: 'thinking' | 'thinking_complete';
  planId: string;
  data: { content: string };
};

export type DescriptionChunkType = {
  type: 'description' | 'description_complete';
  planId: string;
  data: { content: string };
};

export type FileActionData = {
  type: 'file';
  description: string;
  path: string;
  dirname: string;
  basename: string;
  modified: string;
  original: string | null;
  isNew: boolean;
};

export type CommandActionData = {
  type: 'command';
  description: string;
  command: string;
  packages: string[];
};

export type DeleteActionData = {
  type: 'delete';
  description: string;
  path: string;
};

export type ActionChunkType = {
  type: 'action';
  planId: string;
  data: FileActionData | CommandActionData | DeleteActionData;
};

export type ErrorChunkType = {
  type: 'error';
  data: { content: string };
};

export type StreamChunk =
  | ThinkingChunkType
  | DescriptionChunkType
  | ActionChunkType
  | ErrorChunkType;

// ============================================================================
// Plan Types
// ============================================================================

export interface FileAction {
  type: 'file';
  dirname: string;
  basename: string;
  path: string;
  modified: string;
  original: string | null;
  description: string;
  isNew: boolean;
}

export interface DeleteFileAction {
  type: 'delete';
  path: string;
  description: string;
}

export interface NpmInstallCommand {
  type: 'command';
  command: 'npm install' | 'bun install';
  packages: string[];
  description: string;
}

export interface ShellCommand {
  type: 'shell';
  command: string;
  description: string;
}

export type PlanAction = FileAction | DeleteFileAction | NpmInstallCommand | ShellCommand;

export interface Plan {
  id: string;
  query: string;
  description: string;
  thinking?: string;
  actions: PlanAction[];
}

// ============================================================================
// XML Schema Definition
// ============================================================================

/**
 * Schema defining the structure of AI response XML
 */
const xmlSchema: Record<string, NodeSchema> = {
  // Root plan container
  plan: { isContentNode: false, hasCdata: false, isStreaming: false },
  // Individual action container
  action: { isContentNode: false, hasCdata: false, isStreaming: false },
  // Description of action (can be CDATA)
  description: { isContentNode: true, hasCdata: true, isStreaming: false },
  // File content (always CDATA)
  file: { isContentNode: true, hasCdata: true, isStreaming: false },
  // Command type (npm install, bun install, etc.)
  commandType: { isContentNode: true, hasCdata: false, isStreaming: false },
  // Package name for install commands
  package: { isContentNode: true, hasCdata: false, isStreaming: false },
  // Shell command content
  command: { isContentNode: true, hasCdata: true, isStreaming: false },
  // High-level plan description (streamed incrementally)
  planDescription: { isContentNode: true, hasCdata: true, isStreaming: true },
  // AI thinking/reasoning (streamed incrementally)
  thinking: { isContentNode: true, hasCdata: true, isStreaming: true },
};

// ============================================================================
// StreamingXMLParser Class
// ============================================================================

export interface StreamingXMLParserOptions {
  /** Callback for complete tags */
  onTag: TagCallbackType;
  /** Callback for streaming content updates */
  onStreaming?: StreamingCallbackType;
}

/**
 * Streaming XML parser that processes AI responses incrementally.
 *
 * Features:
 * - Handles partial chunks as they arrive
 * - Supports CDATA sections for code content
 * - Streams thinking and description content incrementally
 * - Emits events for complete action tags
 */
export class StreamingXMLParser {
  private buffer = '';
  private currentTag: TagType | null = null;
  private tagStack: TagType[] = [];
  private isInCDATA = false;
  private cdataBuffer = '';
  private textBuffer = '';
  private onTag: TagCallbackType;
  private onStreaming?: StreamingCallbackType;
  private streamingAccumulators: Map<string, string> = new Map();

  constructor({ onTag, onStreaming }: StreamingXMLParserOptions) {
    this.onTag = onTag;
    this.onStreaming = onStreaming;
  }

  /**
   * Reset parser state for reuse
   */
  reset(): void {
    this.buffer = '';
    this.currentTag = null;
    this.tagStack = [];
    this.isInCDATA = false;
    this.cdataBuffer = '';
    this.textBuffer = '';
    this.streamingAccumulators.clear();
  }

  /**
   * Parse attribute string into key-value pairs
   * Supports: key="value" format
   */
  private parseAttributes(attributeString: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const matches = attributeString.match(/(\w+)="([^"]*?)"/g);

    if (matches) {
      for (const match of matches) {
        const eqIndex = match.indexOf('=');
        if (eqIndex !== -1) {
          const key = match.substring(0, eqIndex);
          const value = match.substring(eqIndex + 2, match.length - 1);
          attributes[key] = value;
        }
      }
    }

    return attributes;
  }

  /**
   * Handle opening tag
   */
  private handleOpenTag(tagContent: string): void {
    // Process any pending text content
    if (this.textBuffer.trim()) {
      this.processTextContent(this.textBuffer.trim());
    }
    this.textBuffer = '';

    // Parse tag name and attributes
    const spaceIndex = tagContent.indexOf(' ');
    const tagName = spaceIndex === -1 ? tagContent : tagContent.substring(0, spaceIndex);
    const attributeString = spaceIndex === -1 ? '' : tagContent.substring(spaceIndex + 1);

    const newTag: TagType = {
      name: tagName,
      attributes: this.parseAttributes(attributeString),
      content: '',
      children: [],
    };

    // Initialize streaming accumulator if needed
    const schema = xmlSchema[tagName];
    if (schema?.isStreaming && this.onStreaming) {
      this.streamingAccumulators.set(tagName, '');
    }

    // Add to parent's children if we have a current tag
    if (this.currentTag) {
      this.tagStack.push(this.currentTag);
      this.currentTag.children.push(newTag);
    }

    this.currentTag = newTag;
  }

  /**
   * Handle closing tag
   */
  private handleCloseTag(tagName: string): void {
    if (!this.currentTag) {
      return;
    }

    // Process any pending text content
    if (this.textBuffer.trim()) {
      this.processTextContent(this.textBuffer.trim());
    }
    this.textBuffer = '';

    // Verify tag match
    if (this.currentTag.name !== tagName) {
      return;
    }

    const schema = xmlSchema[this.currentTag.name];

    // Handle streaming tags
    if (schema?.isStreaming && this.onStreaming) {
      const accumulatedContent = this.streamingAccumulators.get(this.currentTag.name) || '';
      this.currentTag.content = accumulatedContent;
      this.onStreaming(this.currentTag.name, accumulatedContent, true);
      this.streamingAccumulators.delete(this.currentTag.name);
    }

    // Emit complete tag for non-streaming tags
    if (!schema?.isStreaming) {
      this.currentTag = this.cleanNode(this.currentTag);
      this.onTag(this.currentTag);
    }

    // Pop parent from stack
    if (this.tagStack.length > 0) {
      this.currentTag = this.tagStack.pop() || null;
    } else {
      this.currentTag = null;
    }
  }

  /**
   * Process text content within a tag
   */
  private processTextContent(content: string): void {
    if (!this.currentTag) return;

    const schema = xmlSchema[this.currentTag.name];

    if (schema?.isStreaming && this.onStreaming) {
      // Accumulate and stream incrementally
      const accumulated = this.streamingAccumulators.get(this.currentTag.name) || '';
      const newAccumulated = accumulated + content;
      this.streamingAccumulators.set(this.currentTag.name, newAccumulated);
      this.onStreaming(this.currentTag.name, content, false);
    } else {
      // Append to content
      this.currentTag.content += content;
    }
  }

  /**
   * Clean up node structure
   * Non-content nodes have their content cleared if they have children
   */
  private cleanNode(node: TagType): TagType {
    const schema = xmlSchema[node.name];
    const isContentNode = schema ? schema.isContentNode : true;

    if (!isContentNode && node.children.length > 0) {
      node.content = '';
    }

    node.children = node.children.map((child) => this.cleanNode(child));

    return node;
  }

  /**
   * Check if sequence exists at index in buffer
   */
  private sequenceExistsAt(
    sequence: string,
    idx: number,
    buffer: string = this.buffer
  ): boolean {
    for (let i = 0; i < sequence.length; i++) {
      if (buffer[idx + i] !== sequence[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Parse a chunk of XML data
   * Can be called multiple times with partial data
   */
  parse(chunk: string): void {
    this.buffer += chunk;

    while (this.buffer.length > 0 || (this.isInCDATA && this.cdataBuffer.length > 0)) {
      // Handle CDATA section
      if (this.isInCDATA) {
        const combinedBuffer = this.cdataBuffer + this.buffer;
        const cdataEndIndex = combinedBuffer.indexOf(']]>');

        if (cdataEndIndex === -1) {
          // CDATA not complete yet, buffer and wait
          this.cdataBuffer = combinedBuffer;
          this.buffer = '';
          return;
        }

        // Extract CDATA content
        const cdataContent = combinedBuffer.substring(0, cdataEndIndex);
        if (this.currentTag) {
          this.processTextContent(cdataContent.trim());
        }

        this.isInCDATA = false;
        this.cdataBuffer = '';
        this.buffer = combinedBuffer.substring(cdataEndIndex + 3);
        continue;
      }

      // Find next tag
      const openTagStartIdx = this.buffer.indexOf('<');

      if (openTagStartIdx === -1) {
        // No tags, process as text
        if (this.buffer.trim()) {
          this.processTextContent(this.buffer);
        }
        this.buffer = '';
        return;
      }

      // Process text before tag
      if (openTagStartIdx > 0) {
        const textContent = this.buffer.substring(0, openTagStartIdx);
        if (textContent.trim()) {
          this.processTextContent(textContent);
        }
        this.buffer = this.buffer.substring(openTagStartIdx);
      }

      // Check for CDATA start
      if (this.sequenceExistsAt('<![CDATA[', 0)) {
        const shouldProcessCDATA =
          this.currentTag?.name && xmlSchema[this.currentTag.name]?.hasCdata === true;

        if (shouldProcessCDATA && this.currentTag) {
          this.isInCDATA = true;
          const cdataStart = this.buffer.substring(9);
          this.cdataBuffer = cdataStart;
          this.buffer = '';
          // Continue loop to immediately check for CDATA end in cdataBuffer
          continue;
        }

        // CDATA not expected, treat as text
        this.processTextContent('<![CDATA[');
        this.buffer = this.buffer.substring(9);
        continue;
      }

      // Find end of tag
      const openTagEndIdx = this.buffer.indexOf('>');
      if (openTagEndIdx === -1) {
        // Tag not complete, wait for more data
        return;
      }

      // Extract tag content
      const tagContent = this.buffer.substring(1, openTagEndIdx);
      this.buffer = this.buffer.substring(openTagEndIdx + 1);

      // Process tag
      if (tagContent.startsWith('/')) {
        this.handleCloseTag(tagContent.substring(1));
      } else if (tagContent.endsWith('/')) {
        // Self-closing tag
        const selfClosingContent = tagContent.substring(0, tagContent.length - 1).trim();
        this.handleOpenTag(selfClosingContent);
        const spaceIdx = selfClosingContent.indexOf(' ');
        const name = spaceIdx === -1 ? selfClosingContent : selfClosingContent.substring(0, spaceIdx);
        this.handleCloseTag(name);
      } else {
        this.handleOpenTag(tagContent);
      }
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract directory name from a path
 */
function dirname(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) return '.';
  if (lastSlash === 0) return '/';
  return path.substring(0, lastSlash);
}

/**
 * Extract file name from a path
 */
function basename(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? path : path.substring(lastSlash + 1);
}

/**
 * Try-catch wrapper that returns [result, error] tuple
 */
async function tryCatch<T>(
  fn: () => T | Promise<T>
): Promise<[T | null, Error | null]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
}

// ============================================================================
// Stream Processing
// ============================================================================

export interface StreamParseOptions {
  /** Unique plan ID */
  planId: string;
  /** Optional file map for diff generation */
  fileMap?: Record<string, { content: string }>;
}

/**
 * Process an action tag and emit appropriate chunk
 */
async function processActionTag(
  tag: TagType,
  controller: ReadableStreamDefaultController<string>,
  planId: string,
  fileMap: Record<string, { content: string }> = {}
): Promise<void> {
  const descriptionTag = tag.children.find((t) => t.name === 'description');
  const description = descriptionTag?.content ?? '';
  const type = tag.attributes['type'] as string;

  if (type === 'file') {
    const fileTag = tag.children.find((t) => t.name === 'file');

    if (!fileTag) {
      logger.error('[StreamingXMLParser] File action is missing file tag');
      return;
    }

    const filePath = fileTag.attributes['filename'] || fileTag.attributes['path'] || '';
    const isNewFile = fileTag.attributes['isNew'] === 'true';

    let originalContent: string | null = null;

    if (isNewFile) {
      originalContent = null;
    } else if (fileMap?.[filePath]?.content) {
      originalContent = fileMap[filePath].content;
    } else {
      originalContent = '';
    }

    const chunk: ActionChunkType = {
      type: 'action',
      planId,
      data: {
        type: 'file',
        description,
        path: filePath,
        dirname: dirname(filePath),
        basename: basename(filePath),
        modified: fileTag.content,
        original: originalContent,
        isNew: isNewFile,
      },
    };

    controller.enqueue(`${JSON.stringify(chunk)}\n`);
    return;
  }

  if (type === 'delete') {
    const filePath = tag.attributes['path'] || tag.attributes['filename'] || '';

    const chunk: ActionChunkType = {
      type: 'action',
      planId,
      data: {
        type: 'delete',
        description,
        path: filePath,
      },
    };

    controller.enqueue(`${JSON.stringify(chunk)}\n`);
    return;
  }

  if (type === 'command') {
    const commandTag = tag.children.find((t) => t.name === 'commandType');

    if (!commandTag) {
      // Check for shell command
      const shellTag = tag.children.find((t) => t.name === 'command');
      if (shellTag) {
        const chunk: ActionChunkType = {
          type: 'action',
          planId,
          data: {
            type: 'command',
            description,
            command: shellTag.content,
            packages: [],
          },
        };
        controller.enqueue(`${JSON.stringify(chunk)}\n`);
      }
      return;
    }

    const packageTags = tag.children.filter((t) => t.name === 'package');

    const chunk: ActionChunkType = {
      type: 'action',
      planId,
      data: {
        type: 'command',
        description,
        command: commandTag.content,
        packages: packageTags.map((t) => t.content),
      },
    };

    controller.enqueue(`${JSON.stringify(chunk)}\n`);
    return;
  }
}

/**
 * Stream parse an async iterable of XML chunks and emit structured events.
 *
 * @param stream - Async iterable of string chunks
 * @param query - Original user query
 * @param planId - Unique plan identifier
 * @param fileMap - Optional map of existing files for diff generation
 * @returns ReadableStream of JSON-encoded events
 */
export async function streamParsePlan(
  stream: AsyncIterable<string>,
  query: string,
  planId: string,
  fileMap: Record<string, { content: string }> = {}
): Promise<ReadableStream<string>> {
  return new ReadableStream({
    async start(controller) {
      const parser = new StreamingXMLParser({
        // Handle complete tags (file actions, etc.)
        async onTag(tag) {
          const [, error] = await tryCatch(async () => {
            if (tag.name === 'action') {
              await processActionTag(tag, controller, planId, fileMap);
            }
            return true;
          });

          if (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            controller.enqueue(
              `${JSON.stringify({
                type: 'error',
                data: { content: `Error processing tag: ${errorMessage}` },
              })}\n`
            );
          }
        },

        // Handle streaming content (thinking and planDescription)
        async onStreaming(tagName, content, isComplete) {
          const [, error] = await tryCatch(async () => {
            if (tagName === 'planDescription') {
              if (!isComplete && content.trim()) {
                const chunk: DescriptionChunkType = {
                  type: 'description',
                  planId,
                  data: { content },
                };
                controller.enqueue(`${JSON.stringify(chunk)}\n`);
              } else if (isComplete && content.trim()) {
                const chunk: DescriptionChunkType = {
                  type: 'description_complete',
                  planId,
                  data: { content },
                };
                controller.enqueue(`${JSON.stringify(chunk)}\n`);
              }
            } else if (tagName === 'thinking') {
              if (!isComplete && content.trim()) {
                const chunk: ThinkingChunkType = {
                  type: 'thinking',
                  planId,
                  data: { content },
                };
                controller.enqueue(`${JSON.stringify(chunk)}\n`);
              } else if (isComplete && content.trim()) {
                const chunk: ThinkingChunkType = {
                  type: 'thinking_complete',
                  planId,
                  data: { content },
                };
                controller.enqueue(`${JSON.stringify(chunk)}\n`);
              }
            }
            return true;
          });

          if (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            controller.enqueue(
              `${JSON.stringify({
                type: 'error',
                data: { content: `Error processing streaming content: ${errorMessage}` },
              })}\n`
            );
          }
        },
      });

      // Process input stream
      const [, streamError] = await tryCatch(async () => {
        for await (const chunk of stream) {
          parser.parse(chunk);
        }
        controller.close();
        return true;
      });

      if (streamError) {
        const errorMessage =
          streamError instanceof Error ? streamError.message : 'Unknown error';
        controller.enqueue(
          `${JSON.stringify({
            type: 'error',
            data: { content: `Error parsing stream: ${errorMessage}` },
          })}\n`
        );
        controller.error(streamError);
      }
    },
  });
}

// ============================================================================
// Synchronous Parsing (for complete responses)
// ============================================================================

/**
 * Parse a complete XML response into a Plan object
 */
export function parsePlanSync(
  response: string,
  query: string,
  planId: string,
  fileMap: Record<string, { content: string }> = {}
): Plan {
  const plan: Plan = {
    id: planId,
    query,
    description: '',
    actions: [],
  };

  let currentTag: TagType | null = null;
  const tagStack: TagType[] = [];

  const parser = new StreamingXMLParser({
    onTag(tag) {
      if (tag.name === 'action') {
        const descriptionTag = tag.children.find((t) => t.name === 'description');
        const description = descriptionTag?.content ?? '';
        const type = tag.attributes['type'];

        if (type === 'file') {
          const fileTag = tag.children.find((t) => t.name === 'file');
          if (fileTag) {
            const filePath = fileTag.attributes['filename'] || fileTag.attributes['path'] || '';
            const isNewFile = fileTag.attributes['isNew'] === 'true';

            let originalContent: string | null = null;
            if (isNewFile) {
              originalContent = null;
            } else if (fileMap?.[filePath]?.content) {
              originalContent = fileMap[filePath].content;
            } else {
              originalContent = '';
            }

            plan.actions.push({
              type: 'file',
              path: filePath,
              dirname: dirname(filePath),
              basename: basename(filePath),
              modified: fileTag.content,
              original: originalContent,
              description,
              isNew: isNewFile,
            });
          }
        } else if (type === 'delete') {
          const filePath = tag.attributes['path'] || tag.attributes['filename'] || '';
          plan.actions.push({
            type: 'delete',
            path: filePath,
            description,
          });
        } else if (type === 'command') {
          const commandTag = tag.children.find((t) => t.name === 'commandType');
          if (commandTag) {
            const packageTags = tag.children.filter((t) => t.name === 'package');
            plan.actions.push({
              type: 'command',
              command: commandTag.content as 'npm install' | 'bun install',
              packages: packageTags.map((t) => t.content),
              description,
            });
          } else {
            const shellTag = tag.children.find((t) => t.name === 'command');
            if (shellTag) {
              plan.actions.push({
                type: 'shell',
                command: shellTag.content,
                description,
              });
            }
          }
        }
      }
    },

    onStreaming(tagName, content, isComplete) {
      if (isComplete) {
        if (tagName === 'planDescription') {
          plan.description = content;
        } else if (tagName === 'thinking') {
          plan.thinking = content;
        }
      }
    },
  });

  parser.parse(response);

  return plan;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all packages from npm install commands in a plan
 */
export function getPackagesToInstall(plan: Plan): string[] {
  return plan.actions
    .filter(
      (action): action is NpmInstallCommand =>
        action.type === 'command' &&
        (action.command === 'npm install' || action.command === 'bun install')
    )
    .flatMap((action) => action.packages);
}

/**
 * Get all file paths that will be modified
 */
export function getAffectedFilePaths(plan: Plan): string[] {
  return plan.actions
    .filter((action): action is FileAction | DeleteFileAction =>
      action.type === 'file' || action.type === 'delete'
    )
    .map((action) => action.path);
}

/**
 * Check if a plan has any file modifications
 */
export function hasFileChanges(plan: Plan): boolean {
  return plan.actions.some((a) => a.type === 'file' || a.type === 'delete');
}

/**
 * Check if a plan has any commands to run
 */
export function hasCommands(plan: Plan): boolean {
  return plan.actions.some((a) => a.type === 'command' || a.type === 'shell');
}

/**
 * Create a simple text-based diff between original and modified content
 */
export function createSimpleDiff(original: string | null, modified: string): string {
  if (original === null) {
    return `+++ New File\n${modified.split('\n').map((l) => `+ ${l}`).join('\n')}`;
  }

  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const diff: string[] = [];

  let i = 0;
  let j = 0;

  while (i < originalLines.length || j < modifiedLines.length) {
    if (i >= originalLines.length) {
      // Remaining lines are additions
      diff.push(`+ ${modifiedLines[j]}`);
      j++;
    } else if (j >= modifiedLines.length) {
      // Remaining lines are deletions
      diff.push(`- ${originalLines[i]}`);
      i++;
    } else if (originalLines[i] === modifiedLines[j]) {
      // Lines match
      diff.push(`  ${originalLines[i]}`);
      i++;
      j++;
    } else {
      // Lines differ - simple approach: show deletion then addition
      diff.push(`- ${originalLines[i]}`);
      diff.push(`+ ${modifiedLines[j]}`);
      i++;
      j++;
    }
  }

  return diff.join('\n');
}

/**
 * Format a plan for display/logging
 */
export function formatPlanSummary(plan: Plan): string {
  const lines: string[] = [];
  lines.push(`Plan: ${plan.id}`);
  lines.push(`Query: ${plan.query}`);
  lines.push(`Description: ${plan.description}`);

  if (plan.thinking) {
    lines.push(`Thinking: ${plan.thinking.substring(0, 100)}...`);
  }

  lines.push(`Actions (${plan.actions.length}):`);

  for (const action of plan.actions) {
    switch (action.type) {
      case 'file':
        lines.push(`  - File: ${action.path} (${action.isNew ? 'new' : 'modify'})`);
        break;
      case 'delete':
        lines.push(`  - Delete: ${action.path}`);
        break;
      case 'command':
        lines.push(`  - Command: ${action.command} ${action.packages.join(' ')}`);
        break;
      case 'shell':
        lines.push(`  - Shell: ${action.command}`);
        break;
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Event-based Stream Consumer
// ============================================================================

export interface StreamEventHandlers {
  onThinking?: (content: string, isComplete: boolean) => void;
  onDescription?: (content: string, isComplete: boolean) => void;
  onAction?: (action: FileActionData | CommandActionData | DeleteActionData) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

/**
 * Consume a parsed stream with event handlers
 */
export async function consumeStreamWithHandlers(
  stream: ReadableStream<string>,
  handlers: StreamEventHandlers
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        handlers.onComplete?.();
        break;
      }

      buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const chunk = JSON.parse(line) as StreamChunk;

          switch (chunk.type) {
            case 'thinking':
              handlers.onThinking?.(chunk.data.content, false);
              break;
            case 'thinking_complete':
              handlers.onThinking?.(chunk.data.content, true);
              break;
            case 'description':
              handlers.onDescription?.(chunk.data.content, false);
              break;
            case 'description_complete':
              handlers.onDescription?.(chunk.data.content, true);
              break;
            case 'action':
              handlers.onAction?.(chunk.data);
              break;
            case 'error':
              handlers.onError?.(chunk.data.content);
              break;
          }
        } catch (e) {
          logger.warn('[StreamingXMLParser] Failed to parse chunk:', line, e);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// Recoder-specific Tag Support
// ============================================================================

/**
 * Additional schema for recoder-specific tags
 */
const recoderSchema: Record<string, NodeSchema> = {
  ...xmlSchema,
  // Recoder-specific write tag
  'recoder-write': { isContentNode: true, hasCdata: true, isStreaming: false },
  // Recoder-specific shell tag
  'recoder-shell': { isContentNode: true, hasCdata: true, isStreaming: false },
  // Recoder-specific dependency tag
  'recoder-dependency': { isContentNode: true, hasCdata: false, isStreaming: false },
  // Recoder-specific delete tag
  'recoder-delete': { isContentNode: false, hasCdata: false, isStreaming: false },
  // Recoder-specific rename tag
  'recoder-rename': { isContentNode: false, hasCdata: false, isStreaming: false },
  // Recoder thinking tag
  'recoder-thinking': { isContentNode: true, hasCdata: true, isStreaming: true },
};

/**
 * Create a parser configured for recoder-specific tags
 */
export function createRecoderParser(options: StreamingXMLParserOptions): StreamingXMLParser {
  // The parser uses the module-level schema, so recoder tags work automatically
  // This factory function is provided for future extensibility
  return new StreamingXMLParser(options);
}

// ============================================================================
// Export Default
// ============================================================================

export default StreamingXMLParser;
