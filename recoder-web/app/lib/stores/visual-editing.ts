/**
 * Visual Editing Store
 * Manages state for visual editing mode in the preview panel.
 * Allows users to click components in the preview to select them and edit their styles.
 */

import { atom, computed } from 'nanostores';

/** Information about a selected component from the preview iframe */
export interface SelectedComponent {
  /** Unique ID of the element in the iframe */
  id: string;
  /** React component name (if available) */
  name: string;
  /** Relative file path to the component */
  filePath: string;
  /** Line number in the file */
  lineNumber?: number;
  /** Column number in the file */
  columnNumber?: number;
  /** HTML tag name */
  tagName: string;
  /** Element's text content (if any) */
  textContent?: string;
  /** Current computed styles */
  computedStyles?: ComponentStyles;
  /** Bounding rect of the element */
  bounds?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

/** Style values for a component */
export interface ComponentStyles {
  margin?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  padding?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  border?: {
    width: string;
    radius: string;
    color: string;
    style: string;
  };
  backgroundColor?: string;
  text?: {
    fontSize: string;
    fontWeight: string;
    fontFamily: string;
    color: string;
    lineHeight: string;
  };
}

/** Pending style changes to apply */
export interface PendingStyleChange {
  componentId: string;
  componentName: string;
  filePath: string;
  lineNumber?: number;
  styles: Partial<ComponentStyles>;
  textContent?: string;
}

// ==================== ATOMS ====================

/** Whether visual editing mode is enabled */
export const visualEditingEnabled = atom<boolean>(false);

/** Currently selected component (null when nothing selected) */
export const selectedComponent = atom<SelectedComponent | null>(null);

/** All selected components (for multi-select if needed in future) */
export const selectedComponents = atom<SelectedComponent[]>([]);

/** Pending style changes to apply */
export const pendingStyleChanges = atom<Map<string, PendingStyleChange>>(new Map());

/** Current coordinates of the selected element (for positioning toolbar) */
export const componentCoordinates = atom<{
  top: number;
  left: number;
  width: number;
  height: number;
} | null>(null);

/** Whether the component has dynamic styling (e.g., styled-components, CSS-in-JS) */
export const isDynamicallyStyled = atom<boolean>(false);

/** Whether the selected element has editable text content */
export const hasStaticText = atom<boolean>(false);

// ==================== COMPUTED ====================

/** Whether there are any pending changes to apply */
export const hasPendingChanges = computed(
  pendingStyleChanges,
  (changes) => changes.size > 0
);

/** Count of pending changes */
export const pendingChangesCount = computed(
  pendingStyleChanges,
  (changes) => changes.size
);

// ==================== ACTIONS ====================

/**
 * Enable or disable visual editing mode
 */
export function setVisualEditingEnabled(enabled: boolean): void {
  visualEditingEnabled.set(enabled);
  if (!enabled) {
    // Clear selection when disabling
    clearSelection();
  }
  console.log(`[VisualEditing] Mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Toggle visual editing mode
 */
export function toggleVisualEditingMode(): void {
  setVisualEditingEnabled(!visualEditingEnabled.get());
}

/**
 * Select a component from the preview
 */
export function selectComponent(component: SelectedComponent): void {
  selectedComponent.set(component);
  selectedComponents.set([component]);

  if (component.bounds) {
    componentCoordinates.set(component.bounds);
  }

  console.log(`[VisualEditing] Selected: ${component.name} (${component.filePath}:${component.lineNumber})`);
}

/**
 * Clear the current selection
 */
export function clearSelection(): void {
  selectedComponent.set(null);
  selectedComponents.set([]);
  componentCoordinates.set(null);
  isDynamicallyStyled.set(false);
  hasStaticText.set(false);
}

/**
 * Update component coordinates (e.g., after scroll or resize)
 */
export function updateComponentCoordinates(bounds: {
  top: number;
  left: number;
  width: number;
  height: number;
}): void {
  componentCoordinates.set(bounds);
}

/**
 * Update computed styles for the selected component
 */
export function updateComponentStyles(styles: ComponentStyles): void {
  const current = selectedComponent.get();
  if (current) {
    selectedComponent.set({
      ...current,
      computedStyles: styles,
    });
  }
}

/**
 * Set whether the component is dynamically styled
 */
export function setDynamicallyStyled(dynamic: boolean): void {
  isDynamicallyStyled.set(dynamic);
}

/**
 * Set whether the element has static text
 */
export function setHasStaticText(hasText: boolean): void {
  hasStaticText.set(hasText);
}

/**
 * Add a pending style change
 */
export function addPendingStyleChange(change: PendingStyleChange): void {
  const changes = new Map(pendingStyleChanges.get());
  const existing = changes.get(change.componentId);

  if (existing) {
    // Merge with existing changes
    changes.set(change.componentId, {
      ...existing,
      styles: {
        ...existing.styles,
        ...change.styles,
        // Deep merge nested objects
        margin: { ...existing.styles.margin, ...change.styles.margin } as ComponentStyles['margin'],
        padding: { ...existing.styles.padding, ...change.styles.padding } as ComponentStyles['padding'],
        border: { ...existing.styles.border, ...change.styles.border } as ComponentStyles['border'],
        text: { ...existing.styles.text, ...change.styles.text } as ComponentStyles['text'],
      },
    });
  } else {
    changes.set(change.componentId, change);
  }

  pendingStyleChanges.set(changes);
}

/**
 * Remove a pending style change
 */
export function removePendingStyleChange(componentId: string): void {
  const changes = new Map(pendingStyleChanges.get());
  changes.delete(componentId);
  pendingStyleChanges.set(changes);
}

/**
 * Clear all pending style changes
 */
export function clearPendingStyleChanges(): void {
  pendingStyleChanges.set(new Map());
}

/**
 * Get all pending changes as an array
 */
export function getPendingChangesArray(): PendingStyleChange[] {
  return Array.from(pendingStyleChanges.get().values());
}

/**
 * Generate a prompt for the AI to edit the selected component
 */
export function generateEditPrompt(): string {
  const component = selectedComponent.get();
  if (!component) {
    return '';
  }

  const changes = pendingStyleChanges.get().get(component.id);

  let prompt = `Edit the component "${component.name}" in file ${component.filePath}`;
  if (component.lineNumber) {
    prompt += ` at line ${component.lineNumber}`;
  }
  prompt += '.\n\n';

  if (changes?.styles) {
    prompt += 'Apply the following style changes:\n';
    const { margin, padding, border, backgroundColor, text } = changes.styles;

    if (margin) {
      prompt += `- Margin: top=${margin.top}, right=${margin.right}, bottom=${margin.bottom}, left=${margin.left}\n`;
    }
    if (padding) {
      prompt += `- Padding: top=${padding.top}, right=${padding.right}, bottom=${padding.bottom}, left=${padding.left}\n`;
    }
    if (border) {
      prompt += `- Border: width=${border.width}, radius=${border.radius}, color=${border.color}\n`;
    }
    if (backgroundColor) {
      prompt += `- Background color: ${backgroundColor}\n`;
    }
    if (text) {
      prompt += `- Text styles: size=${text.fontSize}, weight=${text.fontWeight}, family=${text.fontFamily}, color=${text.color}\n`;
    }
  } else {
    prompt += 'Please describe what changes you would like to make to this component.';
  }

  return prompt;
}

/**
 * Reset all visual editing state
 */
export function resetVisualEditingState(): void {
  visualEditingEnabled.set(false);
  selectedComponent.set(null);
  selectedComponents.set([]);
  componentCoordinates.set(null);
  pendingStyleChanges.set(new Map());
  isDynamicallyStyled.set(false);
  hasStaticText.set(false);
}
