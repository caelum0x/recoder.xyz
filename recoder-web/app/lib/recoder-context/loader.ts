/**
 * .recoder/ Context Loader
 * Loads project-specific context files for AI
 */

export interface RecoderContext {
  spec?: string;
  prd?: string;
  architecture?: string;
  styleGuide?: string;
  apiDocs?: string;
  context?: string;
  prompts?: {
    component?: string;
    api?: string;
    test?: string;
  };
}

const RECODER_FILES = [
  'spec.md',
  'prd.md',
  'architecture.md',
  'style-guide.md',
  'api-docs.md',
  'context.md',
  'prompts/component.md',
  'prompts/api.md',
  'prompts/test.md',
];

/**
 * Load .recoder/ context from WebContainer
 */
export async function loadRecoderContext(
  readFile: (path: string) => Promise<string | null>
): Promise<RecoderContext> {
  const context: RecoderContext = { prompts: {} };

  for (const file of RECODER_FILES) {
    try {
      const content = await readFile(`.recoder/${file}`);
      if (!content) continue;

      // Map file to context property
      if (file === 'spec.md') context.spec = content;
      else if (file === 'prd.md') context.prd = content;
      else if (file === 'architecture.md') context.architecture = content;
      else if (file === 'style-guide.md') context.styleGuide = content;
      else if (file === 'api-docs.md') context.apiDocs = content;
      else if (file === 'context.md') context.context = content;
      else if (file === 'prompts/component.md') context.prompts!.component = content;
      else if (file === 'prompts/api.md') context.prompts!.api = content;
      else if (file === 'prompts/test.md') context.prompts!.test = content;
    } catch (error) {
      // File doesn't exist, skip
      continue;
    }
  }

  return context;
}

/**
 * Format context for AI system prompt
 */
export function formatContextForAI(context: RecoderContext): string {
  const sections: string[] = [];

  if (context.context) {
    sections.push(`## Project Context\n${context.context}`);
  }

  if (context.spec) {
    sections.push(`## Specification\n${context.spec}`);
  }

  if (context.prd) {
    sections.push(`## Product Requirements\n${context.prd}`);
  }

  if (context.architecture) {
    sections.push(`## Architecture\n${context.architecture}`);
  }

  if (context.styleGuide) {
    sections.push(`## Style Guide\n${context.styleGuide}`);
  }

  if (context.apiDocs) {
    sections.push(`## API Documentation\n${context.apiDocs}`);
  }

  if (sections.length === 0) {
    return '';
  }

  return `\n\n# Project-Specific Context\n\n${sections.join('\n\n')}`;
}

/**
 * Get custom prompt for specific task
 */
export function getCustomPrompt(
  context: RecoderContext,
  type: 'component' | 'api' | 'test'
): string | undefined {
  return context.prompts?.[type];
}

/**
 * Check if .recoder/ directory exists
 */
export async function hasRecoderContext(
  fileExists: (path: string) => Promise<boolean>
): Promise<boolean> {
  return await fileExists('.recoder/context.md');
}
