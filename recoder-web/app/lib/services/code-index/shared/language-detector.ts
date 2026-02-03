/**
 * Language Detection
 * Detects programming language from file extension or content
 */

import { SUPPORTED_EXTENSIONS } from '../constants';

export type ProgrammingLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'ruby'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'php'
  | 'swift'
  | 'scala'
  | 'vue'
  | 'svelte'
  | 'astro'
  | 'html'
  | 'css'
  | 'scss'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'sql'
  | 'graphql'
  | 'shell'
  | 'dockerfile'
  | 'prisma'
  | 'proto'
  | 'unknown';

const EXTENSION_TO_LANGUAGE: Record<string, ProgrammingLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.scala': 'scala',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'css',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'yaml',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.markdown': 'markdown',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.dockerfile': 'dockerfile',
  '.containerfile': 'dockerfile',
  '.prisma': 'prisma',
  '.proto': 'proto'
};

/**
 * Detects language from file extension
 * @param filePath File path or name
 * @returns Detected language
 */
export function detectLanguageFromExtension(filePath: string): ProgrammingLanguage {
  const ext = getFileExtension(filePath);
  return EXTENSION_TO_LANGUAGE[ext] || 'unknown';
}

/**
 * Gets file extension from path
 * @param filePath File path
 * @returns Extension with dot (e.g., '.ts')
 */
export function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    // Handle special files like Dockerfile
    const fileName = filePath.split('/').pop() || filePath;
    if (fileName.toLowerCase() === 'dockerfile') return '.dockerfile';
    return '';
  }
  return filePath.slice(lastDot).toLowerCase();
}

/**
 * Checks if a file extension is supported for indexing
 * @param filePath File path
 * @returns True if supported
 */
export function isSupportedExtension(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Gets language display name
 * @param language Language code
 * @returns Human-readable name
 */
export function getLanguageDisplayName(language: ProgrammingLanguage): string {
  const names: Record<ProgrammingLanguage, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    python: 'Python',
    ruby: 'Ruby',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    kotlin: 'Kotlin',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    php: 'PHP',
    swift: 'Swift',
    scala: 'Scala',
    vue: 'Vue',
    svelte: 'Svelte',
    astro: 'Astro',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    json: 'JSON',
    yaml: 'YAML',
    markdown: 'Markdown',
    sql: 'SQL',
    graphql: 'GraphQL',
    shell: 'Shell',
    dockerfile: 'Dockerfile',
    prisma: 'Prisma',
    proto: 'Protocol Buffers',
    unknown: 'Unknown'
  };
  return names[language] || 'Unknown';
}

/**
 * Gets common file patterns for a language
 * @param language Language code
 * @returns Array of glob patterns
 */
export function getLanguagePatterns(language: ProgrammingLanguage): string[] {
  const patterns: Record<ProgrammingLanguage, string[]> = {
    typescript: ['**/*.ts', '**/*.tsx'],
    javascript: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    python: ['**/*.py'],
    ruby: ['**/*.rb'],
    go: ['**/*.go'],
    rust: ['**/*.rs'],
    java: ['**/*.java'],
    kotlin: ['**/*.kt', '**/*.kts'],
    c: ['**/*.c', '**/*.h'],
    cpp: ['**/*.cpp', '**/*.cc', '**/*.cxx', '**/*.hpp'],
    csharp: ['**/*.cs'],
    php: ['**/*.php'],
    swift: ['**/*.swift'],
    scala: ['**/*.scala'],
    vue: ['**/*.vue'],
    svelte: ['**/*.svelte'],
    astro: ['**/*.astro'],
    html: ['**/*.html', '**/*.htm'],
    css: ['**/*.css', '**/*.less'],
    scss: ['**/*.scss', '**/*.sass'],
    json: ['**/*.json'],
    yaml: ['**/*.yaml', '**/*.yml', '**/*.toml'],
    markdown: ['**/*.md', '**/*.mdx', '**/*.markdown'],
    sql: ['**/*.sql'],
    graphql: ['**/*.graphql', '**/*.gql'],
    shell: ['**/*.sh', '**/*.bash', '**/*.zsh'],
    dockerfile: ['**/Dockerfile', '**/Dockerfile.*', '**/*.dockerfile'],
    prisma: ['**/*.prisma'],
    proto: ['**/*.proto'],
    unknown: []
  };
  return patterns[language] || [];
}
