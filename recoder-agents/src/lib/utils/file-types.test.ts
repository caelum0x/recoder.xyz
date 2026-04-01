import { describe, expect, it } from 'vitest';
import { isExcalidrawFile, isPreviewableFile } from './file-types';

describe('file type utilities', () => {
  it('treats Excalidraw boards as previewable files', () => {
    expect(isExcalidrawFile('/workspace/boards/brainstorm.excalidraw')).toBe(true);
    expect(isExcalidrawFile('/workspace/boards/brainstorm.excalidraw.json')).toBe(true);
    expect(isPreviewableFile('/workspace/boards/brainstorm.excalidraw')).toBe(true);
    expect(isPreviewableFile('/workspace/boards/brainstorm.excalidraw.json')).toBe(true);
  });
});
