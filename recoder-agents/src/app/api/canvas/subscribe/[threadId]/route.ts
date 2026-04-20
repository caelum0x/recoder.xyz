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

import { registerCanvasSubscriber } from '../../_subscribers';

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
