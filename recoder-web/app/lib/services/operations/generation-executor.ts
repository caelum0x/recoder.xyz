/**
 * Generation Executor
 * Core execution engine for running generations
 */

import {
  type GenerationId,
  type NodeId,
  type OutputId,
  type QueuedGeneration,
  type RunningGeneration,
  type CompletedGeneration,
  type FailedGeneration,
  type Generation,
  type GenerationContext,
  type GenerationOutput,
  type InputMessage,
  type ExecutionContext,
  type ExecutionProgress,
  type GenerationError,
  createGenerationId,
  isCompletedGeneration,
} from './types';
import {
  isJsonContent as isSharedJsonContent,
  jsonContentToPlainText as toSharedPlainText,
  jsonContentToText as toSharedText,
} from '~/lib/services/text/json-content';

// ============================================================================
// Generation Store
// ============================================================================

/** In-memory store for generations */
const generationStore = new Map<GenerationId, Generation>();

/** Get a generation by ID */
export function getGeneration(id: GenerationId): Generation | undefined {
  return generationStore.get(id);
}

/** Set a generation in the store */
export function setGeneration(generation: Generation): void {
  generationStore.set(generation.id, generation);
}

/** Delete a generation from the store */
export function deleteGeneration(id: GenerationId): boolean {
  return generationStore.delete(id);
}

/** Get all generations for a node */
export function getNodeGenerations(nodeId: NodeId): Generation[] {
  return Array.from(generationStore.values()).filter(g => g.nodeId === nodeId);
}

/** Clear all generations */
export function clearGenerations(): void {
  generationStore.clear();
}

// ============================================================================
// Generation Executor Types
// ============================================================================

/** Parameters for the execute callback */
export interface ExecuteParams {
  runningGeneration: RunningGeneration;
  generationContext: GenerationContext;
  generationContentResolver: (nodeId: NodeId, outputId: OutputId) => Promise<string | undefined>;
  appEntryResolver: AppEntryResolver;
  finishGeneration: (result: FinishGenerationParams) => Promise<void>;
  setGeneration: (generation: Generation) => Promise<void>;
}

/** Parameters for finishing a generation */
export interface FinishGenerationParams {
  inputMessages: InputMessage[];
  outputs: GenerationOutput[];
}

/** Resolver for app entry inputs */
export type AppEntryResolver = (
  nodeId: NodeId,
  outputId: OutputId
) => Promise<MessagePart[]>;

/** Message part types */
export interface MessagePart {
  type: 'text' | 'file' | 'image';
  text?: string;
  path?: string;
  url?: string;
}

/** Generation metadata */
export interface GenerationMetadata {
  projectId?: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  [key: string]: unknown;
}

// ============================================================================
// Generation Executor
// ============================================================================

/**
 * Execute a generation using a provided executor function
 */
export function useGenerationExecutor(args: {
  context: ExecutionContext;
  generation: QueuedGeneration;
  metadata?: GenerationMetadata;
  execute: (params: ExecuteParams) => Promise<void>;
}): Promise<CompletedGeneration | FailedGeneration> {
  return executeGeneration(args);
}

/**
 * Core execution function
 */
