/**
 * Visual Editing Types
 * Core type definitions for the visual editing system.
 */

/** Spacing values for margin/padding */
export interface SpacingValues {
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
}

/** Style object representing all editable CSS properties */
export interface StyleObject {
  margin?: SpacingValues;
  padding?: SpacingValues;
  dimensions?: {
    width?: string;
    height?: string;
  };
  border?: {
    width?: string;
    radius?: string;
    color?: string;
  };
  backgroundColor?: string;
  text?: {
    fontSize?: string;
    fontWeight?: string;
    color?: string;
    fontFamily?: string;
  };
}

/** A visual editing change to apply to a component */
export interface VisualEditingChange {
  /** Unique identifier for the component (format: filePath:line:column) */
  componentId: string;
  /** Component name (e.g., "Button", "Header") */
  componentName: string;
  /** Relative file path from project root */
  relativePath: string;
  /** Line number in the file */
  lineNumber: number;
  /** Style changes to apply */
  styles: StyleObject;
  /** Optional text content change */
  textContent?: string;
}

/** Parameters for applying visual editing changes */
export interface ApplyVisualEditingChangesParams {
  /** Project ID or path */
  projectId: string;
  /** Array of changes to apply */
  changes: VisualEditingChange[];
}

/** Parameters for analyzing a component */
export interface AnalyzeComponentParams {
  /** Project ID or path */
  projectId: string;
  /** Component ID (format: filePath:line) */
  componentId: string;
}

/** Result of component analysis */
export interface ComponentAnalysisResult {
  /** Whether the component has dynamic styling (CSS-in-JS, conditionals, etc.) */
  isDynamic: boolean;
  /** Whether the component has static text content that can be edited */
  hasStaticText: boolean;
}

/** Information about a selected component from the preview iframe */
export interface ComponentSelection {
  /** Unique ID of the element (format: filePath:line:column) */
  id: string;
  /** Component/element name */
  name: string;
  /** Runtime ID assigned to the element instance */
  runtimeId?: string;
  /** Relative file path */
  relativePath: string;
  /** Line number in the file */
  lineNumber: number;
  /** Column number in the file */
  columnNumber?: number;
}

/** Content change for transformContent function */
export interface ContentChange {
  /** Tailwind classes to add */
  classes: string[];
  /** Class prefixes to remove before adding new classes */
  prefixes: string[];
  /** Optional text content to update */
  textContent?: string;
}

/** Bounding coordinates of an element */
export interface ElementCoordinates {
  top: number;
  left: number;
  width: number;
  height: number;
}
