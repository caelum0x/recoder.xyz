/**
 * .recoder/ project configuration directory support.
 * Loads project-specific AI instructions from the user's project.
 *
 * Supported files:
 * - .recoder/INSTRUCTIONS.md — Custom AI instructions (coding standards, preferred libraries)
 * - .recoder/IDENTITY.md — Project identity (what it is, target audience, tech stack)
 * - .recoder/RULES.md — Rules and constraints (don't use X, always use Y)
 *
 * Also supports root-level:
 * - .cursorrules / .cursorrc (Cursor AI rules — common in many projects)
 * - CLAUDE.md (Claude Code instructions)
 * - .github/copilot-instructions.md (GitHub Copilot instructions)
 */

export interface ProjectConfig {
  instructions?: string;
  identity?: string;
  rules?: string;
  cursorRules?: string;
  claudeMd?: string;
  copilotInstructions?: string;
}

const CONFIG_FILES: Array<{ path: string; field: keyof ProjectConfig }> = [
  { path: '.recoder/INSTRUCTIONS.md', field: 'instructions' },
  { path: '.recoder/IDENTITY.md', field: 'identity' },
  { path: '.recoder/RULES.md', field: 'rules' },
  { path: '.cursorrules', field: 'cursorRules' },
  { path: '.cursorrc', field: 'cursorRules' },
  { path: 'CLAUDE.md', field: 'claudeMd' },
  { path: '.github/copilot-instructions.md', field: 'copilotInstructions' },
];

/**
 * Load project config from a file reader function.
 * The reader should return file content or null if not found.
 */
export async function loadProjectConfig(
  readFile: (path: string) => Promise<string | null>,
): Promise<ProjectConfig> {
  const config: ProjectConfig = {};

  const results = await Promise.all(
    CONFIG_FILES.map(async ({ path, field }) => {
      try {
        const content = await readFile(path);
        return { field, content };
      } catch {
        return { field, content: null };
      }
    }),
  );

  for (const { field, content } of results) {
    if (content && content.trim()) {
      if (!config[field]) {
        config[field] = content.trim();
      }
    }
  }

  return config;
}

/**
 * Format project config into a system prompt section.
 */
export function formatProjectConfigPrompt(config: ProjectConfig): string {
  const sections: string[] = [];

  if (config.identity) {
    sections.push(`<project_identity>\n${config.identity}\n</project_identity>`);
  }

  if (config.instructions) {
    sections.push(`<project_instructions>\n${config.instructions}\n</project_instructions>`);
  }

  if (config.rules) {
    sections.push(`<project_rules>\n${config.rules}\n</project_rules>`);
  }

  if (config.cursorRules) {
    sections.push(`<cursor_rules>\n${config.cursorRules}\n</cursor_rules>`);
  }

  if (config.claudeMd) {
    sections.push(`<claude_instructions>\n${config.claudeMd}\n</claude_instructions>`);
  }

  if (config.copilotInstructions) {
    sections.push(`<copilot_instructions>\n${config.copilotInstructions}\n</copilot_instructions>`);
  }

  if (sections.length === 0) return '';

  return `\n<project_config>\nThe following are project-specific configuration and instructions provided by the developer.\nFollow these rules and preferences when working on this project.\n${sections.join('\n')}\n</project_config>`;
}

/**
 * One-call convenience: load + format
 */
export async function getProjectConfigPrompt(
  readFile: (path: string) => Promise<string | null>,
): Promise<string> {
  const config = await loadProjectConfig(readFile);
  return formatProjectConfigPrompt(config);
}
