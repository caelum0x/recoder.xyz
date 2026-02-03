/**
 * ShikiCode Highlighter Setup
 *
 * Pre-configured highlighter with common themes and languages for quick setup.
 */

import type { BundledLanguage, BundledTheme, Highlighter } from 'shiki';

// Common languages for web development (validated against Shiki bundled languages)
export const commonLanguages: BundledLanguage[] = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'html',
  'css',
  'scss',
  'json',
  'jsonc',
  'markdown',
  'yaml',
  'toml',
  'shellscript',
  'bash',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'sql',
  'graphql',
  'vue',
  'svelte',
  'astro',
  'php',
  'ruby',
  'dockerfile',
  'xml',
  'ini',
  'diff',
];

// Popular dark themes
export const darkThemes: BundledTheme[] = [
  'github-dark',
  'github-dark-dimmed',
  'one-dark-pro',
  'vitesse-dark',
  'dracula',
  'nord',
  'material-theme-darker',
  'catppuccin-mocha',
  'tokyo-night',
  'slack-dark',
  'ayu-dark',
];

// Popular light themes
export const lightThemes: BundledTheme[] = [
  'github-light',
  'vitesse-light',
  'one-light',
  'catppuccin-latte',
  'material-theme-lighter',
  'slack-ochin',
  'snazzy-light',
  'min-light',
];

// All common themes
export const commonThemes: BundledTheme[] = [...darkThemes, ...lightThemes];

// Default theme for the editor
export const defaultTheme: BundledTheme = 'github-dark';

// Minimal language set for fast loading
export const minimalLanguages: BundledLanguage[] = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'html',
  'css',
  'json',
  'markdown',
];

/**
 * Create a highlighter with common web development languages and themes.
 *
 * @example
 * ```ts
 * import { createHighlighter } from './highlighter';
 *
 * const highlighter = await createHighlighter();
 * const editor = shikiCode()
 *   .withPlugins(hookTab, hookClosingPairs(), defaultComments())
 *   .create(container, highlighter, {
 *     language: 'typescript',
 *     theme: 'github-dark',
 *   });
 * ```
 */
export async function createHighlighter(options?: {
  languages?: BundledLanguage[];
  themes?: BundledTheme[];
}): Promise<Highlighter> {
  // Dynamic import to enable tree-shaking
  const { createHighlighter: create } = await import('shiki');

  return create({
    langs: options?.languages ?? commonLanguages,
    themes: options?.themes ?? [defaultTheme, 'github-light'],
  });
}

/**
 * Create a minimal highlighter with just essential languages for fast loading.
 * Additional languages can be loaded on-demand using the autoload plugin.
 */
export async function createMinimalHighlighter(): Promise<Highlighter> {
  const { createHighlighter: create } = await import('shiki');

  return create({
    langs: minimalLanguages,
    themes: [defaultTheme, 'github-light'],
  });
}

/**
 * Map file extensions to language identifiers.
 * Uses string type for extensibility with custom languages.
 */
export const extensionToLanguage: Record<string, string> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.d.ts': 'typescript',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'less',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',

  // Data
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.json5': 'json5',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.ini': 'ini',
  '.env': 'shellscript',

  // Documentation
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.txt': 'text',

  // Backend
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',
  '.rb': 'ruby',
  '.php': 'php',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.swift': 'swift',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.cs': 'csharp',
  '.fs': 'fsharp',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hrl': 'erlang',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.lua': 'lua',
  '.r': 'r',
  '.R': 'r',
  '.dart': 'dart',
  '.zig': 'zig',
  '.nim': 'nim',
  '.v': 'v',
  '.cr': 'crystal',

  // Shell
  '.sh': 'shellscript',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.fish': 'fish',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.bat': 'bat',
  '.cmd': 'bat',

  // Config
  '.dockerfile': 'dockerfile',
  '.dockerignore': 'dockerfile',
  '.prettierrc': 'json',
  '.eslintrc': 'json',

  // Database
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.prisma': 'prisma',

  // Other
  '.diff': 'diff',
  '.patch': 'diff',
  '.tex': 'latex',
  '.latex': 'latex',
  '.hs': 'haskell',
  '.lhs': 'haskell',
  '.ml': 'ocaml',
  '.mli': 'ocaml',
  '.lisp': 'lisp',
  '.scm': 'scheme',
  '.rkt': 'scheme',
  '.pl': 'perl',
  '.pm': 'perl',
  '.asm': 'asm',
  '.s': 'asm',
  '.wasm': 'wasm',
  '.wat': 'wasm',
};

