/**
 * @module canvas.routes
 *
 * Unified canvas update broadcast + persistence endpoint for the A2A system.
 *
 * Mounted at /api/a2a/canvas-update (with auth middleware applied by server.ts).
 *
 * POST /
 *   Body: { projectId, threadId?, elements, filePath?, sandboxId? }
 *   Broadcasts update to connected clients AND persists to sandbox file.
 *
 * GET /read
 *   Query: { sandboxId, filePath }
 *   Returns the current .excalidraw file contents from the sandbox.
 */

import { Router, type Request, type Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { getAgentBridgeService } from './agent-bridge.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-canvas-routes');

export interface CanvasRouterOptions {
  canvasHandlerUrl?: string;
  internalServiceKey?: string;
  relayFetch?: typeof fetch;
  /** Write a file to a sandbox container (Daytona or Docker). */
  writeFile?: (sandboxId: string, filePath: string, content: string) => Promise<void>;
  /** Read a file from a sandbox container. */
  readFile?: (sandboxId: string, filePath: string) => Promise<string>;
}

interface CanvasUpdateBody {
  projectId?: string;
  threadId?: string;
  elements?: unknown[];
  /** Path to the .excalidraw file inside the sandbox (e.g. canvases/board.excalidraw) */
  filePath?: string;
  /** Sandbox/container ID for file persistence */
  sandboxId?: string;
}

// Minimal Excalidraw scene shape for merging
interface ExcalidrawScene {
  type: string;
  version: number;
  source: string;
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

function publishCanvasEvent(projectId: string, threadId: string | null, elements: unknown[]): void {
  getA2AEventBus().publish({
    id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
    type: A2AEventType.CanvasUpdate,
    timestamp: new Date().toISOString(),
    workspaceId: projectId,
    data: {
      projectId,
      threadId,
      elements,
      elementCount: elements.length,
    },
  });
}

function broadcastCanvasUpdate(projectId: string, threadId: string | null, elements: unknown[]): void {
  getAgentBridgeService().broadcastToWorkspace(projectId, {
    type: 'canvas_update',
    projectId,
    threadId: threadId ?? '',
    elements,
    timestamp: Date.now(),
  } as any);
}

async function relayCanvasUpdate(
  options: CanvasRouterOptions,
  body: { projectId: string; threadId: string; elements: unknown[] },
): Promise<void> {
  const relayUrl = (options.canvasHandlerUrl || '').trim();
  if (!relayUrl) return;

  const relay = options.relayFetch ?? fetch;

  const response = await relay(relayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.internalServiceKey || ''}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`canvas handler relay failed with status ${response.status}`);
  }
}

/**
 * Merge incoming elements into an existing Excalidraw scene.
 * Elements are matched by `id` — existing elements are replaced, new ones appended.
 */
function mergeElements(existing: unknown[], incoming: unknown[]): unknown[] {
  const byId = new Map<string, unknown>();

  for (const el of existing) {
    const id = (el as any)?.id;
    if (id) byId.set(id, el);
  }

  for (const el of incoming) {
    const id = (el as any)?.id;
    if (id) {
      byId.set(id, el); // replace or insert
    } else {
      // Element without id — just append
      byId.set(`_anon_${byId.size}`, el);
    }
  }

  return [...byId.values()];
}

/**
 * Persist elements to the sandbox .excalidraw file.
 * Reads the current file, merges elements, writes back.
 */
async function persistToSandbox(
  options: CanvasRouterOptions,
  sandboxId: string,
  filePath: string,
  elements: unknown[],
): Promise<boolean> {
  if (!options.writeFile || !options.readFile) {
    return false;
  }

  try {
    // Read current scene
    let scene: ExcalidrawScene;
    try {
      const raw = await options.readFile(sandboxId, filePath);
      scene = JSON.parse(raw) as ExcalidrawScene;
      if (!Array.isArray(scene.elements)) {
        scene.elements = [];
      }
    } catch {
      // File doesn't exist or isn't valid JSON — create a new scene
      scene = {
        type: 'excalidraw',
        version: 2,
        source: 'https://agents.recoder.xyz',
        elements: [],
        appState: {},
        files: {},
      };
    }

    // Merge and write back
    scene.elements = mergeElements(scene.elements, elements);
    await options.writeFile(sandboxId, filePath, JSON.stringify(scene, null, 2));
    return true;
  } catch (err) {
    logger.warn({ err, sandboxId, filePath }, 'canvas file persistence failed (non-fatal)');
    return false;
  }
}

export function createCanvasRouter(options: CanvasRouterOptions = {}): Router {
  const router = Router();

  // ── POST / — push canvas update (broadcast + persist) ──────────────
  router.post('/', async (req: Request, res: Response) => {
    const { projectId, threadId, elements, filePath, sandboxId } = req.body as CanvasUpdateBody;

    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({ success: false, error: 'projectId is required' });
      return;
    }

    if (!Array.isArray(elements)) {
      res.status(400).json({ success: false, error: 'elements must be an array' });
      return;
    }

    const normalizedThreadId =
      typeof threadId === 'string' && threadId.trim().length > 0 ? threadId.trim() : null;

    // 1. Broadcast to live clients (event bus + bridge + SSE relay)
    publishCanvasEvent(projectId, normalizedThreadId, elements);
    broadcastCanvasUpdate(projectId, normalizedThreadId, elements);

    let relayed = false;
    if (normalizedThreadId) {
      try {
        await relayCanvasUpdate(options, {
          projectId,
          threadId: normalizedThreadId,
          elements,
        });
        relayed = true;
      } catch (err) {
        logger.warn(
          { err, url: options.canvasHandlerUrl, projectId, threadId: normalizedThreadId },
          'canvas handler relay failed (non-fatal)',
        );
      }
    }

    // 2. Persist to sandbox file (if sandboxId + filePath provided)
    let persisted = false;
    if (sandboxId && filePath) {
      persisted = await persistToSandbox(options, sandboxId, filePath, elements);
    }

    logger.info(
      { projectId, threadId: normalizedThreadId, elementCount: elements.length, persisted },
      'canvas update processed',
    );

    res.json({
      success: true,
      data: {
        projectId,
        threadId: normalizedThreadId,
        elementCount: elements.length,
        relayed,
        persisted,
      },
    });
  });

  // ── GET /read — read current board state from sandbox ──────────────
  router.get('/read', async (req: Request, res: Response) => {
    const sandboxId = req.query.sandboxId as string;
    const filePath = req.query.filePath as string;

    if (!sandboxId || !filePath) {
      res.status(400).json({ success: false, error: 'sandboxId and filePath are required' });
      return;
    }

    if (!options.readFile) {
      res.status(501).json({ success: false, error: 'file read not available' });
      return;
    }

    try {
      const raw = await options.readFile(sandboxId, filePath);
      const scene = JSON.parse(raw) as ExcalidrawScene;
      res.json({
        success: true,
        data: {
          elements: scene.elements || [],
          appState: scene.appState || {},
          elementCount: (scene.elements || []).length,
        },
      });
    } catch (err: any) {
      logger.warn({ err, sandboxId, filePath }, 'canvas read failed');
      res.status(404).json({
        success: false,
        error: err?.message || 'Board file not found or unreadable',
      });
    }
  });

  return router;
}
