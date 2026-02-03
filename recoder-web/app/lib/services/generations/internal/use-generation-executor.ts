/**
 * Generation Executor Hook
 * Provides utilities for executing generations with proper state management
 */

import { getGeneration, getNodeGenerationIndexes, getTaskGenerationIndexes } from '../storage';
import type {
  AppEntryResolver,
  CompletedGeneration,
  DataContent,
  FailedGeneration,
  FileId,
  Generation,
  GenerationContext,
  GenerationContextConfig,
  GenerationMetadata,
  GenerationOutput,
  GenerationUsage,
  ImagePart,
  Message,
  ModelMessage,
  NodeId,
  OnGenerationComplete,
  OnGenerationError,
  OutputFileBlob,
  OutputId,
  QueuedGeneration,
  RunningGeneration,
  TaskId,
  WorkspaceId,
  isCompletedGeneration,
  isQueuedGeneration,
} from '../types';
import { sanitizeGenerationUsage } from '../utils';
import { internalSetGeneration } from './set-generation';

// =============================================================================
// Types
// =============================================================================

export interface FinishGenerationArgs {
  outputs: GenerationOutput[];
  usage?: GenerationUsage;
  generateMessages?: Message[];
  inputMessages: ModelMessage[];
  providerMetadata?: unknown;
  generationMetadata?: GenerationMetadata;
  onComplete?: OnGenerationComplete;
}

export type FinishGeneration = (args: FinishGenerationArgs) => Promise<{
  completedGeneration: CompletedGeneration;
  outputFileBlobs: OutputFileBlob[];
}>;

export interface ExecutorUtils {
  runningGeneration: RunningGeneration;
  generationContext: GenerationContext;
  setGeneration: (generation: Generation) => Promise<void>;
  fileResolver: (fileId: FileId) => Promise<DataContent>;
  generationContentResolver: (nodeId: NodeId, outputId: OutputId) => Promise<string | undefined>;
  imageGenerationResolver: (nodeId: NodeId, outputId: OutputId) => Promise<ImagePart[] | undefined>;
  appEntryResolver: AppEntryResolver;
  workspaceId: WorkspaceId;
  signal?: AbortSignal;
  finishGeneration: FinishGeneration;
}

export interface UseGenerationExecutorArgs<T> {
  context: GenerationContextConfig;
  generation: QueuedGeneration | RunningGeneration;
  signal?: AbortSignal;
  metadata?: GenerationMetadata;
  execute: (utils: ExecutorUtils) => Promise<T>;
  onError?: OnGenerationError;
}

// =============================================================================
// Error Class
// =============================================================================

export class UsageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageLimitError';
  }
}

// =============================================================================
// Main Executor
// =============================================================================

