import {
  consumePendingCanvasRefreshEvent,
  doesCanvasRefreshMatchFilePath,
  normalizeCanvasWorkspacePath,
} from './live-updates';

describe('canvas live update helpers', () => {
  it('normalizes workspace and relative canvas paths', () => {
    expect(normalizeCanvasWorkspacePath('/workspace/canvases/board.excalidraw')).toBe(
      '/workspace/canvases/board.excalidraw',
    );
    expect(normalizeCanvasWorkspacePath('canvases/board.excalidraw')).toBe(
      '/workspace/canvases/board.excalidraw',
    );
    expect(normalizeCanvasWorkspacePath('workspace/canvases/board.excalidraw?t=123')).toBe(
      '/workspace/canvases/board.excalidraw',
    );
  });

  it('matches refresh events against the same canvas file', () => {
    expect(
      doesCanvasRefreshMatchFilePath(
        '/workspace/canvases/board.excalidraw',
        'canvases/board.excalidraw',
      ),
    ).toBe(true);

    expect(
      doesCanvasRefreshMatchFilePath(
        '/workspace/canvases/board.excalidraw',
        '/workspace/canvases/other-board.excalidraw',
      ),
    ).toBe(false);
  });

  it('consumes only fresh matching pending refresh events', () => {
    const pendingEvents = new Map<string, number>([
      ['canvases/expired.excalidraw', 1_000],
      ['canvases/board.excalidraw', 11_000],
      ['canvases/other.excalidraw', 11_500],
    ]);

    expect(
      consumePendingCanvasRefreshEvent(
        '/workspace/canvases/board.excalidraw',
        pendingEvents,
        15_000,
      ),
    ).toBe(true);

    expect(pendingEvents.has('canvases/board.excalidraw')).toBe(false);
    expect(pendingEvents.has('canvases/expired.excalidraw')).toBe(false);
    expect(pendingEvents.has('canvases/other.excalidraw')).toBe(true);
  });
});
