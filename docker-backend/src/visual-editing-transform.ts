/**
 * Visual Editing AST Transformation
 * Uses Babel parser + recast to modify className attributes in JSX/TSX files.
 * Ported from Dyad's visual_editing_utils.ts pattern.
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as recast from 'recast';
import { stylesToTailwind, extractClassPrefixes, filterExistingClasses, type ComponentStyles } from './style-utils.js';

// Handle both ESM default and CJS module.exports
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

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
 * Parse JSX/TSX content using Babel parser via recast for formatting preservation
 */
function parseSource(content: string, isTypeScript: boolean) {
  return recast.parse(content, {
    parser: {
      parse(source: string) {
        return parse(source, {
          sourceType: 'module',
          plugins: [
            'jsx',
            ...(isTypeScript ? ['typescript' as const] : []),
            'decorators-legacy',
            'classProperties',
            'optionalChaining',
            'nullishCoalescingOperator',
          ],
          tokens: true,
        });
      },
    },
  });
}

/**
 * Determine if a file is TypeScript based on extension
 */
function isTS(filePath: string): boolean {
  return filePath.endsWith('.tsx') || filePath.endsWith('.ts');
}

/**
 * Extract the string value from a className attribute's value node
 */
function getClassNameValue(attrValue: any): { value: string; isDynamic: boolean } | null {
  if (!attrValue) return null;

  // className="static classes"
  if (attrValue.type === 'StringLiteral') {
    return { value: attrValue.value, isDynamic: false };
  }

  // className={expression}
  if (attrValue.type === 'JSXExpressionContainer') {
    const expr = attrValue.expression;

    // className={"static classes"}
    if (expr.type === 'StringLiteral') {
      return { value: expr.value, isDynamic: false };
    }

    // className={`template ${literal}`} or className={condition ? a : b}
    // These are dynamic — we can't safely modify them
    return { value: '', isDynamic: true };
  }

  return null;
}

/**
 * Analyze a component at a specific line number
 */
export function analyzeComponent(content: string, lineNumber: number, filePath: string): ComponentAnalysis {
  try {
    const ast = parseSource(content, isTS(filePath));
    let result: ComponentAnalysis = {
      hasDynamicClassName: false,
      hasStaticClassName: false,
      existingClasses: [],
      lineNumber,
    };

    traverse(ast, {
      JSXOpeningElement(path: any) {
        const loc = path.node.loc;
        if (!loc) return;

        // Match by line number (allow +/- 1 for slight offset)
        if (Math.abs(loc.start.line - lineNumber) > 1) return;

        const classAttr = path.node.attributes?.find(
          (attr: any) => attr.type === 'JSXAttribute' && attr.name?.name === 'className'
        );

        if (classAttr) {
          const classValue = getClassNameValue(classAttr.value);
          if (classValue) {
            result.hasDynamicClassName = classValue.isDynamic;
            result.hasStaticClassName = !classValue.isDynamic;
            if (!classValue.isDynamic && classValue.value) {
              result.existingClasses = classValue.value.split(/\s+/).filter(Boolean);
            }
          }
        }

        path.stop();
      },
    });

    return result;
  } catch (error) {
    console.error('[VisualEditingTransform] Analysis error:', error);
    return {
      hasDynamicClassName: false,
      hasStaticClassName: false,
      existingClasses: [],
      lineNumber,
    };
  }
}

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
export function transformContent(content: string, changes: VisualEditChange[]): TransformResult {
  try {
    // Group changes by line number (usually one per element)
    const changesByLine = new Map<number, VisualEditChange>();
    for (const change of changes) {
      const existing = changesByLine.get(change.lineNumber);
      if (existing) {
        // Merge styles
        existing.styles = {
          ...existing.styles,
          ...change.styles,
          margin: { ...existing.styles.margin, ...change.styles.margin } as ComponentStyles['margin'],
          padding: { ...existing.styles.padding, ...change.styles.padding } as ComponentStyles['padding'],
          border: { ...existing.styles.border, ...change.styles.border } as ComponentStyles['border'],
          text: { ...existing.styles.text, ...change.styles.text } as ComponentStyles['text'],
        };
      } else {
        changesByLine.set(change.lineNumber, { ...change });
      }
    }

    const filePath = changes[0]?.filePath || 'file.tsx';
    const ast = parseSource(content, isTS(filePath));
    let modified = false;
    let hasDynamic = false;

    traverse(ast, {
      JSXOpeningElement(path: any) {
        const loc = path.node.loc;
        if (!loc) return;

        // Find change for this line
        const change = changesByLine.get(loc.start.line);
        if (!change) return;

        // Find or create className attribute
        let classAttr = path.node.attributes?.find(
          (attr: any) => attr.type === 'JSXAttribute' && attr.name?.name === 'className'
        );

        if (classAttr) {
          const classValue = getClassNameValue(classAttr.value);

          if (classValue?.isDynamic) {
            hasDynamic = true;
            return; // Skip dynamic classNames
          }

          // Get existing classes
          const existingClasses = (classValue?.value || '').split(/\s+/).filter(Boolean);

          // Determine which prefixes to remove
          const prefixesToRemove = extractClassPrefixes(change.styles);

          // Filter existing classes, removing ones we're replacing
          const filteredClasses = filterExistingClasses(existingClasses, prefixesToRemove);

          // Generate new Tailwind classes
          const newClasses = stylesToTailwind(change.styles);

          // Combine
          const finalClasses = [...filteredClasses, ...newClasses];
          const classString = finalClasses.join(' ');

          // Update the attribute value
          classAttr.value = {
            type: 'StringLiteral',
            value: classString,
          };

          modified = true;
        } else {
          // No className attribute - create one
          const newClasses = stylesToTailwind(change.styles);
          if (newClasses.length > 0) {
            const classString = newClasses.join(' ');
            path.node.attributes = path.node.attributes || [];
            path.node.attributes.push({
              type: 'JSXAttribute',
              name: { type: 'JSXIdentifier', name: 'className' },
              value: { type: 'StringLiteral', value: classString },
            });
            modified = true;
          }
        }
      },
    });

    if (hasDynamic && !modified) {
      return { success: false, error: 'Dynamic className detected — use "Edit in Chat" instead', isDynamic: true };
    }

    if (!modified) {
      return { success: false, error: 'Could not find the target element at the specified line' };
    }

    // Reprint with recast to preserve formatting
    const output = recast.print(ast).code;
    return { success: true, content: output };
  } catch (error: any) {
    console.error('[VisualEditingTransform] Transform error:', error);
    return { success: false, error: `Transform failed: ${error.message}` };
  }
}
