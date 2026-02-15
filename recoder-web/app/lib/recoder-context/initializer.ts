/**
 * .recoder/ Directory Initializer
 * Auto-creates .recoder/ directory in WebContainer
 */

import { createScopedLogger } from '~/utils/logger';
import {
  DEFAULT_CONTEXT,
  DEFAULT_SPEC,
  DEFAULT_PRD,
  DEFAULT_ARCHITECTURE,
  DEFAULT_STYLE_GUIDE,
  DEFAULT_API_DOCS,
  DEFAULT_COMPONENT_PROMPT,
  DEFAULT_API_PROMPT,
  DEFAULT_TEST_PROMPT,
  getTemplate,
  type RecoderTemplate,
} from './templates';

const logger = createScopedLogger('RecoderContextInit');

export interface FileWriter {
  writeFile: (path: string, content: string) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
}

/**
 * Initialize .recoder/ directory with default files
 */
export async function initializeRecoderDirectory(
  fs: FileWriter,
  template?: string
): Promise<void> {
  // Create .recoder/ directory
  await fs.mkdir('.recoder', { recursive: true });
  await fs.mkdir('.recoder/prompts', { recursive: true });

  // Check if already initialized
  const exists = await fs.exists('.recoder/context.md');
  if (exists) {
    logger.info('.recoder/ already initialized');
    return;
  }

  // Use template if provided
  if (template) {
    const tmpl = getTemplate(template as any);
    if (tmpl) {
      for (const [file, content] of Object.entries(tmpl.files)) {
        await fs.writeFile(`.recoder/${file}`, content);
      }
      logger.info(`.recoder/ initialized with ${template} template`);
      return;
    }
  }

  // Create default files
  await fs.writeFile('.recoder/context.md', DEFAULT_CONTEXT);
  await fs.writeFile('.recoder/spec.md', DEFAULT_SPEC);
  await fs.writeFile('.recoder/prd.md', DEFAULT_PRD);
  await fs.writeFile('.recoder/architecture.md', DEFAULT_ARCHITECTURE);
  await fs.writeFile('.recoder/style-guide.md', DEFAULT_STYLE_GUIDE);
  await fs.writeFile('.recoder/api-docs.md', DEFAULT_API_DOCS);
  await fs.writeFile('.recoder/prompts/component.md', DEFAULT_COMPONENT_PROMPT);
  await fs.writeFile('.recoder/prompts/api.md', DEFAULT_API_PROMPT);
  await fs.writeFile('.recoder/prompts/test.md', DEFAULT_TEST_PROMPT);

  logger.info('.recoder/ initialized with default files');
}

/**
 * Check if .recoder/ should be auto-initialized
 */
export function shouldAutoInitialize(messageCount: number, hasRecoderDir: boolean): boolean {
  // Auto-initialize on first message if not exists
  return messageCount === 1 && !hasRecoderDir;
}
