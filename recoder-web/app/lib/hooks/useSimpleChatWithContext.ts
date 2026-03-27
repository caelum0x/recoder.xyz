/**
 * Enhanced chat hook with .recoder/ context support
 *
 * IMPROVEMENTS:
 * 1. Include more file context in prompts
 * 2. Smart file selection based on relevance
 * 3. Include project structure
 * 4. Better context management
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import { integrateRecoderContext } from '~/lib/recoder-context/webcontainer-integration';
import { getActionsInProgress } from '~/lib/runtime/action-runner';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SimpleChatContext');

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool';
  content: string;
  createdAt?: Date;
  truncated?: boolean;
  truncationReason?: string;
}

interface ProjectFile {
  path: string;
  content: string;
  relevanceScore: number;
}

interface ProjectContext {
  structure: string;
  relevantFiles: ProjectFile[];
  packageJson?: object;
  dependencies: string[];
}

interface UseChatOptions {
  api: string;
  onError?: (error: Error) => void;
  onFinish?: (message: Message) => void;
  onResponse?: (response: Response) => void;
  initialMessages?: Message[];
  // Context options
  maxContextFiles?: number;
  maxFileSize?: number;
  includeProjectStructure?: boolean;
}

// File patterns for different types of relevance
const FILE_PATTERNS = {
  config: [
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'vite.config.js',
    'tailwind.config.js',
    'tailwind.config.ts',
    '.env',
    '.env.local',
  ],
  entryPoints: [
    'src/main.tsx',
    'src/main.ts',
    'src/index.tsx',
    'src/index.ts',
    'src/App.tsx',
    'src/App.jsx',
    'index.html',
  ],
  routing: [
    'src/routes',
    'src/pages',
    'app/routes',
  ],
  components: [
    'src/components',
    'src/lib',
    'src/utils',
  ],
};

// Keywords that indicate relevance to user's query
const RELEVANCE_KEYWORDS: Record<string, string[]> = {
  auth: ['auth', 'login', 'logout', 'session', 'user', 'password', 'token', 'jwt'],
  api: ['api', 'fetch', 'axios', 'endpoint', 'request', 'response', 'http'],
  state: ['state', 'store', 'redux', 'zustand', 'context', 'provider'],
  styling: ['style', 'css', 'tailwind', 'theme', 'color', 'dark', 'light'],
  form: ['form', 'input', 'submit', 'validation', 'field', 'error'],
  database: ['database', 'db', 'sql', 'query', 'model', 'schema', 'prisma'],
  routing: ['route', 'page', 'navigation', 'link', 'redirect', 'path'],
  component: ['component', 'button', 'modal', 'card', 'layout', 'header', 'footer'],
};

// Calculate relevance score for a file based on user query
function calculateRelevance(filePath: string, fileContent: string, userQuery: string): number {
  let score = 0;
  const lowerQuery = userQuery.toLowerCase();
  const lowerPath = filePath.toLowerCase();
  const lowerContent = fileContent.toLowerCase();

  // Base score for file type
  if (FILE_PATTERNS.config.some(p => filePath.includes(p))) {
    score += 10; // Config files are always relevant
  }
  if (FILE_PATTERNS.entryPoints.some(p => filePath.includes(p))) {
    score += 8; // Entry points are highly relevant
  }

  // Score based on file extension matching query context
  if (lowerQuery.includes('react') || lowerQuery.includes('component')) {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      score += 5;
    }
  }
  if (lowerQuery.includes('style') || lowerQuery.includes('css')) {
    if (filePath.endsWith('.css') || filePath.endsWith('.scss')) {
      score += 5;
    }
  }

  // Score based on keywords in query matching file content
  for (const [category, keywords] of Object.entries(RELEVANCE_KEYWORDS)) {
    const queryHasCategory = keywords.some(k => lowerQuery.includes(k));
    if (queryHasCategory) {
      // Check if file content relates to this category
      const contentMatches = keywords.filter(k => lowerContent.includes(k)).length;
      score += contentMatches * 3;

      // Check if file path relates to this category
      const pathMatches = keywords.filter(k => lowerPath.includes(k)).length;
      score += pathMatches * 5;
    }
  }

  // Direct mentions of the file in the query
  const fileName = filePath.split('/').pop() || '';
  if (lowerQuery.includes(fileName.toLowerCase().replace(/\.[^.]+$/, ''))) {
    score += 20;
  }

  // Penalize very long files (likely auto-generated)
  if (fileContent.length > 10000) {
    score -= 2;
  }

  // Penalize node_modules and build artifacts
  if (filePath.includes('node_modules') || filePath.includes('dist/') || filePath.includes('build/')) {
    score = -100;
  }

  return score;
}

// Generate project structure tree
async function generateProjectStructure(
  fs: {
    readdir: (path: string) => Promise<any[]>;
    readFile: (path: string, encoding?: string) => Promise<string>;
  },
  basePath: string = '.',
  depth: number = 0,
  maxDepth: number = 4
): Promise<string> {
  if (depth >= maxDepth) return '';

  try {
    const entries = await fs.readdir(basePath);
    const indent = '  '.repeat(depth);
    let structure = '';

    // Filter and sort entries
    const sortedEntries = entries
      .filter((entry: any) => {
        const name = typeof entry === 'string' ? entry : entry.name;
        // Skip hidden files and common non-relevant directories
        return !name.startsWith('.') &&
          name !== 'node_modules' &&
          name !== 'dist' &&
          name !== 'build' &&
          name !== '.git';
      })
      .sort((a: any, b: any) => {
        const nameA = typeof a === 'string' ? a : a.name;
        const nameB = typeof b === 'string' ? b : b.name;
        // Directories first, then files
        const isDirA = typeof a !== 'string' && a.isDirectory?.();
        const isDirB = typeof b !== 'string' && b.isDirectory?.();
        if (isDirA && !isDirB) return -1;
        if (!isDirA && isDirB) return 1;
        return nameA.localeCompare(nameB);
      });

    for (const entry of sortedEntries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const isDir = typeof entry !== 'string' && entry.isDirectory?.();
      const fullPath = basePath === '.' ? name : `${basePath}/${name}`;

      if (isDir) {
        structure += `${indent}${name}/\n`;
        structure += await generateProjectStructure(fs, fullPath, depth + 1, maxDepth);
      } else {
        structure += `${indent}${name}\n`;
      }
    }

    return structure;
  } catch (error) {
    logger.warn(`Failed to read directory ${basePath}:`, error);
    return '';
  }
}

// Read file safely
async function readFileSafe(
  fs: { readFile: (path: string, encoding?: string) => Promise<string> },
  path: string,
  maxSize: number
): Promise<string | null> {
  try {
    const content = await fs.readFile(path, 'utf-8');
    if (content.length > maxSize) {
      return content.substring(0, maxSize) + '\n... (truncated)';
    }
    return content;
  } catch {
    return null;
  }
}

// Collect all files recursively
async function collectFiles(
  fs: {
    readdir: (path: string) => Promise<any[]>;
    readFile: (path: string, encoding?: string) => Promise<string>;
  },
  basePath: string,
  maxSize: number,
  collected: Map<string, string> = new Map()
): Promise<Map<string, string>> {
  try {
    const entries = await fs.readdir(basePath);

    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const fullPath = basePath === '.' ? name : `${basePath}/${name}`;

      // Skip irrelevant paths
      if (name.startsWith('.') || name === 'node_modules' || name === 'dist' || name === 'build') {
        continue;
      }

      const isDir = typeof entry !== 'string' && entry.isDirectory?.();

      if (isDir) {
        await collectFiles(fs, fullPath, maxSize, collected);
      } else {
        // Only read text files
        const textExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md', '.txt'];
        if (textExtensions.some(ext => name.endsWith(ext))) {
          const content = await readFileSafe(fs, fullPath, maxSize);
          if (content) {
            collected.set(fullPath, content);
          }
        }
      }
    }
  } catch (error) {
    logger.warn(`Failed to collect files from ${basePath}:`, error);
  }

  return collected;
}

// Format project context for AI
function formatProjectContext(context: ProjectContext): string {
  let formatted = '\n<project_context>\n';

  // Project structure
  if (context.structure) {
    formatted += '## Project Structure\n```\n' + context.structure + '```\n\n';
  }

  // Dependencies
  if (context.dependencies.length > 0) {
    formatted += '## Installed Dependencies\n';
    formatted += context.dependencies.join(', ') + '\n\n';
  }

  // Relevant files
  if (context.relevantFiles.length > 0) {
    formatted += '## Relevant Files\n\n';
    for (const file of context.relevantFiles) {
      formatted += `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
    }
  }

  formatted += '</project_context>\n';
  return formatted;
}

export function useSimpleChatWithContext(options: UseChatOptions) {
  const {
    api,
    onError,
    onFinish,
    onResponse,
    initialMessages = [],
    maxContextFiles = 10,
    maxFileSize = 8000,
    includeProjectStructure = true,
  } = options;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [recoderContext, setRecoderContext] = useState<string>('');
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedContentRef = useRef<string>('');
  const currentAssistantIdRef = useRef<string>('');

  // Load .recoder/ context on mount and when messages change
  useEffect(() => {
    loadRecoderContext();
  }, [messages.length]);

  // Load project context on mount
  useEffect(() => {
    loadProjectContext();
  }, []);

  const loadRecoderContext = async () => {
    try {
      const wc = await webcontainer as any;
      const contextPrompt = await integrateRecoderContext(
        {
          readFile: (path: string, encoding?: string) => wc.fs.readFile(path, encoding || 'utf-8'),
          writeFile: (path: string, content: string) => wc.fs.writeFile(path, content),
          mkdir: (path: string, options?: any) => wc.fs.mkdir(path, options),
          readdir: (path: string) => wc.fs.readdir(path),
        },
        messages.length === 0 // isFirstMessage
      );
      setRecoderContext(contextPrompt);
    } catch (error) {
      logger.error('Failed to load .recoder/ context:', error);
      setRecoderContext('');
    }
  };

  const loadProjectContext = async () => {
    try {
      const wc = await webcontainer as any;
      const fs = {
        readFile: (path: string, encoding?: string) => wc.fs.readFile(path, encoding || 'utf-8'),
        readdir: (path: string) => wc.fs.readdir(path),
      };

      // Generate project structure
      const structure = includeProjectStructure
        ? await generateProjectStructure(fs, '.', 0, 4)
        : '';

      // Read package.json
      let packageJson: object | undefined;
      let dependencies: string[] = [];
      try {
        const pkgContent = await fs.readFile('package.json', 'utf-8');
        packageJson = JSON.parse(pkgContent);
        const deps = {
          ...(packageJson as any).dependencies || {},
          ...(packageJson as any).devDependencies || {},
        };
        dependencies = Object.keys(deps);
      } catch {
        // No package.json
      }

      setProjectContext({
        structure,
        relevantFiles: [],
        packageJson,
        dependencies,
      });
    } catch (error) {
      logger.error('Failed to load project context:', error);
    }
  };

  // Load relevant files based on user query
  const loadRelevantFiles = async (userQuery: string): Promise<ProjectFile[]> => {
    try {
      const wc = await webcontainer as any;
      const fs = {
        readFile: (path: string, encoding?: string) => wc.fs.readFile(path, encoding || 'utf-8'),
        readdir: (path: string) => wc.fs.readdir(path),
      };

      // Collect all files
      const allFiles = await collectFiles(fs, '.', maxFileSize);

      // Calculate relevance scores
      const scoredFiles: ProjectFile[] = [];
      for (const [path, content] of allFiles) {
        const score = calculateRelevance(path, content, userQuery);
        if (score > 0) {
          scoredFiles.push({ path, content, relevanceScore: score });
        }
      }

      // Sort by relevance and take top N
      scoredFiles.sort((a, b) => b.relevanceScore - a.relevanceScore);
      return scoredFiles.slice(0, maxContextFiles);
    } catch (error) {
      logger.error('Failed to load relevant files:', error);
      return [];
    }
  };

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const append = useCallback(async (message: Omit<Message, 'id' | 'createdAt'>) => {
    const userMessage: Message = {
      ...message,
      id: `user-${Date.now()}`,
      createdAt: new Date(),
    };

    // Reset accumulated content
    accumulatedContentRef.current = '';
    const assistantId = `assistant-${Date.now() + 1}`;
    currentAssistantIdRef.current = assistantId;

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      abortControllerRef.current = new AbortController();

      // Load relevant files based on user query
      const relevantFiles = await loadRelevantFiles(message.content);
      const updatedContext: ProjectContext = {
        ...(projectContext || { structure: '', relevantFiles: [], dependencies: [] }),
        relevantFiles,
      };

      // Format context for AI
      const contextPrompt = formatProjectContext(updatedContext);

      // Initial connection timeout (180s for complex requests like code generation)
      let timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
      }, 180000);

      try {
        const response = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage],
            recoderContext, // Include .recoder/ context
            projectContext: contextPrompt, // Include project files context
          }),
          signal: abortControllerRef.current.signal,
        });

        clearTimeout(timeoutId);

        if (onResponse) {
          onResponse(response);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Streaming timeout - reset whenever data is received (45s idle timeout)
        let streamingTimeoutId: ReturnType<typeof setTimeout> | null = null;
        const resetStreamingTimeout = () => {
          if (streamingTimeoutId) clearTimeout(streamingTimeoutId);
          streamingTimeoutId = setTimeout(() => {
            const actionsInProgress = getActionsInProgress();
            if (actionsInProgress > 0) {
              logger.info(`[useSimpleChatWithContext] ${actionsInProgress} action(s) in progress, extending timeout...`);
              resetStreamingTimeout();
              return;
            }
            abortControllerRef.current?.abort();
          }, 45000);
        };

        while (true) {
          resetStreamingTimeout();
          const { done, value } = await reader.read();
          if (done) {
            if (streamingTimeoutId) clearTimeout(streamingTimeoutId);
            break;
          }

          const text = decoder.decode(value);
          accumulatedContentRef.current += text;
          const currentContent = accumulatedContentRef.current;

          // Use immutable update
          setMessages(prev => {
            return prev.map(msg =>
              msg.id === assistantId
                ? { ...msg, content: currentContent }
                : msg
            );
          });
        }

        // Create final message
        const finalAssistantMessage: Message = {
          id: assistantId,
          role: 'assistant',
          content: accumulatedContentRef.current,
          createdAt: new Date(),
        };

        setMessages(prev => {
          return prev.map(msg =>
            msg.id === assistantId
              ? finalAssistantMessage
              : msg
          );
        });

        if (onFinish) {
          onFinish(finalAssistantMessage);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const timeoutError = new Error('Request timed out. The response is taking too long. Please try a shorter message or simpler request.');
        logger.error('Chat timeout:', timeoutError);
        if (onError) {
          onError(timeoutError);
        }
        // Update the assistant message to show timeout error
        setMessages(prev => {
          return prev.map(msg =>
            msg.id === assistantId
              ? { ...msg, content: msg.content + '\n\n⚠️ Request timed out. The partial response above may be incomplete.' }
              : msg
          );
        });
      } else {
        logger.error('Chat error:', error);
        if (onError) {
          onError(error);
        }
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [api, messages, recoderContext, projectContext, onError, onFinish, onResponse, maxContextFiles, maxFileSize, includeProjectStructure, loadRelevantFiles]);

  // Reload project context manually
  const refreshProjectContext = useCallback(async () => {
    await loadProjectContext();
  }, []);

  return {
    messages,
    isLoading,
    input,
    handleInputChange,
    setInput,
    stop,
    append,
    recoderContext, // Expose context for debugging
    projectContext, // Expose project context
    refreshProjectContext, // Allow manual refresh
  };
}
