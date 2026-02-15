/**
 * Style Utilities for Visual Editing
 * Converts CSS style objects to Tailwind CSS classes.
 * Ported from Dyad's style-utils.ts pattern.
 */

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

// Standard Tailwind spacing scale (px values)
const SPACING_SCALE: Record<string, string> = {
  '0': '0',
  '1': '0.25rem',
  '2': '0.5rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '8': '2rem',
  '10': '2.5rem',
  '12': '3rem',
  '16': '4rem',
  '20': '5rem',
  '24': '6rem',
  '32': '8rem',
  '40': '10rem',
  '48': '12rem',
  '56': '14rem',
  '64': '16rem',
};

// Reverse map: rem/px to Tailwind key
const PX_TO_SPACING: Record<number, string> = {};
for (const [key, val] of Object.entries(SPACING_SCALE)) {
  if (val === '0') {
    PX_TO_SPACING[0] = key;
  } else if (val.endsWith('rem')) {
    PX_TO_SPACING[parseFloat(val) * 16] = key;
  }
}

const FONT_SIZE_MAP: Record<string, string> = {
  '12': 'text-xs',
  '14': 'text-sm',
  '16': 'text-base',
  '18': 'text-lg',
  '20': 'text-xl',
  '24': 'text-2xl',
  '30': 'text-3xl',
  '36': 'text-4xl',
  '48': 'text-5xl',
  '60': 'text-6xl',
};

const FONT_WEIGHT_MAP: Record<string, string> = {
  '100': 'font-thin',
  '200': 'font-extralight',
  '300': 'font-light',
  '400': 'font-normal',
  '500': 'font-medium',
  '600': 'font-semibold',
  '700': 'font-bold',
  '800': 'font-extrabold',
  '900': 'font-black',
};

const BORDER_WIDTH_MAP: Record<string, string> = {
  '0': 'border-0',
  '1': 'border',
  '2': 'border-2',
  '4': 'border-4',
  '8': 'border-8',
};

/**
 * Parse a CSS value to pixels (handles px, rem, em)
 */
function parseToPx(value: string): number | null {
  if (!value) return null;
  const trimmed = value.trim();

  if (trimmed === '0') return 0;
  if (trimmed.endsWith('px')) return parseFloat(trimmed);
  if (trimmed.endsWith('rem')) return parseFloat(trimmed) * 16;
  if (trimmed.endsWith('em')) return parseFloat(trimmed) * 16;

  // Plain number = px
  const num = parseFloat(trimmed);
  if (!isNaN(num)) return num;

  return null;
}

/**
 * Convert a px value to the nearest Tailwind spacing key, or use arbitrary value
 */
function pxToSpacingClass(px: number, prefix: string): string {
  // Check standard scale
  const key = PX_TO_SPACING[px];
  if (key !== undefined) {
    return `${prefix}-${key}`;
  }

  // Use arbitrary value
  return `${prefix}-[${px}px]`;
}

/**
 * Convert spacing styles (margin/padding) to Tailwind classes
 */
function spacingToTailwind(
  type: 'm' | 'p',
  spacing: { top: string; right: string; bottom: string; left: string }
): string[] {
  const classes: string[] = [];

  const top = parseToPx(spacing.top);
  const right = parseToPx(spacing.right);
  const bottom = parseToPx(spacing.bottom);
  const left = parseToPx(spacing.left);

  // Check if all sides are equal
  if (top !== null && top === right && right === bottom && bottom === left) {
    classes.push(pxToSpacingClass(top, type));
    return classes;
  }

  // Check x/y pairs
  if (left !== null && left === right) {
    classes.push(pxToSpacingClass(left, `${type}x`));
  } else {
    if (left !== null) classes.push(pxToSpacingClass(left, `${type}l`));
    if (right !== null) classes.push(pxToSpacingClass(right, `${type}r`));
  }

  if (top !== null && top === bottom) {
    classes.push(pxToSpacingClass(top, `${type}y`));
  } else {
    if (top !== null) classes.push(pxToSpacingClass(top, `${type}t`));
    if (bottom !== null) classes.push(pxToSpacingClass(bottom, `${type}b`));
  }

  return classes;
}

/**
 * Convert border styles to Tailwind classes
 */
