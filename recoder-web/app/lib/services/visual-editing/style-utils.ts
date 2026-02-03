/**
 * Style Utilities for Visual Editing
 * Functions for converting CSS styles to Tailwind classes and vice versa.
 */

import type { SpacingValues, StyleObject } from './types';

/**
 * Convert spacing values (margin/padding) to Tailwind classes
 */
function convertSpacingToTailwind(
  values: SpacingValues,
  prefix: 'm' | 'p'
): string[] {
  const classes: string[] = [];
  const { left, right, top, bottom } = values;

  const hasHorizontal = left !== undefined && right !== undefined;
  const hasVertical = top !== undefined && bottom !== undefined;

  // All sides equal
  if (
    hasHorizontal &&
    hasVertical &&
    left === right &&
    top === bottom &&
    left === top
  ) {
    classes.push(`${prefix}-[${left}]`);
  } else {
    const horizontalValue = hasHorizontal && left === right ? left : null;
    const verticalValue = hasVertical && top === bottom ? top : null;

    if (
      horizontalValue !== null &&
      verticalValue !== null &&
      horizontalValue === verticalValue
    ) {
      // px = py or mx = my, so use the shorthand for all sides
      classes.push(`${prefix}-[${horizontalValue}]`);
    } else {
      // Horizontal
      if (hasHorizontal && left === right) {
        classes.push(`${prefix}x-[${left}]`);
      } else {
        if (left !== undefined) classes.push(`${prefix}l-[${left}]`);
        if (right !== undefined) classes.push(`${prefix}r-[${right}]`);
      }

      // Vertical
      if (hasVertical && top === bottom) {
        classes.push(`${prefix}y-[${top}]`);
      } else {
        if (top !== undefined) classes.push(`${prefix}t-[${top}]`);
        if (bottom !== undefined) classes.push(`${prefix}b-[${bottom}]`);
      }
    }
  }

  return classes;
}

/**
 * Convert style object to Tailwind classes
 */
export function stylesToTailwind(styles: StyleObject): string[] {
  const classes: string[] = [];

  if (styles.margin) {
    classes.push(...convertSpacingToTailwind(styles.margin, 'm'));
  }

  if (styles.padding) {
    classes.push(...convertSpacingToTailwind(styles.padding, 'p'));
  }

  if (styles.border) {
    if (styles.border.width !== undefined)
      classes.push(`border-[${styles.border.width}]`);
    if (styles.border.radius !== undefined)
      classes.push(`rounded-[${styles.border.radius}]`);
    if (styles.border.color !== undefined)
      classes.push(`border-[${styles.border.color}]`);
  }

  if (styles.backgroundColor !== undefined) {
    classes.push(`bg-[${styles.backgroundColor}]`);
  }

  if (styles.dimensions) {
    if (styles.dimensions.width !== undefined)
      classes.push(`w-[${styles.dimensions.width}]`);
    if (styles.dimensions.height !== undefined)
      classes.push(`h-[${styles.dimensions.height}]`);
  }

  if (styles.text) {
    if (styles.text.fontSize !== undefined)
      classes.push(`text-[${styles.text.fontSize}]`);
    if (styles.text.fontWeight !== undefined)
      classes.push(`font-[${styles.text.fontWeight}]`);
    if (styles.text.color !== undefined)
      classes.push(`[color:${styles.text.color}]`);
    if (styles.text.fontFamily !== undefined) {
      // Replace spaces with underscores for Tailwind arbitrary values
      const fontFamilyValue = styles.text.fontFamily.replace(/\s/g, '_');
      classes.push(`font-[${fontFamilyValue}]`);
    }
  }

  return classes;
}

/**
 * Convert RGB color string to hex format
 */
export function rgbToHex(rgb: string | undefined): string {
  if (!rgb || rgb.startsWith('#')) return rgb || '#000000';
  const rgbMatch = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return rgb || '#000000';
}

/**
 * Process value by adding px suffix if it's a plain number
 */
export function processNumericValue(value: string): string {
  return /^\d+$/.test(value) ? `${value}px` : value;
}

/**
 * Extract prefixes from Tailwind classes for smart replacement
 */