/**
 * Special filenames mapped to language identifiers
 */
export const specialFilenames: Record<string, string> = {
  'Dockerfile': 'dockerfile',
  'Makefile': 'makefile',
  'CMakeLists.txt': 'cmake',
  '.gitignore': 'shellscript',
  '.gitattributes': 'shellscript',
  '.editorconfig': 'ini',
  'package.json': 'json',
  'tsconfig.json': 'jsonc',
  'jsconfig.json': 'jsonc',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  'docker-compose.yml': 'yaml',
  'docker-compose.yaml': 'yaml',
  '.env': 'shellscript',
  '.env.local': 'shellscript',
  '.env.development': 'shellscript',
  '.env.production': 'shellscript',
};

/**
 * Get the language identifier for a file based on its path or extension.
 */
export function getLanguageFromPath(path: string): string {
  const filename = path.split('/').pop() ?? '';

  // Check for special filenames first
  if (specialFilenames[filename]) {
    return specialFilenames[filename];
  }

  // Handle compound extensions like .d.ts
  if (filename.endsWith('.d.ts')) {
    return 'typescript';
  }

  // Get extension
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return 'text';
  }

  const ext = filename.slice(lastDotIndex).toLowerCase();
  return extensionToLanguage[ext] ?? 'text';
}

/**
 * Check if a language is likely supported by Shiki
 */
export function isSupportedLanguage(lang: string): lang is BundledLanguage {
  const supportedLangs = new Set([
    'abap', 'actionscript-3', 'ada', 'angular-html', 'angular-ts', 'apache', 'apex', 'apl',
    'applescript', 'ara', 'asm', 'astro', 'awk', 'ballerina', 'bash', 'bat', 'beancount',
    'berry', 'bibtex', 'bicep', 'blade', 'c', 'cadence', 'clarity', 'clojure', 'cmake',
    'cobol', 'codeql', 'coffee', 'cpp', 'crystal', 'csharp', 'css', 'cue', 'cypher', 'd',
    'dart', 'dax', 'diff', 'docker', 'dockerfile', 'dream-maker', 'elixir', 'elm', 'erb',
    'erlang', 'fish', 'fsharp', 'gdresource', 'gdscript', 'gdshader', 'gherkin', 'git-commit',
    'git-rebase', 'glimmer-js', 'glimmer-ts', 'glsl', 'gnuplot', 'go', 'graphql', 'groovy',
    'hack', 'haml', 'handlebars', 'haskell', 'hcl', 'hjson', 'hlsl', 'html', 'http', 'imba',
    'ini', 'java', 'javascript', 'jinja', 'jison', 'json', 'json5', 'jsonc', 'jsonl',
    'jsonnet', 'jssm', 'jsx', 'julia', 'kotlin', 'kusto', 'latex', 'less', 'liquid', 'lisp',
    'logo', 'lua', 'make', 'makefile', 'markdown', 'marko', 'matlab', 'mdc', 'mdx', 'mermaid',
    'mojo', 'move', 'narrat', 'nextflow', 'nginx', 'nim', 'nix', 'nushell', 'objective-c',
    'objective-cpp', 'ocaml', 'pascal', 'perl', 'php', 'plsql', 'postcss', 'powerquery',
    'powershell', 'prisma', 'prolog', 'proto', 'pug', 'puppet', 'purescript', 'python', 'r',
    'raku', 'razor', 'reg', 'rel', 'riscv', 'rst', 'ruby', 'rust', 'sas', 'sass', 'scala',
    'scheme', 'scss', 'shaderlab', 'shellscript', 'shellsession', 'smalltalk', 'solidity',
    'sparql', 'splunk', 'sql', 'ssh-config', 'stata', 'stylus', 'svelte', 'swift', 'system-verilog',
    'tasl', 'tcl', 'terraform', 'tex', 'toml', 'tsx', 'turtle', 'twig', 'typescript', 'typst',
    'v', 'vala', 'vb', 'verilog', 'vhdl', 'viml', 'vue', 'vue-html', 'vyper', 'wasm', 'wenyan',
    'wgsl', 'wolfram', 'xml', 'xsl', 'yaml', 'zenscript', 'zig', 'zsh',
  ]);

  return supportedLangs.has(lang);
}
