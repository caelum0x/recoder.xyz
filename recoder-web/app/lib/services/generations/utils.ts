/**
 * Generation Utilities
 * Helper functions for building messages, detecting image types, and more
 */

import type {
  DataContent,
  FileData,
  FilePart,
  FileResolver,
  GenerationContentResolver,
  GenerationUsage,
  ImageGenerationResolver,
  ImagePart,
  ModelMessage,
  Node,
  NodeId,
  OutputId,
  WebPageData,
} from './types';

// =============================================================================
// Message Building
// =============================================================================

/**
 * Builds message objects for generation from node content
 */
export async function buildMessageObject(params: {
  node: Node;
  contextNodes: Node[];
  fileResolver: FileResolver;
  generationContentResolver: GenerationContentResolver;
  imageGenerationResolver: ImageGenerationResolver;
}): Promise<ModelMessage[]> {
  const { node, contextNodes, fileResolver, generationContentResolver, imageGenerationResolver } =
    params;

  const contentType = node.content.type;

  switch (contentType) {
    case 'textGeneration':
    case 'contentGeneration':
      return buildTextGenerationMessage({
        node,
        contextNodes,
        fileResolver,
        generationContentResolver,
      });

    case 'imageGeneration':
      return buildImageGenerationMessage({
        node,
        contextNodes,
        fileResolver,
        generationContentResolver,
        imageGenerationResolver,
      });

    default:
      return [];
  }
}

async function buildTextGenerationMessage(params: {
  node: Node;
  contextNodes: Node[];
  fileResolver: FileResolver;
  generationContentResolver: GenerationContentResolver;
}): Promise<ModelMessage[]> {
  const { node, contextNodes, fileResolver, generationContentResolver } = params;

  const prompt = node.content.prompt;
  if (!prompt) {
    throw new Error('Prompt cannot be empty');
  }

  let userMessage = prompt;

  // Handle JSON content
  if (isJsonContent(prompt)) {
    userMessage = jsonContentToText(JSON.parse(prompt));
  }

  // Find and replace placeholders
  const pattern = /\{\{(nd-[a-zA-Z0-9]+):(otp-[a-zA-Z0-9]+)\}\}/g;
  const sourceKeywords = Array.from(userMessage.matchAll(pattern)).map((match) => ({
    nodeId: match[1] as NodeId,
    outputId: match[2] as OutputId,
  }));

  const attachedFiles: (FilePart | ImagePart)[] = [];
  const attachedFileNodeIds: NodeId[] = [];

  for (const sourceKeyword of sourceKeywords) {
    const contextNode = contextNodes.find((n) => n.id === sourceKeyword.nodeId);
    if (!contextNode) continue;

    const replaceKeyword = `{{${sourceKeyword.nodeId}:${sourceKeyword.outputId}}}`;

    switch (contextNode.content.type) {
      case 'text': {
        const text = contextNode.content.text ?? '';
        const resolvedText = isJsonContent(text) ? jsonContentToText(JSON.parse(text)) : text;
        userMessage = userMessage.replace(replaceKeyword, resolvedText);
        break;
      }

      case 'textGeneration':
      case 'contentGeneration': {
        const result = await generationContentResolver(contextNode.id, sourceKeyword.outputId);
        userMessage = userMessage.replace(replaceKeyword, result ?? '');
        break;
      }

      case 'file': {
        if (attachedFileNodeIds.includes(contextNode.id)) continue;

        const category = contextNode.content.category;
        const files = contextNode.content.files ?? [];

        if (category === 'text') {
          const fileContents = await getFileContents(files, fileResolver, 'text');
          const textContent = fileContents
            .filter((f): f is FilePart => f.type === 'file')
            .map((f) => {
              if (f.data instanceof Uint8Array) {
                const text = new TextDecoder().decode(f.data);
                return `<File name="${f.filename}">${text}</File>`;
              }
              return null;
            })
            .filter(Boolean)
            .join('\n');
          userMessage = userMessage.replace(replaceKeyword, textContent);
        } else {
          const fileContents = await getFileContents(files, fileResolver, category ?? 'image');
          userMessage = userMessage.replace(
            replaceKeyword,
            getFilesDescription(attachedFiles.length, fileContents.length),
          );
          attachedFiles.push(...fileContents);
          attachedFileNodeIds.push(contextNode.id);
        }
        break;
      }

      case 'webPage': {
        const webpages = contextNode.content.webpages ?? [];
        const contents = await getWebPageContents(webpages, fileResolver);
        const webPageText = contents
          .filter((f): f is FilePart => f.type === 'file')
          .map((f) => {
            if (f.data instanceof Uint8Array) {
              const text = new TextDecoder().decode(f.data);
              return `<WebPage name="${f.filename}">${text}</WebPage>`;
            }
            return null;
          })
          .filter(Boolean)
          .join('\n');
        userMessage = userMessage.replace(replaceKeyword, webPageText);
        break;
      }

      case 'query':
      case 'dataQuery':
      case 'trigger':
      case 'action': {
        const result = await generationContentResolver(contextNode.id, sourceKeyword.outputId);
        userMessage = userMessage.replace(replaceKeyword, result ?? '');
        break;
      }

      default:
        userMessage = userMessage.replace(replaceKeyword, '');
    }
  }

  return [
    {
      role: 'user',
      content: [...attachedFiles.map(partToMessagePart), { type: 'text', text: userMessage }],
    },
  ];
}

