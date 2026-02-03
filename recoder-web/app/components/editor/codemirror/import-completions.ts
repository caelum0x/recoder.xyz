/**
 * Import Completions for CodeMirror
 * Provides autocomplete suggestions for common imports
 */

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

// ============================================
// Common Import Definitions
// ============================================

interface ImportSuggestion {
  label: string;
  detail: string;
  apply: string;
  type: string;
  boost?: number;
}

// React imports
const reactImports: ImportSuggestion[] = [
  {
    label: 'useState',
    detail: 'react',
    apply: "import { useState } from 'react';",
    type: 'function',
    boost: 10,
  },
  {
    label: 'useEffect',
    detail: 'react',
    apply: "import { useEffect } from 'react';",
    type: 'function',
    boost: 10,
  },
  {
    label: 'useRef',
    detail: 'react',
    apply: "import { useRef } from 'react';",
    type: 'function',
    boost: 9,
  },
  {
    label: 'useCallback',
    detail: 'react',
    apply: "import { useCallback } from 'react';",
    type: 'function',
    boost: 8,
  },
  {
    label: 'useMemo',
    detail: 'react',
    apply: "import { useMemo } from 'react';",
    type: 'function',
    boost: 8,
  },
  {
    label: 'useContext',
    detail: 'react',
    apply: "import { useContext } from 'react';",
    type: 'function',
    boost: 7,
  },
  {
    label: 'useReducer',
    detail: 'react',
    apply: "import { useReducer } from 'react';",
    type: 'function',
    boost: 6,
  },
  {
    label: 'createContext',
    detail: 'react',
    apply: "import { createContext } from 'react';",
    type: 'function',
    boost: 6,
  },
  {
    label: 'memo',
    detail: 'react',
    apply: "import { memo } from 'react';",
    type: 'function',
    boost: 7,
  },
  {
    label: 'forwardRef',
    detail: 'react',
    apply: "import { forwardRef } from 'react';",
    type: 'function',
    boost: 5,
  },
  {
    label: 'lazy',
    detail: 'react',
    apply: "import { lazy, Suspense } from 'react';",
    type: 'function',
    boost: 4,
  },
  {
    label: 'Fragment',
    detail: 'react',
    apply: "import { Fragment } from 'react';",
    type: 'type',
    boost: 3,
  },
  {
    label: 'React',
    detail: 'react (default)',
    apply: "import React from 'react';",
    type: 'namespace',
    boost: 5,
  },
  {
    label: 'ReactNode',
    detail: 'react (type)',
    apply: "import type { ReactNode } from 'react';",
    type: 'type',
    boost: 8,
  },
  {
    label: 'FC',
    detail: 'react (type)',
    apply: "import type { FC } from 'react';",
    type: 'type',
    boost: 7,
  },
  {
    label: 'PropsWithChildren',
    detail: 'react (type)',
    apply: "import type { PropsWithChildren } from 'react';",
    type: 'type',
    boost: 6,
  },
  {
    label: 'ChangeEvent',
    detail: 'react (type)',
    apply: "import type { ChangeEvent } from 'react';",
    type: 'type',
    boost: 5,
  },
  {
    label: 'MouseEvent',
    detail: 'react (type)',
    apply: "import type { MouseEvent } from 'react';",
    type: 'type',
    boost: 5,
  },
  {
    label: 'FormEvent',
    detail: 'react (type)',
    apply: "import type { FormEvent } from 'react';",
    type: 'type',
    boost: 5,
  },
];

// React DOM imports
const reactDomImports: ImportSuggestion[] = [
  {
    label: 'createRoot',
    detail: 'react-dom/client',
    apply: "import { createRoot } from 'react-dom/client';",
    type: 'function',
    boost: 5,
  },
  {
    label: 'createPortal',
    detail: 'react-dom',
    apply: "import { createPortal } from 'react-dom';",
    type: 'function',
    boost: 4,
  },
];

