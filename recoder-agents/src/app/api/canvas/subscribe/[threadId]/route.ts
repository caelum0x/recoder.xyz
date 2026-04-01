/**
 * SSE endpoint for live Excalidraw canvas updates.
 * Browsers connect here; docker-backend POSTs to /api/canvas/push to relay elements.
 *
 * Flow:
 *   agent → recoder_canvas_update MCP → docker-backend POST /api/a2a/canvas-update
 *         → (if RECODER_A2A_CANVAS_HANDLER_URL set) POST here /api/canvas/push
 *         → SSE push → CanvasPanel.excalidrawAPI.updateScene()
 */

export const dynamic = 'force-dynamic';

// In-process subscriber registry: threadId → Set<ReadableStreamDefaultController>
const subscribers = new Map<string, Set<ReadableStreamDefaultController>>();

export function registerCanvasSubscriber(
  threadId: string,
  controller: ReadableStreamDefaultController
): () => void {
  if (!subscribers.has(threadId)) subscribers.set(threadId, new Set());
  subscribers.get(threadId)!.add(controller);
  return () => {
    subscribers.get(threadId)?.delete(controller);
    if (subscribers.get(threadId)?.size === 0) subscribers.delete(threadId);
  };
}

export function pushCanvasUpdate(threadId: string, payload: unknown): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  const encoded = new TextEncoder().encode(data);
  for (const ctrl of subscribers.get(threadId) ?? []) {
    try {
      ctrl.enqueue(encoded);
    } catch {
      // controller closed
    }
  }
}

// GET /api/canvas/subscribe/[threadId] — browser SSE subscription
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = registerCanvasSubscriber(threadId, controller);
      // Send a heartbeat comment every 25 s to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      // Cleanup when client disconnects
      _request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
