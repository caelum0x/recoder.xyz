import { describe, expect, it } from 'vitest';
import {
  createEmptyExcalidrawScene,
  getExcalidrawDisplayName,
  isExcalidrawFileName,
  parseExcalidrawScene,
  serializeExcalidrawScene,
} from './excalidraw';

describe('excalidraw canvas utils', () => {
  it('detects supported Excalidraw board filenames', () => {
    expect(isExcalidrawFileName('brainstorm.excalidraw')).toBe(true);
    expect(isExcalidrawFileName('/workspace/boards/brainstorm.excalidraw.json')).toBe(true);
    expect(isExcalidrawFileName('diagram.json')).toBe(false);
  });

  it('derives a clean display name from supported filenames', () => {
    expect(getExcalidrawDisplayName('brainstorm.excalidraw')).toBe('brainstorm');
    expect(getExcalidrawDisplayName('brainstorm.excalidraw.json')).toBe('brainstorm');
    expect(getExcalidrawDisplayName('brainstorm.kanvax')).toBe('brainstorm.kanvax');
  });

  it('returns an empty scene for missing or invalid content', () => {
    expect(parseExcalidrawScene(null)).toEqual(createEmptyExcalidrawScene());
    expect(parseExcalidrawScene('not json')).toEqual(createEmptyExcalidrawScene());
  });

  it('normalizes parsed scene content', () => {
    const parsed = parseExcalidrawScene(JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'test',
      elements: [{ id: 'element-1' }],
      appState: { viewBackgroundColor: '#fff' },
      files: { 'file-1': { mimeType: 'image/png' } },
    }));

    expect(parsed.type).toBe('excalidraw');
    expect(parsed.version).toBe(2);
    expect(parsed.source).toBe('test');
    expect(parsed.elements).toHaveLength(1);
    expect(parsed.appState.viewBackgroundColor).toBe('#fff');
    expect(parsed.files['file-1']).toEqual({ mimeType: 'image/png' });
  });

  it('serializes only persisted app-state fields', () => {
    const serialized = serializeExcalidrawScene({
      elements: [{ id: 'element-1' }],
      appState: {
        viewBackgroundColor: '#fff',
        zoom: { value: 1.25 },
        openDialog: 'help',
      },
      files: { 'file-1': { mimeType: 'image/png' } },
    });

    const parsed = JSON.parse(serialized);

    expect(parsed.elements).toEqual([{ id: 'element-1' }]);
    expect(parsed.appState).toEqual({
      viewBackgroundColor: '#fff',
      zoom: { value: 1.25 },
    });
    expect(parsed.files['file-1']).toEqual({ mimeType: 'image/png' });
  });
});
