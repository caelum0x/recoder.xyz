/**
 * Component Analyzer
 * Analyzes JSX/TSX source code to determine component characteristics.
 * Uses regex-based parsing to avoid heavy dependencies like Babel in the browser.
 */

import type { ComponentAnalysisResult, ContentChange } from './types';
import { stylesToTailwind, extractClassPrefixes } from './style-utils';
import type { StyleObject } from './types';

/**
 * Analyzes a JSX/TSX component at a specific line to determine:
 * - Whether it has dynamic styling (className/style with expressions)
 * - Whether it contains static text content
 *
 * This is a lightweight regex-based analysis that works in the browser
 * without requiring Babel or other heavy AST parsers.
 */
export function analyzeComponent(
  content: string,
  lineNumber: number
): ComponentAnalysisResult {
  const lines = content.split('\n');

  if (lineNumber < 1 || lineNumber > lines.length) {
    return { isDynamic: false, hasStaticText: false };
  }

  // Get the line and surrounding context
  const targetLine = lines[lineNumber - 1];

  // Find the JSX element on this line
  const jsxOpeningMatch = targetLine.match(/<(\w+)([^>]*)>/);

  if (!jsxOpeningMatch) {
    return { isDynamic: false, hasStaticText: false };
  }

  const attributes = jsxOpeningMatch[2];

  // Check for dynamic className
  let isDynamic = false;

  // Check for className={...} with expressions
  if (/className=\{(?!["'`])/.test(attributes)) {
    // className with expression container (not just a string)
    const classNameExprMatch = attributes.match(/className=\{([^}]+)\}/);
    if (classNameExprMatch) {
      const expr = classNameExprMatch[1];
      // Check for conditionals, function calls, variables
      if (
        /\?/.test(expr) || // Conditional
        /\(/.test(expr) || // Function call
        /&&|\|\|/.test(expr) || // Logical expression
        /`/.test(expr) || // Template literal
        /^[a-zA-Z_$][\w$]*$/.test(expr.trim()) // Variable reference
      ) {
        isDynamic = true;
      }
    }
  }

  // Check for style={{...}} (inline styles are considered dynamic)
  if (/style=\{\{/.test(attributes)) {
    isDynamic = true;
  }

  // Check for styles.* or classNames() or cn() or clsx()
  if (/(?:styles\.|classNames\(|clsx\(|cn\(|cva\()/.test(attributes)) {
    isDynamic = true;
  }

  // Check for static text content
  let hasStaticText = false;

  // Find closing tag or self-closing
  if (!targetLine.includes('/>')) {
    // Look for content between opening and closing tag
    // Get the element name
    const elementName = jsxOpeningMatch[1];

    // Simple check: look at the rest of the line and next few lines for text content
    const afterOpening = targetLine.substring(targetLine.indexOf('>') + 1);

    // Check if there's text content (not just whitespace or other JSX)
    if (afterOpening.trim() && !afterOpening.trim().startsWith('<') && !afterOpening.trim().startsWith('{')) {
      hasStaticText = true;
    } else {
      // Look at subsequent lines for text content
      for (let i = lineNumber; i < Math.min(lineNumber + 5, lines.length); i++) {
        const nextLine = lines[i].trim();

        // Stop if we find closing tag
        if (nextLine.includes(`</${elementName}`)) {
          break;
        }

        // Stop if we find another JSX element (nested)
        if (nextLine.match(/<\w+/) && !nextLine.startsWith('<')) {
          hasStaticText = false;
          break;
        }

        // Check for static text (not JSX, not expression container with variable)
        if (
          nextLine &&
          !nextLine.startsWith('<') &&
          !nextLine.startsWith('{') &&
          !nextLine.startsWith('}')
        ) {
          // Could be text content
          hasStaticText = true;
        }

        // Check for string expression like {"text"}
        if (/\{"[^"]+"\}/.test(nextLine) || /\{'[^']+'\}/.test(nextLine)) {
          hasStaticText = true;
        }
      }
    }
  }

  return { isDynamic, hasStaticText };
}

/**
 * Find the JSX element context around a specific line number.
 * Returns the opening tag line and closing tag line (if not self-closing).
 */
export function findElementContext(
  content: string,
  lineNumber: number
): { openingLine: number; closingLine: number; isSelfClosing: boolean } | null {
  const lines = content.split('\n');

  if (lineNumber < 1 || lineNumber > lines.length) {
    return null;
  }

  const targetLine = lines[lineNumber - 1];

  // Check for JSX opening tag
  const openingMatch = targetLine.match(/<(\w+)/);
  if (!openingMatch) {
    return null;
  }

  const elementName = openingMatch[1];

  // Check for self-closing tag
  if (targetLine.includes('/>')) {
    return {
      openingLine: lineNumber,
      closingLine: lineNumber,
      isSelfClosing: true,
    };
  }

  // Find closing tag
  let depth = 1;
  for (let i = lineNumber; i < lines.length; i++) {
    const line = lines[i];

    // Skip the opening line for depth counting
    if (i === lineNumber - 1) {
      continue;
    }

    // Count opening tags of same element
    const openMatches = line.match(new RegExp(`<${elementName}(?:[^>]*)>`, 'g'));
    if (openMatches) {
      depth += openMatches.length;
    }

    // Count closing tags
    const closeMatches = line.match(new RegExp(`</${elementName}>`, 'g'));
    if (closeMatches) {
      depth -= closeMatches.length;
    }

    if (depth === 0) {
      return {
        openingLine: lineNumber,
        closingLine: i + 1,
        isSelfClosing: false,
      };
    }
  }

  // No closing tag found, assume it's on the same line or structure is invalid
  return {
    openingLine: lineNumber,
    closingLine: lineNumber,
    isSelfClosing: true,
  };
}

/**
 * Extract current className value from a JSX element on a specific line
 */
export function extractClassName(content: string, lineNumber: number): string | null {
  const lines = content.split('\n');

  if (lineNumber < 1 || lineNumber > lines.length) {
    return null;
  }

  const targetLine = lines[lineNumber - 1];

  // Match className="..." or className='...'
  const staticMatch = targetLine.match(/className=["']([^"']+)["']/);
  if (staticMatch) {
    return staticMatch[1];
  }

  // Match className={...} - harder to extract value from expressions
  // Return null for dynamic classNames
  const dynamicMatch = targetLine.match(/className=\{/);
  if (dynamicMatch) {
    return null;
  }

  return '';
}

/**
 * Generate a className update string that merges new classes with existing ones.
 * Removes classes with conflicting prefixes before adding new ones.
 */
export function generateUpdatedClassName(
  existingClasses: string,
  newClasses: string[],
  prefixesToRemove: string[]
): string {
  const existingList = existingClasses.split(/\s+/).filter(Boolean);

  // Helper to check if a class should be removed
  const shouldRemoveClass = (cls: string): boolean => {
    return prefixesToRemove.some((prefix) => {
      // Handle font-weight vs font-family distinction
      if (prefix === 'font-weight-') {
        const match = cls.match(/^font-\[(\d+)\]$/);
        return match !== null;
      } else if (prefix === 'font-family-') {
        const match = cls.match(/^font-\[([^\]]+)\]$/);
        if (match) {
          return !/^\d+$/.test(match[1]);
        }
        return false;
      } else if (prefix === 'text-size-') {
        // Remove only text-size classes
        const sizeMatch = cls.match(
          /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/
        );
        if (sizeMatch) return true;
        if (cls.match(/^text-\[[\d.]+[a-z]+\]$/)) return true;
        return false;
      } else if (prefix === 'my-' || prefix === 'py-') {
        const type = prefix[0];
        return (
          cls.startsWith(`${type}t-`) ||
          cls.startsWith(`${type}b-`) ||
          cls.startsWith(`${type}y-`) ||
          new RegExp(`^${type}-\\[`).test(cls)
        );
      } else if (prefix === 'mx-' || prefix === 'px-') {
        const type = prefix[0];
        return (
          cls.startsWith(`${type}l-`) ||
          cls.startsWith(`${type}r-`) ||
          cls.startsWith(`${type}x-`) ||
          new RegExp(`^${type}-\\[`).test(cls)
        );
      } else {
        return cls.startsWith(prefix);
      }
    });
  };

  const filteredClasses = existingList.filter((cls) => !shouldRemoveClass(cls));

  // Handle spacing class splitting (m-[value] to mx-[value] + my-[value])
  const addedClasses: string[] = [];

  ['m', 'p'].forEach((type) => {
    const hasDirectionalX = prefixesToRemove.some((p) => p === `${type}x-`);
    const hasDirectionalY = prefixesToRemove.some((p) => p === `${type}y-`);

    if (!hasDirectionalX && !hasDirectionalY) {
      return;
    }

    const allSidesClass = existingList.find((cls) =>
      new RegExp(`^${type}-\\[([^\\]]+)\\]$`).test(cls)
    );

    if (allSidesClass) {
      const valueMatch = allSidesClass.match(/\[([^\]]+)\]/);
      if (valueMatch) {
        const omnidirectionalValue = valueMatch[1];

        if (hasDirectionalX && !hasDirectionalY) {
          addedClasses.push(`${type}y-[${omnidirectionalValue}]`);
        } else if (hasDirectionalY && !hasDirectionalX) {
          addedClasses.push(`${type}x-[${omnidirectionalValue}]`);
        }
      }
    }
  });

  return [...filteredClasses, ...addedClasses, ...newClasses].join(' ');
}

/**
 * Transform JSX/TSX content by applying style and text changes.
 * This is a lightweight implementation that works with regex patterns.
 *
 * For more complex transformations (nested elements, expression containers),
 * this should be upgraded to use a proper AST parser like Babel.
 */
export function transformContent(
  content: string,
  changes: Map<number, ContentChange>
): string {
  const lines = content.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];
    const change = changes.get(lineNumber);

    if (!change) {
      result.push(line);
      continue;
    }

    let modifiedLine = line;

    // Handle className updates
    if (change.classes.length > 0) {
      // Check for existing className
      const staticClassMatch = modifiedLine.match(/className=["']([^"']*)["']/);

      if (staticClassMatch) {
        // Update existing static className
        const existingClasses = staticClassMatch[1];
        const newClassName = generateUpdatedClassName(
          existingClasses,
          change.classes,
          change.prefixes
        );
        modifiedLine = modifiedLine.replace(
          /className=["'][^"']*["']/,
          `className="${newClassName}"`
        );
      } else if (!modifiedLine.includes('className={')) {
        // Add new className attribute
        const newClassName = change.classes.join(' ');
        // Insert before the closing > of the opening tag
        modifiedLine = modifiedLine.replace(
          /<(\w+)(\s[^>]*)?(\/?)>/,
          `<$1$2 className="${newClassName}"$3>`
        );
      }
    }

    // Handle text content updates (simplified - only handles inline text)
    if (change.textContent !== undefined) {
      // Check if this is a simple element with text content on the same line
      const textMatch = modifiedLine.match(/(<\w+[^>]*>)([^<]+)(<\/\w+>)/);
      if (textMatch) {
        modifiedLine = `${textMatch[1]}${change.textContent}${textMatch[3]}`;
      }
    }

    result.push(modifiedLine);
  }

  return result.join('\n');
}

/**
 * Convert style changes to content changes suitable for transformContent
 */
export function styleChangesToContentChanges(
  styles: StyleObject,
  existingClasses?: string
): ContentChange {
  const tailwindClasses = stylesToTailwind(styles);
  const prefixes = extractClassPrefixes(tailwindClasses);

  return {
    classes: tailwindClasses,
    prefixes,
  };
}