async function buildImageGenerationMessage(params: {
  node: Node;
  contextNodes: Node[];
  fileResolver: FileResolver;
  generationContentResolver: GenerationContentResolver;
  imageGenerationResolver: ImageGenerationResolver;
}): Promise<ModelMessage[]> {
  const { node, contextNodes, fileResolver, generationContentResolver, imageGenerationResolver } =
    params;

  const prompt = node.content.prompt;
  if (!prompt) {
    throw new Error('Prompt cannot be empty');
  }

  let userMessage = prompt;

  if (isJsonContent(prompt)) {
    userMessage = jsonContentToText(JSON.parse(prompt));
  }

  const pattern = /\{\{(nd-[a-zA-Z0-9]+):(otp-[a-zA-Z0-9]+)\}\}/g;
  const sourceKeywords = Array.from(userMessage.matchAll(pattern)).map((match) => ({
    nodeId: match[1] as NodeId,
    outputId: match[2] as OutputId,
  }));

  const attachedFiles: (FilePart | ImagePart)[] = [];

  for (const sourceKeyword of sourceKeywords) {
    const contextNode = contextNodes.find((n) => n.id === sourceKeyword.nodeId);
    if (!contextNode) continue;

    const replaceKeyword = `{{${sourceKeyword.nodeId}:${sourceKeyword.outputId}}}`;

    switch (contextNode.content.type) {
      case 'text':
        userMessage = userMessage.replace(replaceKeyword, contextNode.content.text ?? '');
        break;

      case 'textGeneration':
      case 'contentGeneration': {
        const result = await generationContentResolver(contextNode.id, sourceKeyword.outputId);
        userMessage = userMessage.replace(replaceKeyword, result ?? '');
        break;
      }

      case 'imageGeneration': {
        const images = await imageGenerationResolver(contextNode.id, sourceKeyword.outputId);
        if (images && images.length > 0) {
          userMessage = userMessage.replace(
            replaceKeyword,
            getFilesDescription(attachedFiles.length, images.length),
          );
          attachedFiles.push(...images);
        } else {
          userMessage = userMessage.replace(replaceKeyword, '');
        }
        break;
      }

      default:
        userMessage = userMessage.replace(replaceKeyword, '');
    }
  }

  return [
    {
      role: 'user',
      content: [{ type: 'text', text: userMessage }, ...attachedFiles.map(partToMessagePart)],
    },
  ];
}

function partToMessagePart(part: FilePart | ImagePart) {
  if (part.type === 'file') {
    return {
      type: 'file' as const,
      data: part.data instanceof Uint8Array ? part.data : new Uint8Array(part.data as ArrayBuffer),
      filename: part.filename,
      mediaType: part.mediaType,
    };
  }
  return {
    type: 'image' as const,
    image: part.image instanceof Uint8Array ? part.image : new Uint8Array(part.image as ArrayBuffer),
    mediaType: part.mediaType,
  };
}

// =============================================================================
// File Content Helpers
// =============================================================================

async function getFileContents(
  files: FileData[],
  fileResolver: FileResolver,
  category: 'text' | 'image' | 'pdf',
): Promise<(FilePart | ImagePart)[]> {
  const results = await Promise.all(
    files.map(async (file) => {
      if (file.status !== 'uploaded') return null;

      const data = await fileResolver(file.id);

      switch (category) {
        case 'text':
        case 'pdf':
          return {
            type: 'file' as const,
            data,
            filename: file.name,
            mediaType: file.type,
          };
        case 'image':
          return {
            type: 'image' as const,
            image: data,
            mediaType: file.type,
          };
        default:
          return null;
      }
    }),
  );

  return results.filter((r) => r !== null) as (FilePart | ImagePart)[];
}

async function getWebPageContents(
  webpages: WebPageData[],
  fileResolver: FileResolver,
): Promise<FilePart[]> {
  const results = await Promise.all(
    webpages.map(async (webpage) => {
      if (webpage.status !== 'fetched' || !webpage.fileId) return null;

      const data = await fileResolver(webpage.fileId);
      return {
        type: 'file' as const,
        data,
        filename: webpage.title,
        mediaType: 'text/markdown',
      };
    }),
  );

  return results.filter((r): r is FilePart => r !== null);
}

