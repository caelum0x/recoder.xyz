import { describe, expect, it } from 'vitest';

import {
  canvasActionDefinitions,
  canvasStarterCategories,
  getCanvasActionDefinition,
  getCanvasActionName,
  getCanvasActionPrompt,
  normalizeCanvasActionId,
} from './mode-config';

describe('canvas mode config', () => {
  it('normalizes legacy canvas action ids to the new board actions', () => {
    expect(normalizeCanvasActionId('create')).toBe('board');
    expect(normalizeCanvasActionId('edit')).toBe('diagram');
    expect(normalizeCanvasActionId('upscale')).toBe('wireframe');
    expect(normalizeCanvasActionId('remove-bg')).toBe('flowchart');
  });

  it('returns board-oriented prompts for both canonical and legacy action ids', () => {
    const prompt = getCanvasActionPrompt('create');

    expect(prompt).toContain('.excalidraw');
    expect(prompt).toContain('/workspace/canvases/');
    expect(prompt).toContain('shapes, connectors, and labels');
    expect(getCanvasActionPrompt('diagram')).toContain('diagram in a new `.excalidraw` board');
  });

  it('exposes names through the shared lookup instead of translation-only ids', () => {
    expect(getCanvasActionName('board')).toBe('Blank Board');
    expect(getCanvasActionName('remove-bg')).toBe('Flowchart');
    expect(getCanvasActionDefinition('wireframe')?.description).toBe('Screens, layouts, and notes');
  });

  it('keeps starter templates aligned with the board workflow', () => {
    expect(canvasActionDefinitions).toHaveLength(4);
    expect(canvasStarterCategories.length).toBeGreaterThan(0);
    expect(
      canvasStarterCategories.every((category) =>
        category.templates.every((template) => template.prompt.includes('.excalidraw')),
      ),
    ).toBe(true);
  });
});
