import { describe, expect, it } from 'vitest';

import { isCanvasFile, parseCanvasFilePath } from './_utils';

describe('canvas tool utils', () => {
  it('recognizes both kanvax and excalidraw board files', () => {
    expect(isCanvasFile('/workspace/canvases/board.kanvax')).toBe(true);
    expect(isCanvasFile('/workspace/canvases/board.excalidraw')).toBe(true);
    expect(isCanvasFile('/workspace/canvases/board.excalidraw.json')).toBe(true);
    expect(isCanvasFile('/workspace/notes/todo.md')).toBe(false);
  });

  it('parses canvas names from excalidraw board paths', () => {
    expect(parseCanvasFilePath('/workspace/canvases/customer-journey.excalidraw')).toEqual({
      isValid: true,
      canvasName: 'customer-journey',
    });

    expect(parseCanvasFilePath('canvases/system-map.excalidraw.json')).toEqual({
      isValid: true,
      canvasName: 'system-map',
    });
  });
});