function getFilesDescription(currentCount: number, newFilesCount: number): string {
  const getOrdinal = (n: number): string => {
    const rules = new Intl.PluralRules('en', { type: 'ordinal' });
    const suffixes: Record<string, string> = {
      one: 'st',
      two: 'nd',
      few: 'rd',
      other: 'th',
    };
    const suffix = suffixes[rules.select(n)];
    return `${n}${suffix}`;
  };

  if (newFilesCount > 1) {
    return `${getOrdinal(currentCount + 1)} ~ ${getOrdinal(currentCount + newFilesCount)} attached files`;
  }
  return `${getOrdinal(currentCount + 1)} attached file`;
}

// =============================================================================
// JSON Content Helpers
// =============================================================================

function isJsonContent(content: string): boolean {
  if (!content.startsWith('{') && !content.startsWith('[')) return false;
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

function jsonContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) {
          return (item as { text: string }).text;
        }
        return JSON.stringify(item);
      })
      .join('\n');
  }
  if (content && typeof content === 'object' && 'text' in content) {
    return (content as { text: string }).text;
  }
  return JSON.stringify(content);
}

// =============================================================================
// Image Type Detection
// =============================================================================

/**
 * Detects image type from byte array header
 */
export function detectImageType(
  imageAsUint8Array: Uint8Array,
): { contentType: string; ext: string } | null {
  const bytes = imageAsUint8Array;

  // JPEG: Starts with FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: 'image/jpeg', ext: 'jpeg' };
  }

  // PNG: Starts with 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { contentType: 'image/png', ext: 'png' };
  }

  // WebP: Starts with RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: 'image/webp', ext: 'webp' };
  }

  // GIF: Starts with GIF87a or GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { contentType: 'image/gif', ext: 'gif' };
  }

  return null;
}

// =============================================================================
// Usage Sanitization
// =============================================================================

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Sanitizes generation usage metrics for safe persistence
 */
export function sanitizeGenerationUsage(
  usage?: GenerationUsage,
): GenerationUsage | undefined {
  if (usage === undefined) {
    return undefined;
  }

  const sanitized: GenerationUsage = {
    inputTokens: isFiniteNumber(usage.inputTokens) ? usage.inputTokens : undefined,
    outputTokens: isFiniteNumber(usage.outputTokens) ? usage.outputTokens : undefined,
    totalTokens: isFiniteNumber(usage.totalTokens) ? usage.totalTokens : undefined,
    reasoningTokens: isFiniteNumber(usage.reasoningTokens) ? usage.reasoningTokens : undefined,
    cachedInputTokens: isFiniteNumber(usage.cachedInputTokens) ? usage.cachedInputTokens : undefined,
  };

  if (
    sanitized.inputTokens === undefined &&
    sanitized.outputTokens === undefined &&
    sanitized.totalTokens === undefined &&
    sanitized.reasoningTokens === undefined &&
    sanitized.cachedInputTokens === undefined
  ) {
    return undefined;
  }

  return sanitized;
}

// =============================================================================
// Batch Writer Utility
// =============================================================================

export interface BatchWriterOptions<T> {
  process: (batch: T[]) => Promise<void>;
  batchSize?: number;
  flushIntervalMs?: number;
  preserveItems?: boolean;
  logger?: { debug: (msg: string) => void };
}

export function batchWriter<T>(options: BatchWriterOptions<T>) {
  const { process, batchSize = 50, flushIntervalMs = 100, preserveItems = false, logger } = options;

  let batch: T[] = [];
  let allItems: T[] = [];
  let flushTimeout: NodeJS.Timeout | null = null;
  let isClosed = false;

  const flush = async () => {
    if (batch.length === 0) return;

    const toProcess = [...batch];
    batch = [];

    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    logger?.debug(`Flushing batch of ${toProcess.length} items`);
    await process(preserveItems ? allItems : toProcess);
  };

  const scheduleFlush = () => {
    if (flushTimeout) return;
    flushTimeout = setTimeout(() => {
      flush().catch(console.error);
    }, flushIntervalMs);
  };

  return {
    add(item: T) {
      if (isClosed) {
        throw new Error('BatchWriter is closed');
      }
      batch.push(item);
      if (preserveItems) {
        allItems.push(item);
      }
      if (batch.length >= batchSize) {
        flush().catch(console.error);
      } else {
        scheduleFlush();
      }
    },

    async close() {
      isClosed = true;
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }
      await flush();
    },

    getItems(): T[] {
      return [...allItems];
    },
  };
}
