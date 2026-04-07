/**
 * Visual Editing AST Transformation
 * Uses Babel parser + recast to modify className attributes in JSX/TSX files.
 * Ported from Dyad's visual_editing_utils.ts pattern.
 */
import { type ComponentStyles } from './style-utils.js';
export interface VisualEditChange {
    filePath: string;
    lineNumber: number;
    styles: ComponentStyles;
    textContent?: string;
}
export interface TransformResult {
    success: boolean;
    content?: string;
    error?: string;
    isDynamic?: boolean;
}
export interface ComponentAnalysis {
    hasDynamicClassName: boolean;
    hasStaticClassName: boolean;
    existingClasses: string[];
    lineNumber: number;
}
/**
 * Analyze a component at a specific line number
 */
export declare function analyzeComponent(content: string, lineNumber: number, filePath: string): ComponentAnalysis;
/**
 * Transform file content by modifying the className of a JSX element at a specific line.
 *
 * Strategy:
 * 1. Parse the file preserving formatting (recast)
 * 2. Find the JSXOpeningElement at the target line
 * 3. Get existing className
 * 4. Remove classes with matching prefixes
 * 5. Add new Tailwind classes
 * 6. Reprint with recast (minimal formatting changes)
 */
export declare function transformContent(content: string, changes: VisualEditChange[]): TransformResult;