async function executeGeneration(args: {
  context: ExecutionContext;
  generation: QueuedGeneration;
  metadata?: GenerationMetadata;
  execute: (params: ExecuteParams) => Promise<void>;
}): Promise<CompletedGeneration | FailedGeneration> {
  const { context, generation, metadata, execute } = args;
  const startedAt = Date.now();

  // Transition to running state
  const runningGeneration: RunningGeneration = {
    ...generation,
    status: 'running',
    startedAt,
  };

  // Store the running generation
  setGeneration(runningGeneration);
  context.callbacks?.onProgress?.({ stage: 'starting', message: 'Generation started' });

  // Create content resolver for upstream generations
  const generationContentResolver = createContentResolver(context);

  // Create app entry resolver (for user inputs)
  const appEntryResolver: AppEntryResolver = async (nodeId, outputId) => {
    // Default implementation - can be overridden in context
    return [];
  };

  // Result tracking
  let finalGeneration: CompletedGeneration | FailedGeneration;
  let generationOutputs: GenerationOutput[] = [];
  let generationInputs: InputMessage[] = [];

  // Finish generation helper
  const finishGeneration = async (result: FinishGenerationParams) => {
    generationOutputs = result.outputs;
    generationInputs = result.inputMessages;
  };

  // Set generation helper
  const setGenerationState = async (gen: Generation) => {
    setGeneration(gen);
  };

  try {
    context.callbacks?.onProgress?.({ stage: 'running', message: 'Executing...' });

    // Execute the generation
    await execute({
      runningGeneration,
      generationContext: generation.context,
      generationContentResolver,
      appEntryResolver,
      finishGeneration,
      setGeneration: setGenerationState,
    });

    // Complete the generation
    const completedGeneration: CompletedGeneration = {
      ...runningGeneration,
      status: 'completed',
      completedAt: Date.now(),
      outputs: generationOutputs,
      inputMessages: generationInputs,
    };

    setGeneration(completedGeneration);
    context.callbacks?.onProgress?.({ stage: 'finishing', percentage: 100, message: 'Complete' });
    context.callbacks?.onComplete?.(completedGeneration);

    finalGeneration = completedGeneration;
  } catch (error) {
    const failedGeneration: FailedGeneration = {
      ...runningGeneration,
      status: 'failed',
      failedAt: Date.now(),
      error: {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
    };

    setGeneration(failedGeneration);
    context.callbacks?.onError?.(failedGeneration.error);

    finalGeneration = failedGeneration;
  }

  return finalGeneration;
}

// ============================================================================
// Content Resolution
// ============================================================================

/**
 * Create a content resolver that can fetch outputs from completed generations
 */
function createContentResolver(context: ExecutionContext) {
  return async (nodeId: NodeId, outputId: OutputId): Promise<string | undefined> => {
    // Find generations for this node
    const nodeGenerations = getNodeGenerations(nodeId);

    if (nodeGenerations.length === 0) {
      return undefined;
    }

    // Get the most recent completed generation
    const completedGenerations = nodeGenerations.filter(isCompletedGeneration);
    if (completedGenerations.length === 0) {
      return undefined;
    }

    const latestGeneration = completedGenerations[completedGenerations.length - 1];

    // Find the output
    const output = latestGeneration.outputs.find(o => o.outputId === outputId);
    if (!output) {
      return undefined;
    }

    // Extract content based on output type
    switch (output.type) {
      case 'generated-text':
        return output.content;
      case 'generated-file':
        return output.content;
      case 'action-result':
        return JSON.stringify(output.content);
      case 'query-result':
        return queryResultToText(output);
      case 'data-query-result':
        return JSON.stringify(output.content);
      case 'source':
        return JSON.stringify(output.sources);
      case 'error':
        throw new Error(output.error.message);
      default:
        return undefined;
    }
  };
}

/**
 * Convert query result to text format
 */
export function queryResultToText(output: { content: unknown[] }): string {
  const results = output.content;
  if (!Array.isArray(results) || results.length === 0) {
    return '';
  }

  return results
    .map((result: any) => {
      if (result.records && Array.isArray(result.records)) {
        return result.records
          .map((record: any) => record.chunkContent || '')
          .join('\n\n');
      }
      return JSON.stringify(result);
    })
    .join('\n\n---\n\n');
}

// ============================================================================
// Generation Creation Helpers
// ============================================================================

/**
 * Create a new queued generation
 */
export function createQueuedGeneration(
  nodeId: NodeId,
  context: GenerationContext
): QueuedGeneration {
  return {
    id: createGenerationId(),
    nodeId,
    status: 'queued',
    createdAt: Date.now(),
    queuedAt: Date.now(),
    context,
  };
}

/**
 * Queue a generation for execution
 */
export async function queueGeneration(
  nodeId: NodeId,
  context: GenerationContext,
  executionContext: ExecutionContext
): Promise<QueuedGeneration> {
  const generation = createQueuedGeneration(nodeId, context);
  setGeneration(generation);
  return generation;
}

// ============================================================================
// Text Content Utilities
// ============================================================================

/**
 * Check if content is JSON
 */
export function isJsonContent(content: string): boolean {
  return isSharedJsonContent(content);
}

/**
 * Convert JSON content to plain text
 */
export function jsonContentToText(json: unknown): string {
  return toSharedText(json);
}

/**
 * Convert JSON content to plain text (preserving line breaks)
 */
export function jsonContentToPlainText(json: unknown): string {
  return toSharedPlainText(json);
}

/**
 * Strip markdown code blocks from text
 */
export function stripCodeBlock(text: string): string {
  const codeBlockPattern = /^```(?:\w+)?\s*([\s\S]*?)\s*```$/;
  const match = text.trim().match(codeBlockPattern);
  return match ? match[1] : text;
}
