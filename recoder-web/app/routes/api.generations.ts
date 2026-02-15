/**
 * Generation Operations API
 *
 * Handles AI generation lifecycle following giselle HTTP router patterns.
 *
 * GET /api/generations?generationId=xxx - Get a specific generation
 * GET /api/generations?nodeId=xxx&origin=xxx - Get generations for a node
 * GET /api/generations?generationId=xxx&chunks=true - Get generation message chunks
 * GET /api/generations?taskId=xxx&indexes=true - Get task generation indexes
 * POST /api/generations - Create/queue a generation
 * POST /api/generations?action=cancel - Cancel a generation
 * POST /api/generations?action=set - Set generation state
 * POST /api/generations?action=generateContent - Generate content
 * POST /api/generations?action=generateImage - Generate image
 * POST /api/generations?action=startContentGeneration - Start content generation
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { z } from 'zod';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Generations');

// Dynamic import for session verification
async function verifySession(request: Request) {
  const { verifySession: verify } = await import('~/lib/auth/session.server');
  return verify(request);
}

// Request body type
interface GenerationRequestBody {
  generationId?: string;
  generation?: unknown;
}

// Schema definitions
const GenerationId = z.string().min(1).brand<'GenerationId'>();
const NodeId = z.string().min(1);
const TaskId = z.string().min(1);

const GenerationStatus = z.enum(['created', 'queued', 'running', 'completed', 'failed', 'cancelled']);

const GenerationOrigin = z.object({
  type: z.enum(['workspace', 'task', 'trigger']),
  id: z.string(),
});

const Generation = z.object({
  id: GenerationId,
  nodeId: NodeId.optional(),
  taskId: TaskId.optional(),
  origin: GenerationOrigin.optional(),
  status: GenerationStatus.default('created'),
  type: z.enum(['text', 'image', 'action', 'query']).default('text'),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  messageChunks: z.array(z.object({
    content: z.string(),
    timestamp: z.string(),
  })).optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const QueuedGeneration = z.object({
  id: GenerationId.optional(),
  nodeId: NodeId.optional(),
  taskId: TaskId.optional(),
  origin: GenerationOrigin.optional(),
  type: z.enum(['text', 'image', 'action', 'query']).default('text'),
  input: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
});

const RunningGeneration = z.object({
  id: GenerationId,
  nodeId: NodeId.optional(),
  taskId: TaskId.optional(),
  status: z.literal('running'),
  input: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
});

type GenerationType = z.infer<typeof Generation>;

// In-memory store (replace with DB in production)
const generationStore = new Map<string, GenerationType>();
const generationChunksStore = new Map<string, Array<{ content: string; timestamp: string; byteOffset: number }>>();

/**
 * Generate a unique generation ID
 */
