/**
 * Indent Guides Extension for CodeMirror
 *
 * Shows vertical lines at each indentation level to help visualize code structure.
 * Uses @replit/codemirror-indentation-markers for the core functionality.
 */

import { indentationMarkers } from '@replit/codemirror-indentation-markers';
import { StateField, StateEffect, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * State effect to toggle indent guides visibility
 */
export const toggleIndentGuidesEffect = StateEffect.define<boolean>();

/**
 * State field to track indent guides enabled state
 */
export const indentGuidesEnabledField = StateField.define<boolean>({
  create() {
    return true;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(toggleIndentGuidesEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * Create the indent guides extension with theme-aware styling
 */
export function indentGuides(options: {
  highlightActiveBlock?: boolean;
  hideFirstIndent?: boolean;
} = {}): Extension {
  const {
    highlightActiveBlock = true,
    hideFirstIndent = false,
  } = options;

  return [
    indentGuidesEnabledField,
    // Use the replit indentation markers extension
    indentationMarkers({
      highlightActiveBlock,
      hideFirstIndent,
      // Custom colors to match our theme
      colors: {
        light: 'rgba(0, 0, 0, 0.1)',
        dark: 'rgba(255, 255, 255, 0.1)',
        activeLight: 'rgba(0, 0, 0, 0.25)',
        activeDark: 'rgba(255, 255, 255, 0.25)',
      },
      // Thickness of the indent guide lines
      thickness: 1,
      // Additional class for styling
      markerType: 'fullScope',
    }),
    // Add custom theme styles for indent guides
    EditorView.theme({
      // Style the indent marker lines
      '.cm-indentation-marker': {
        display: 'inline-block',
        boxShadow: '1px 0 0 0 var(--cm-indent-guide-color, rgba(255, 255, 255, 0.1))',
      },
      '.cm-indentation-marker.cm-indentation-marker-active': {
        boxShadow: '1px 0 0 0 var(--cm-indent-guide-active-color, rgba(255, 255, 255, 0.25))',
      },
    }),
  ];
}

/**
 * Toggle indent guides visibility
 */
export function toggleIndentGuides(view: EditorView, enabled: boolean): void {
  view.dispatch({
    effects: toggleIndentGuidesEffect.of(enabled),
  });
}