function borderToTailwind(border: {
  width: string;
  radius: string;
  color: string;
  style: string;
}): string[] {
  const classes: string[] = [];

  // Border width
  if (border.width) {
    const px = parseToPx(border.width);
    if (px !== null) {
      const mapped = BORDER_WIDTH_MAP[String(px)];
      classes.push(mapped || `border-[${px}px]`);
    }
  }

  // Border radius
  if (border.radius) {
    const px = parseToPx(border.radius);
    if (px !== null) {
      if (px === 0) classes.push('rounded-none');
      else if (px <= 2) classes.push('rounded-sm');
      else if (px <= 4) classes.push('rounded');
      else if (px <= 6) classes.push('rounded-md');
      else if (px <= 8) classes.push('rounded-lg');
      else if (px <= 12) classes.push('rounded-xl');
      else if (px <= 16) classes.push('rounded-2xl');
      else if (px >= 9999) classes.push('rounded-full');
      else classes.push(`rounded-[${px}px]`);
    }
  }

  // Border color - use arbitrary value
  if (border.color && border.color !== '#000000') {
    classes.push(`border-[${border.color}]`);
  }

  return classes;
}

/**
 * Convert text styles to Tailwind classes
 */
function textToTailwind(text: {
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  color: string;
  lineHeight: string;
}): string[] {
  const classes: string[] = [];

  // Font size
  if (text.fontSize) {
    const px = parseToPx(text.fontSize);
    if (px !== null) {
      const mapped = FONT_SIZE_MAP[String(px)];
      classes.push(mapped || `text-[${px}px]`);
    }
  }

  // Font weight
  if (text.fontWeight) {
    const mapped = FONT_WEIGHT_MAP[text.fontWeight];
    classes.push(mapped || `font-[${text.fontWeight}]`);
  }

  // Text color
  if (text.color) {
    classes.push(`text-[${text.color}]`);
  }

  // Line height
  if (text.lineHeight) {
    const px = parseToPx(text.lineHeight);
    if (px !== null) {
      classes.push(`leading-[${px}px]`);
    }
  }

  return classes;
}

/**
 * Convert a ComponentStyles object to an array of Tailwind class strings
 */
export function stylesToTailwind(styles: ComponentStyles): string[] {
  const classes: string[] = [];

  if (styles.margin) {
    classes.push(...spacingToTailwind('m', styles.margin));
  }

  if (styles.padding) {
    classes.push(...spacingToTailwind('p', styles.padding));
  }

  if (styles.border) {
    classes.push(...borderToTailwind(styles.border));
  }

  if (styles.backgroundColor) {
    classes.push(`bg-[${styles.backgroundColor}]`);
  }

  if (styles.text) {
    classes.push(...textToTailwind(styles.text));
  }

  return classes;
}

/**
 * Tailwind class prefixes that correspond to each style property.
 * Used to determine which existing classes should be replaced.
 */
const CLASS_PREFIX_MAP: Record<string, string[]> = {
  margin: ['m-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-'],
  padding: ['p-', 'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-'],
  border: ['border', 'rounded', 'border-['],
  backgroundColor: ['bg-'],
  text: ['text-', 'font-', 'leading-'],
};

/**
 * Extract the set of class prefixes that correspond to the given style changes.
 * These prefixes identify which existing Tailwind classes should be removed
 * before adding the new ones.
 */
export function extractClassPrefixes(styles: ComponentStyles): string[] {
  const prefixes: string[] = [];

  if (styles.margin) prefixes.push(...CLASS_PREFIX_MAP.margin);
  if (styles.padding) prefixes.push(...CLASS_PREFIX_MAP.padding);
  if (styles.border) prefixes.push(...CLASS_PREFIX_MAP.border);
  if (styles.backgroundColor) prefixes.push(...CLASS_PREFIX_MAP.backgroundColor);
  if (styles.text) prefixes.push(...CLASS_PREFIX_MAP.text);

  return prefixes;
}

/**
 * Filter out existing classes that match any of the given prefixes
 */
export function filterExistingClasses(existingClasses: string[], prefixesToRemove: string[]): string[] {
  return existingClasses.filter((cls) => {
    return !prefixesToRemove.some((prefix) => cls.startsWith(prefix));
  });
}