export function extractClassPrefixes(classes: string[]): string[] {
  return Array.from(
    new Set(
      classes.map((cls) => {
        // Handle arbitrary properties like [color:...]
        const arbitraryMatch = cls.match(/^\[([a-z-]+):/);
        if (arbitraryMatch) {
          return `[${arbitraryMatch[1]}:`;
        }

        // Special handling for font-[...] classes
        // We need to distinguish between font-weight and font-family
        if (cls.startsWith('font-[')) {
          const value = cls.match(/^font-\[([^\]]+)\]/);
          if (value) {
            // If it's numeric (like 400, 700), it's font-weight
            // If it contains letters/underscores, it's font-family
            const isNumeric = /^\d+$/.test(value[1]);
            return isNumeric ? 'font-weight-' : 'font-family-';
          }
        }

        // Special handling for text-size classes (text-xs, text-sm, text-3xl, etc.)
        // to avoid removing text-center, text-left, text-color classes
        if (cls.startsWith('text-')) {
          // Check if it's a font-size class (ends with size suffix like xs, sm, lg, xl, 2xl, etc.)
          const sizeMatch = cls.match(
            /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/
          );
          if (sizeMatch) {
            return 'text-size-'; // Use a specific prefix for font-size
          }
          // For arbitrary text sizes like text-[44px]
          if (cls.match(/^text-\[[\d.]+[a-z]+\]$/)) {
            return 'text-size-';
          }
        }

        // Handle regular Tailwind classes
        const match = cls.match(/^([a-z]+[-])/);
        return match ? match[1] : cls.split('-')[0] + '-';
      })
    )
  );
}

/**
 * Parse computed styles from a DOM element's CSSStyleDeclaration
 */
export function parseComputedStyles(computedStyle: CSSStyleDeclaration): StyleObject {
  return {
    margin: {
      top: computedStyle.marginTop,
      right: computedStyle.marginRight,
      bottom: computedStyle.marginBottom,
      left: computedStyle.marginLeft,
    },
    padding: {
      top: computedStyle.paddingTop,
      right: computedStyle.paddingRight,
      bottom: computedStyle.paddingBottom,
      left: computedStyle.paddingLeft,
    },
    border: {
      width: computedStyle.borderWidth,
      radius: computedStyle.borderRadius,
      color: computedStyle.borderColor,
    },
    backgroundColor: computedStyle.backgroundColor,
    text: {
      fontSize: computedStyle.fontSize,
      fontWeight: computedStyle.fontWeight,
      fontFamily: computedStyle.fontFamily,
      color: computedStyle.color,
    },
  };
}

/**
 * Apply styles directly to a DOM element
 */
export function applyStylesToElement(
  element: HTMLElement,
  styles: StyleObject
): void {
  const applySpacing = (
    type: 'margin' | 'padding',
    values: SpacingValues | undefined
  ) => {
    if (!values) return;
    Object.entries(values).forEach(([side, value]) => {
      if (value !== undefined) {
        const cssProperty = `${type}${side.charAt(0).toUpperCase() + side.slice(1)}` as keyof CSSStyleDeclaration;
        (element.style as any)[cssProperty] = value;
      }
    });
  };

  applySpacing('margin', styles.margin);
  applySpacing('padding', styles.padding);

  if (styles.border) {
    if (styles.border.width !== undefined) {
      element.style.borderWidth = styles.border.width;
      element.style.borderStyle = 'solid';
    }
    if (styles.border.radius !== undefined) {
      element.style.borderRadius = styles.border.radius;
    }
    if (styles.border.color !== undefined) {
      element.style.borderColor = styles.border.color;
    }
  }

  if (styles.backgroundColor !== undefined) {
    element.style.backgroundColor = styles.backgroundColor;
  }

  if (styles.dimensions) {
    if (styles.dimensions.width !== undefined) {
      element.style.width = styles.dimensions.width;
    }
    if (styles.dimensions.height !== undefined) {
      element.style.height = styles.dimensions.height;
    }
  }

  if (styles.text) {
    if (styles.text.fontSize !== undefined) {
      element.style.fontSize = styles.text.fontSize;
    }
    if (styles.text.fontWeight !== undefined) {
      element.style.fontWeight = styles.text.fontWeight;
    }
    if (styles.text.fontFamily !== undefined) {
      element.style.fontFamily = styles.text.fontFamily;
    }
    if (styles.text.color !== undefined) {
      element.style.color = styles.text.color;
    }
  }
}