// Next.js imports (if applicable)
const nextImports: ImportSuggestion[] = [
  {
    label: 'useRouter',
    detail: 'next/navigation',
    apply: "import { useRouter } from 'next/navigation';",
    type: 'function',
    boost: 8,
  },
  {
    label: 'useSearchParams',
    detail: 'next/navigation',
    apply: "import { useSearchParams } from 'next/navigation';",
    type: 'function',
    boost: 7,
  },
  {
    label: 'usePathname',
    detail: 'next/navigation',
    apply: "import { usePathname } from 'next/navigation';",
    type: 'function',
    boost: 7,
  },
  {
    label: 'Link',
    detail: 'next/link',
    apply: "import Link from 'next/link';",
    type: 'function',
    boost: 8,
  },
  {
    label: 'Image',
    detail: 'next/image',
    apply: "import Image from 'next/image';",
    type: 'function',
    boost: 7,
  },
  {
    label: 'Head',
    detail: 'next/head',
    apply: "import Head from 'next/head';",
    type: 'function',
    boost: 6,
  },
];

// Common utility imports
const utilityImports: ImportSuggestion[] = [
  {
    label: 'clsx',
    detail: 'clsx',
    apply: "import clsx from 'clsx';",
    type: 'function',
    boost: 5,
  },
  {
    label: 'cn',
    detail: 'classnames pattern',
    apply: "import { cn } from '~/lib/utils';",
    type: 'function',
    boost: 5,
  },
  {
    label: 'classNames',
    detail: 'classnames',
    apply: "import classNames from 'classnames';",
    type: 'function',
    boost: 5,
  },
];

// Node.js built-in imports
const nodeImports: ImportSuggestion[] = [
  {
    label: 'path',
    detail: 'node:path',
    apply: "import path from 'node:path';",
    type: 'namespace',
    boost: 5,
  },
  {
    label: 'fs',
    detail: 'node:fs',
    apply: "import fs from 'node:fs';",
    type: 'namespace',
    boost: 5,
  },
  {
    label: 'fs/promises',
    detail: 'node:fs/promises',
    apply: "import fs from 'node:fs/promises';",
    type: 'namespace',
    boost: 6,
  },
  {
    label: 'crypto',
    detail: 'node:crypto',
    apply: "import crypto from 'node:crypto';",
    type: 'namespace',
    boost: 4,
  },
  {
    label: 'util',
    detail: 'node:util',
    apply: "import util from 'node:util';",
    type: 'namespace',
    boost: 3,
  },
  {
    label: 'url',
    detail: 'node:url',
    apply: "import { URL, URLSearchParams } from 'node:url';",
    type: 'class',
    boost: 4,
  },
];

// Testing imports
const testingImports: ImportSuggestion[] = [
  {
    label: 'describe',
    detail: 'vitest/jest',
    apply: "import { describe, it, expect } from 'vitest';",
    type: 'function',
    boost: 8,
  },
  {
    label: 'test',
    detail: 'vitest/jest',
    apply: "import { test, expect } from 'vitest';",
    type: 'function',
    boost: 8,
  },
  {
    label: 'render',
    detail: '@testing-library/react',
    apply: "import { render, screen } from '@testing-library/react';",
    type: 'function',
    boost: 7,
  },
  {
    label: 'userEvent',
    detail: '@testing-library/user-event',
    apply: "import userEvent from '@testing-library/user-event';",
    type: 'function',
    boost: 6,
  },
  {
    label: 'vi',
    detail: 'vitest',
    apply: "import { vi } from 'vitest';",
    type: 'function',
    boost: 5,
  },
  {
    label: 'jest',
    detail: 'jest',
    apply: "import { jest } from '@jest/globals';",
    type: 'function',
    boost: 5,
  },
];

// Zod validation imports
const zodImports: ImportSuggestion[] = [
  {
    label: 'z',
    detail: 'zod',
    apply: "import { z } from 'zod';",
    type: 'namespace',
    boost: 6,
  },
  {
    label: 'ZodError',
    detail: 'zod',
    apply: "import { z, ZodError } from 'zod';",
    type: 'class',
    boost: 4,
  },
];

