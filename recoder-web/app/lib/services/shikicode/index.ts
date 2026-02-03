/**
 * ShikiCode - A lightweight code editor with Shiki syntax highlighting
 *
 * This module provides a simple code editor that uses Shiki for syntax highlighting.
 * It supports themes, languages, line numbers, and various editor plugins.
 *
 * @example
 * ```tsx
 * import { shikiCode, createHighlighter, hookTab, hookClosingPairs, defaultComments } from '~/lib/services/shikicode';
 *
 * // Create highlighter
 * const highlighter = await createHighlighter();
 *
 * // Create editor with plugins
 * const editor = shikiCode()
 *   .withPlugins(hookTab, hookClosingPairs(), defaultComments())
 *   .create(containerElement, highlighter, {
 *     language: 'typescript',
 *     theme: 'github-dark',
 *     value: '// Your code here',
 *   });
 *
 * // Update value
 * editor.value = 'const hello = "world";';
 *
 * // Change theme/language
 * editor.updateOptions({ theme: 'github-light', language: 'javascript' });
 *
 * // Cleanup
 * editor.dispose();
 * ```
 */

// Core editor functionality
export * from './core';

// Highlighter setup with common themes and languages
export * from './highlighter';

// Editor plugins
export * from './plugins';

// React hooks for integration
export * from './useShikiCode';

// Re-export Shiki types for convenience
export type { BundledLanguage, BundledTheme, Highlighter, ThemeRegistration } from 'shiki';