function generateGenerationId(): string {
  return `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * GET /api/generations
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const generationId = url.searchParams.get('generationId');
    const nodeId = url.searchParams.get('nodeId');
    const originType = url.searchParams.get('originType');
    const originId = url.searchParams.get('originId');
    const taskId = url.searchParams.get('taskId');
    const chunks = url.searchParams.get('chunks') === 'true';
    const indexes = url.searchParams.get('indexes') === 'true';
    const startByte = parseInt(url.searchParams.get('startByte') || '0', 10);

    // Get generation message chunks
    if (generationId && chunks) {
      const allChunks = generationChunksStore.get(generationId) || [];
      const filteredChunks = allChunks.filter((c) => c.byteOffset >= startByte);

      return json({
        success: true,
        chunks: filteredChunks,
        totalBytes: allChunks.reduce((acc, c) => acc + c.content.length, 0),
      });
    }

    // Get task generation indexes
    if (taskId && indexes) {
      const taskGenerations = Array.from(generationStore.values())
        .filter((g) => g.taskId === taskId)
        .map((g, index) => ({
          generationId: g.id,
          index,
          status: g.status,
          type: g.type,
        }));

      return json({ success: true, indexes: taskGenerations });
    }

    // Get specific generation
    if (generationId) {
      const generation = generationStore.get(generationId);
      if (!generation) {
        return json({ success: false, error: 'Generation not found' }, { status: 404 });
      }
      return json({ success: true, generation });
    }

    // Get generations for a node
    if (nodeId && originType && originId) {
      const generations = Array.from(generationStore.values()).filter(
        (g) =>
          g.nodeId === nodeId &&
          g.origin?.type === originType &&
          g.origin?.id === originId
      );
      return json({ success: true, generations });
    }

    return json({ success: false, error: 'generationId, nodeId+origin, or taskId required' }, { status: 400 });
  } catch (error) {
    logger.error('[Generations] Loader error:', error);
    return json({
      success: false,
      error: 'Failed to get generations',
    }, { status: 500 });
  }
}

/**
 * POST /api/generations - Various generation actions
 */
export async function action({ request }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const actionType = url.searchParams.get('action');
    const body = await request.json() as GenerationRequestBody;

    // Cancel generation
    if (actionType === 'cancel') {
      const generationId = body.generationId;
      if (!generationId) {
        return json({ success: false, error: 'generationId required' }, { status: 400 });
      }

      const generation = generationStore.get(generationId);
      if (!generation) {
        return json({ success: false, error: 'Generation not found' }, { status: 404 });
      }

      const cancelledGeneration: GenerationType = {
        ...generation,
        status: 'cancelled',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      generationStore.set(generationId, cancelledGeneration);

      logger.info(`[Generations] Cancelled: ${generationId}`);
      return json({ success: true, generation: cancelledGeneration });
    }

    // Set generation state
    if (actionType === 'set') {
      const validation = Generation.safeParse((body as any).generation);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid generation data',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const generation = validation.data;
      generationStore.set(generation.id, generation);

      logger.info(`[Generations] Set: ${generation.id}`);
      return new Response(null, { status: 204 });
    }

    // Generate content (text generation)
    if (actionType === 'generateContent') {
      const validation = RunningGeneration.safeParse((body as any).generation);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid generation data',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const { id: generationId } = validation.data;
      const generation = generationStore.get(generationId);

      if (!generation) {
        return json({ success: false, error: 'Generation not found' }, { status: 404 });
      }

      // Simulate content generation (in production, this would call the AI provider)
      const runningGeneration: GenerationType = {
        ...generation,
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      generationStore.set(generationId, runningGeneration);

      // In production, this would stream content and update the generation
      // For now, we just return the running state
      logger.info(`[Generations] Generating content: ${generationId}`);
      return json({ success: true, generation: runningGeneration });
    }

    // Generate image
    if (actionType === 'generateImage') {
      const validation = QueuedGeneration.safeParse((body as any).generation);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid generation data',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const generationId = validation.data.id || generateGenerationId();
      const now = new Date().toISOString();

      const generation: GenerationType = {
        id: generationId as any,
        nodeId: validation.data.nodeId,
        taskId: validation.data.taskId,
        origin: validation.data.origin,
        status: 'running',
        type: 'image',
        input: validation.data.input,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
        metadata: { userId: session.user.id },
      };

      generationStore.set(generationId, generation);

      // In production, this would call an image generation API
      logger.info(`[Generations] Generating image: ${generationId}`);
      return new Response(null, { status: 204 });
    }

    // Start content generation
    if (actionType === 'startContentGeneration') {
      const validation = Generation.safeParse((body as any).generation);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid generation data',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const generation = validation.data;
      const runningGeneration: GenerationType = {
        ...generation,
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      generationStore.set(generation.id, runningGeneration);

      logger.info(`[Generations] Started content generation: ${generation.id}`);
      return json({ success: true, generation: runningGeneration });
    }

    // Execute action
    if (actionType === 'executeAction') {
      const validation = QueuedGeneration.safeParse((body as any).generation);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid generation data',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const generationId = validation.data.id || generateGenerationId();
      const now = new Date().toISOString();

      const generation: GenerationType = {
        id: generationId as any,
        nodeId: validation.data.nodeId,
        taskId: validation.data.taskId,
        origin: validation.data.origin,
        status: 'running',
        type: 'action',
        input: validation.data.input,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
        metadata: { userId: session.user.id },
      };

      generationStore.set(generationId, generation);

      // In production, this would execute the action
      logger.info(`[Generations] Executing action: ${generationId}`);
      return new Response(null, { status: 204 });
    }

    // Execute query
    if (actionType === 'executeQuery' || actionType === 'executeDataQuery') {
      const validation = QueuedGeneration.safeParse((body as any).generation);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid generation data',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const generationId = validation.data.id || generateGenerationId();
      const now = new Date().toISOString();

      const generation: GenerationType = {
        id: generationId as any,
        nodeId: validation.data.nodeId,
        taskId: validation.data.taskId,
        origin: validation.data.origin,
        status: 'running',
        type: 'query',
        input: validation.data.input,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
        metadata: { userId: session.user.id },
      };

      generationStore.set(generationId, generation);

      logger.info(`[Generations] Executing query: ${generationId}`);
      return new Response(null, { status: 204 });
    }

    // Default: Queue a new generation
    if (request.method === 'POST') {
      const validation = QueuedGeneration.safeParse(body);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid generation data',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const generationId = validation.data.id || generateGenerationId();
      const now = new Date().toISOString();

      const generation: GenerationType = {
        id: generationId as any,
        nodeId: validation.data.nodeId,
        taskId: validation.data.taskId,
        origin: validation.data.origin,
        status: 'queued',
        type: validation.data.type,
        input: validation.data.input,
        createdAt: now,
        updatedAt: now,
        metadata: { userId: session.user.id },
      };

      generationStore.set(generationId, generation);

      logger.info(`[Generations] Queued: ${generationId}`);
      return json({ success: true, generation });
    }

    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    logger.error('[Generations] Action error:', error);
    return json({
      success: false,
      error: 'Generation operation failed',
    }, { status: 500 });
  }
}