// State management imports
const stateImports: ImportSuggestion[] = [
  {
    label: 'useStore',
    detail: '@nanostores/react',
    apply: "import { useStore } from '@nanostores/react';",
    type: 'function',
    boost: 6,
  },
  {
    label: 'atom',
    detail: 'nanostores',
    apply: "import { atom } from 'nanostores';",
    type: 'function',
    boost: 5,
  },
  {
    label: 'map',
    detail: 'nanostores',
    apply: "import { map } from 'nanostores';",
    type: 'function',
    boost: 5,
  },
  {
    label: 'computed',
    detail: 'nanostores',
    apply: "import { computed } from 'nanostores';",
    type: 'function',
    boost: 5,
  },
];

// Animation imports
const animationImports: ImportSuggestion[] = [
  {
    label: 'motion',
    detail: 'framer-motion',
    apply: "import { motion, AnimatePresence } from 'framer-motion';",
    type: 'function',
    boost: 6,
  },
  {
    label: 'useAnimation',
    detail: 'framer-motion',
    apply: "import { useAnimation } from 'framer-motion';",
    type: 'function',
    boost: 5,
  },
];

// All imports combined
const allImports: ImportSuggestion[] = [
  ...reactImports,
  ...reactDomImports,
  ...nextImports,
  ...utilityImports,
  ...nodeImports,
  ...testingImports,
  ...zodImports,
  ...stateImports,
  ...animationImports,
];

// ============================================
// Import Completion Source
// ============================================

/**
 * Check if the cursor is on an import line
 */
function isImportContext(context: CompletionContext): boolean {
  const line = context.state.doc.lineAt(context.pos);
  const lineText = line.text.trimStart();

  // Check if we're at the start of a line or on an import line
  return (
    lineText.startsWith('import ') ||
    lineText.startsWith('import{') ||
    lineText === '' ||
    lineText === 'import' ||
    lineText === 'imp'
  );
}

/**
 * Check if we're inside the from clause (after 'from')
 */
function isFromClause(context: CompletionContext): boolean {
  const line = context.state.doc.lineAt(context.pos);
  const beforeCursor = line.text.substring(0, context.pos - line.from);
  return beforeCursor.includes(' from ');
}

/**
 * Convert import suggestion to CodeMirror completion
 */
function toCompletion(suggestion: ImportSuggestion): Completion {
  return {
    label: suggestion.label,
    detail: suggestion.detail,
    type: suggestion.type,
    boost: suggestion.boost || 0,
    apply: (view, completion, from, to) => {
      // Find the start of the line
      const line = view.state.doc.lineAt(from);

      // Replace the entire line with the import
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: suggestion.apply },
        selection: { anchor: line.from + suggestion.apply.length },
      });
    },
  };
}

/**
 * Create an import completion source for CodeMirror
 */
export function importCompletionSource(filePath: string) {
  // Only enable for JavaScript/TypeScript files
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  const supportedExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  if (!supportedExts.includes(ext)) {
    return () => null;
  }

  return function importSource(context: CompletionContext): CompletionResult | null {
    // Only show import completions in import context
    if (!isImportContext(context)) {
      return null;
    }

    // Don't show completions in the 'from' clause (let LSP handle path completions)
    if (isFromClause(context)) {
      return null;
    }

    const word = context.matchBefore(/\w*/);
    if (!word) {
      return null;
    }

    const typed = word.text.toLowerCase();

    // Filter imports that match
    let matches = allImports;
    if (typed) {
      matches = allImports.filter(
        (imp) =>
          imp.label.toLowerCase().includes(typed) ||
          imp.detail.toLowerCase().includes(typed)
      );
    }

    if (matches.length === 0) {
      return null;
    }

    return {
      from: word.from,
      options: matches.map(toCompletion),
      validFor: /^\w*$/,
    };
  };
}

/**
 * Get common imports for a file type (for documentation or UI)
 */
export function getCommonImports(filePath: string): ImportSuggestion[] {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();

  // React/Next files
  if (ext === '.tsx' || ext === '.jsx') {
    return [...reactImports, ...nextImports, ...stateImports, ...animationImports];
  }

  // TypeScript files
  if (ext === '.ts') {
    return [...nodeImports, ...zodImports, ...utilityImports];
  }

  // Test files
  const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
  if (fileName.includes('.test.') || fileName.includes('.spec.')) {
    return [...testingImports, ...reactImports];
  }

  return allImports;
}

export default importCompletionSource;
