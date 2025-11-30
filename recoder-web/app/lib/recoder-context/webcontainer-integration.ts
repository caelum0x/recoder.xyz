/**
 * WebContainer Integration for .recoder/ Context
 * Helper functions to integrate with WebContainer file system
 */

import { loadRecoderContext, formatContextForAI, type RecoderContext } from './loader';
import { initializeRecoderDirectory } from './initializer';

/**
 * WebContainer file system interface
 */
export interface WebContainerFS {
  readFile: (path: string, encoding?: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
}

/**
 * Check if .recoder/ directory exists in WebContainer
 */
export async function hasRecoderDirectory(fs: WebContainerFS): Promise<boolean> {
  try {
    await fs.readdir('.recoder');
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize .recoder/ in WebContainer
 */
export async function initRecoderInWebContainer(
  fs: WebContainerFS,
  template?: string
): Promise<void> {
  await initializeRecoderDirectory(
    {
      writeFile: fs.writeFile,
      mkdir: fs.mkdir,
      exists: async (path: string) => {
        try {
          await fs.readFile(path);
          return true;
        } catch {
          return false;
        }
      },
    },
    template
  );
}

/**
 * Load .recoder/ context from WebContainer
 */
export async function loadRecoderFromWebContainer(
  fs: WebContainerFS
): Promise<RecoderContext> {
  return await loadRecoderContext(async (path: string) => {
    try {
      return await fs.readFile(path, 'utf-8');
    } catch {
      return null;
    }
  });
}

/**
 * Get formatted context for AI from WebContainer
 */
export async function getWebContainerContext(
  fs: WebContainerFS
): Promise<string> {
  const context = await loadRecoderFromWebContainer(fs);
  return formatContextForAI(context);
}

/**
 * Complete integration: check, init if needed, load context
 */
export async function integrateRecoderContext(
  fs: WebContainerFS,
  isFirstMessage: boolean,
  template?: string
): Promise<string> {
  // Initialize on first message if doesn't exist
  if (isFirstMessage) {
    const exists = await hasRecoderDirectory(fs);
    if (!exists) {
      await initRecoderInWebContainer(fs, template);
    }
  }

  // Load and return context
  return await getWebContainerContext(fs);
}
