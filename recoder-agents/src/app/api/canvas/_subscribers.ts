const subscribers = new Map<string, Set<ReadableStreamDefaultController>>();

export function registerCanvasSubscriber(
  threadId: string,
  controller: ReadableStreamDefaultController,
): () => void {
  if (!subscribers.has(threadId)) {
    subscribers.set(threadId, new Set());
  }
  subscribers.get(threadId)!.add(controller);

  return () => {
    subscribers.get(threadId)?.delete(controller);
    if (subscribers.get(threadId)?.size === 0) {
      subscribers.delete(threadId);
    }
  };
}

export function pushCanvasUpdate(threadId: string, payload: unknown): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  const encoded = new TextEncoder().encode(data);

  for (const controller of subscribers.get(threadId) ?? []) {
    try {
      controller.enqueue(encoded);
    } catch {
      // Controller already closed.
    }
  }
}