export async function useGenerationExecutor<T>(
  args: UseGenerationExecutorArgs<T>,
): Promise<T> {
  const { context, generation, signal, metadata, execute, onError } = args;

  const generationContext = generation.context;

  // Convert queued generation to running if needed
  const runningGeneration: RunningGeneration =
    generation.status === 'queued'
      ? {
          ...generation,
          status: 'running',
          messages: [],
          startedAt: Date.now(),
        }
      : (generation as RunningGeneration);

  // Set generation function
  const setGeneration = async (gen: Generation) => {
    await internalSetGeneration({
      storage: context.storage,
      generation: gen,
    });
  };

  // Update to running status if was queued
  if (generation.status === 'queued') {
    await setGeneration(runningGeneration);
  }

  // Get workspace ID
  const workspaceId = generation.context.origin.workspaceId;

  // Check usage limits if configured
  if (context.fetchUsageLimitsFn) {
    const usageLimitCheckStartTime = Date.now();
    const usageLimits = await context.fetchUsageLimitsFn(workspaceId);
    context.logger.info(
      `Usage limit check completed in ${Date.now() - usageLimitCheckStartTime}ms`,
    );

    const agentTimeLimits = usageLimits.resourceLimits.agentTime;
    if (agentTimeLimits.used >= agentTimeLimits.limit) {
      const failedGeneration: FailedGeneration = {
        ...runningGeneration,
        status: 'failed',
        failedAt: Date.now(),
        error: {
          name: 'UsageLimitError',
          message: 'Access denied: insufficient agent time for the requested generation.',
        },
      };
      await Promise.all([
        setGeneration(failedGeneration),
        onError?.({ generation: failedGeneration, inputMessages: [] }),
      ]);
      throw new UsageLimitError(failedGeneration.error.message);
    }
  }

  // Build file resolver
  const fileResolver = async (fileId: FileId): Promise<DataContent> => {
    const fileRetrievalStartTime = Date.now();

    // Try to find the file in source nodes for cloned files
    let actualFileId = fileId;
    for (const sourceNode of generationContext.sourceNodes) {
      if (sourceNode.content.type !== 'file') continue;
      for (const file of sourceNode.content.files ?? []) {
        if (file.id === fileId && file.originalFileIdForCopy) {
          actualFileId = file.originalFileIdForCopy;
          break;
        }
      }
    }

    const path = `files/${workspaceId}/${actualFileId}`;
    const exists = await context.storage.exists(path);
    const blob = exists ? await context.storage.getBlob(path) : undefined;

    context.logger.info(
      `File retrieval completed in ${Date.now() - fileRetrievalStartTime}ms (fileId: ${fileId})`,
    );

    if (blob === undefined) {
      context.logger.warn(`File not found (fileId: ${fileId})`);
      return new Uint8Array() as DataContent;
    }
    return blob as DataContent;
  };

  // Build generation finders
  const findGeneration = async (nodeId: NodeId) => {
    const taskId = runningGeneration.context.origin.taskId;
    if (taskId === undefined) {
      return findGenerationByNode(nodeId);
    }
    return findGenerationByTask(nodeId, taskId);
  };

  const findGenerationByNode = async (nodeId: NodeId) => {
    const generationLookupStartTime = Date.now();
    const nodeGenerationIndexes = await getNodeGenerationIndexes({
      storage: context.storage,
      nodeId,
    });
    if (nodeGenerationIndexes === undefined || nodeGenerationIndexes.length === 0) {
      context.logger.info(
        `Generation lookup by node completed in ${Date.now() - generationLookupStartTime}ms (nodeId: ${nodeId}, found: false)`,
      );
      return undefined;
    }
    const gen = await getGeneration({
      storage: context.storage,
      generationId: nodeGenerationIndexes[nodeGenerationIndexes.length - 1].id,
    });
    context.logger.info(
      `Generation lookup by node completed in ${Date.now() - generationLookupStartTime}ms (nodeId: ${nodeId}, found: true)`,
    );
    return gen;
  };

  const findGenerationByTask = async (nodeId: NodeId, taskId: TaskId) => {
    const taskGenerationLookupStartTime = Date.now();
    const taskGenerationIndexes = await getTaskGenerationIndexes({
      storage: context.storage,
      taskId,
    });
    const targetGenerationIndex = taskGenerationIndexes?.find(
      (index) => index.nodeId === nodeId,
    );
    if (targetGenerationIndex === undefined) {
      context.logger.info(
        `Generation lookup by task completed in ${Date.now() - taskGenerationLookupStartTime}ms (nodeId: ${nodeId}, taskId: ${taskId}, found: false)`,
      );
      return undefined;
    }
    const gen = await getGeneration({
      storage: context.storage,
      generationId: targetGenerationIndex.id,
    });
    context.logger.info(
      `Generation lookup by task completed in ${Date.now() - taskGenerationLookupStartTime}ms (nodeId: ${nodeId}, taskId: ${taskId}, found: true)`,
    );
    return gen;
  };

  const findOutput = (outputId: OutputId) => {
    for (const sourceNode of runningGeneration.context.sourceNodes) {
      for (const sourceOutput of sourceNode.outputs) {
        if (sourceOutput.id === outputId) {
          return sourceOutput;
        }
      }
    }
    return undefined;
  };

  // Build generation content resolver
  const generationContentResolver = async (
    nodeId: NodeId,
    outputId: OutputId,
  ): Promise<string | undefined> => {
    const gen = await findGeneration(nodeId);
    if (gen === undefined || gen.status !== 'completed') {
      return undefined;
    }

    const output = findOutput(outputId);
    if (output === undefined) {
      return undefined;
    }

    const generationOutput = gen.outputs.find((o) => o.outputId === outputId);
    if (generationOutput === undefined) {
      return undefined;
    }

    switch (generationOutput.type) {
      case 'generated-text':
        return generationOutput.content;
      case 'source':
        return JSON.stringify(generationOutput.sources);
      default:
        return undefined;
    }
  };

  // Build image generation resolver
  const imageGenerationResolver = async (
    nodeId: NodeId,
    outputId: OutputId,
  ): Promise<ImagePart[] | undefined> => {
    const gen = await findGeneration(nodeId);
    if (gen === undefined || gen.status !== 'completed') {
      return undefined;
    }

    const output = findOutput(outputId);
    if (output === undefined) {
      return undefined;
    }

    const imageGenerationOutput = gen.outputs.find(
      (o) => o.type === 'generated-image' && o.outputId === outputId,
    );

    if (imageGenerationOutput === undefined || !imageGenerationOutput.contents) {
      return undefined;
    }

    const imageParts = await Promise.all(
      imageGenerationOutput.contents.map(async (content) => {
        try {
          const path = `generations/${gen.id}/generated-images/${content.filename}`;
          const image = await context.storage.getBlob(path);
          return {
            type: 'image' as const,
            image,
            mediaType: content.contentType,
          };
        } catch (error) {
          context.logger.error(
            error instanceof Error ? error : new Error(String(error)),
            `Failed to load generated image: ${content.filename}`,
          );
          return undefined;
        }
      }),
    );

    const validParts = imageParts.filter((part): part is { type: 'image'; image: Uint8Array; mediaType: string } => part !== undefined) as ImagePart[];
    return validParts.length > 0 ? validParts : undefined;
  };

  // Build app entry resolver
  const appEntryResolver: AppEntryResolver = async (nodeId, outputId) => {
    const appEntryNode = generation.context.sourceNodes.find(
      (sourceNode) => sourceNode.id === nodeId,
    );
    if (appEntryNode === undefined) {
      throw new Error(`Node<${nodeId}> not found`);
    }

    const output = appEntryNode.outputs.find((o) => o.id === outputId);
    if (output === undefined) {
      throw new Error(`Output<${outputId}> not found`);
    }

    const parameterInput = generationContext.inputs?.find((input) => input.type === 'parameters');
    if (parameterInput === undefined) {
      throw new Error('No parameters input found');
    }

    const parameter = parameterInput.items.find((item) => item.name === output.accessor);
    if (parameter === undefined) {
      context.logger.warn(`Parameter ${output.accessor} not found`);
      return [];
    }

    switch (parameter.type) {
      case 'string':
        return [{ type: 'text', text: parameter.value as string }];
      case 'number':
        return [{ type: 'text', text: `${parameter.value}` }];
      case 'files':
        // Handle file parameters
        return [];
      default:
        return [];
    }
  };

  // Build finish generation function
  const finishGeneration: FinishGeneration = async ({
    outputs,
    usage,
    inputMessages,
    generateMessages,
    providerMetadata,
    onComplete,
  }) => {
    const sanitizedUsage = sanitizeGenerationUsage(usage);
    const completionStartTime = Date.now();

    const completedGeneration: CompletedGeneration = {
      ...runningGeneration,
      status: 'completed',
      completedAt: Date.now(),
      outputs,
      usage: sanitizedUsage,
      messages: generateMessages ?? [],
    };

    const outputFileBlobs: OutputFileBlob[] = [];

    // Process generated images
    const imageProcessingStartTime = Date.now();
    for (const output of outputs) {
      if (output.type !== 'generated-image' || !output.contents) continue;

      for (const content of output.contents) {
        const path = `generations/${generation.id}/generated-images/${content.filename}`;
        const bytes = await context.storage.getBlob(path);

        outputFileBlobs.push({
          id: content.id,
          outputId: output.outputId,
          contentType: content.contentType,
          bytes,
        });
      }
    }
    context.logger.info(
      `Image processing completed in ${Date.now() - imageProcessingStartTime}ms (${outputFileBlobs.length} images)`,
    );

    // Final processing
    const finalProcessingStartTime = Date.now();
    await Promise.all([
      setGeneration(completedGeneration),
      context.onConsumeAgentTime?.(
        workspaceId,
        completedGeneration.startedAt,
        completedGeneration.completedAt,
        completedGeneration.completedAt - completedGeneration.startedAt,
      ),
      onComplete?.({
        generation: completedGeneration,
        inputMessages,
        outputFileBlobs,
        providerMetadata,
        generationMetadata: metadata,
      }),
    ]);

    context.logger.info(
      `Final processing completed in ${Date.now() - finalProcessingStartTime}ms`,
    );
    context.logger.info(
      `Generation completion total time: ${Date.now() - completionStartTime}ms`,
    );

    return { completedGeneration, outputFileBlobs };
  };

  // Execute the generation
  return execute({
    runningGeneration,
    generationContext,
    setGeneration,
    fileResolver,
    generationContentResolver,
    imageGenerationResolver,
    appEntryResolver,
    workspaceId,
    signal,
    finishGeneration,
  });
}
