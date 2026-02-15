/**
 * Custom Command Loader
 *
 * Loads custom commands and workflows from .recoder/commands/ and .recoder/workflows/
 *
 * File format (markdown with YAML frontmatter):
 * ```
 * ---
 * description: Deploy to production
 * category: deploy
 * icon: i-ph-rocket
 * shortcut: Ctrl+D
 * ---
 * npm run build && vercel --prod
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CommandsLoader');

// =============================================================================
// Types
// =============================================================================

export type CommandCategory = 'test' | 'deploy' | 'lint' | 'build' | 'custom';
export type CommandAction = 'shell' | 'prompt' | 'workflow';

export interface WorkflowStep {
  id: string;
  name: string;
  action: 'shell' | 'prompt' | 'file';
  command?: string;
  prompt?: string;
  file?: { path: string; content: string };
  condition?: string;
}

export interface Command {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'custom' | 'workflow';
  action: CommandAction;
  shell?: string;
  prompt?: string;
  steps?: WorkflowStep[];
  icon?: string;
  shortcut?: string;
  category?: CommandCategory;
}

interface YAMLFrontmatter {
  description?: string;
  category?: CommandCategory;
  icon?: string;
  shortcut?: string;
  action?: CommandAction;
  steps?: WorkflowStep[];
}

// =============================================================================
// Loader Functions
// =============================================================================

/**
 * Load custom commands from .recoder/commands/ directory
 */
export async function loadProjectCommands(projectPath: string): Promise<Command[]> {
  const commandsDir = path.join(projectPath, '.recoder', 'commands');
  const commands: Command[] = [];

  try {
    if (!fs.existsSync(commandsDir)) {
      return commands;
    }

    const files = fs.readdirSync(commandsDir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(commandsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const command = parseCommandFile(content, file);

      if (command) {
        commands.push(command);
      }
    }
  } catch (error) {
    logger.error('Failed to load custom commands:', error);
  }

  return commands;
}

/**
 * Load workflow files from .recoder/workflows/
 */
export async function loadProjectWorkflows(projectPath: string): Promise<Command[]> {
  const workflowsDir = path.join(projectPath, '.recoder', 'workflows');
  const workflows: Command[] = [];

  try {
    if (!fs.existsSync(workflowsDir)) {
      return workflows;
    }

    const files = fs.readdirSync(workflowsDir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(workflowsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const workflow = parseWorkflowFile(content, file);

      if (workflow) {
        workflows.push(workflow);
      }
    }
  } catch (error) {
    logger.error('Failed to load workflows:', error);
  }

  return workflows;
}

/**
 * Parse a command markdown file
 */
export function parseCommandFile(content: string, filename: string): Command | null {
  try {
    const { frontmatter, body } = parseFrontmatter(content);
    const id = filename.replace('.md', '');
    const name = formatCommandName(id);

    // Determine action type
    let action: CommandAction = 'shell';
    if (frontmatter.action) {
      action = frontmatter.action;
    } else if (frontmatter.steps) {
      action = 'workflow';
    }

    const command: Command = {
      id,
      name,
      description: frontmatter.description || `Custom command: ${name}`,
      type: 'custom',
      action,
      icon: frontmatter.icon,
      shortcut: frontmatter.shortcut,
      category: frontmatter.category || 'custom',
    };

    // Set shell command or prompt based on action
    if (action === 'shell') {
      command.shell = body.trim();
    } else if (action === 'prompt') {
      command.prompt = body.trim();
    } else if (action === 'workflow') {
      command.steps = frontmatter.steps || parseWorkflowSteps(body);
    }

    return command;
  } catch (error) {
    logger.error(`Failed to parse command file ${filename}:`, error);
    return null;
  }
}

/**
 * Parse a workflow markdown file
 */
export function parseWorkflowFile(content: string, filename: string): Command | null {
  try {
    const { frontmatter, body } = parseFrontmatter(content);
    const id = filename.replace('.md', '');
    const name = formatCommandName(id);

    // Parse workflow steps from YAML or body
    const steps = frontmatter.steps || parseWorkflowSteps(body);

    if (!steps || steps.length === 0) {
      logger.warn(`Workflow ${filename} has no steps`);
      return null;
    }

    return {
      id,
      name,
      description: frontmatter.description || `Workflow: ${name}`,
      type: 'workflow',
      action: 'workflow',
      steps,
      icon: frontmatter.icon || 'i-ph-list-checks',
      shortcut: frontmatter.shortcut,
      category: frontmatter.category || 'custom',
    };
  } catch (error) {
    logger.error(`Failed to parse workflow file ${filename}:`, error);
    return null;
  }
}

// =============================================================================
// Parser Helpers
// =============================================================================

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: YAMLFrontmatter; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = content.slice(match[0].length);

  // Simple YAML parsing (key: value pairs)
  const frontmatter: YAMLFrontmatter = {};
  const lines = frontmatterStr.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    switch (key) {
      case 'description':
        frontmatter.description = value;
        break;
      case 'category':
        frontmatter.category = value as CommandCategory;
        break;
      case 'icon':
        frontmatter.icon = value;
        break;
      case 'shortcut':
        frontmatter.shortcut = value;
        break;
      case 'action':
        frontmatter.action = value as CommandAction;
        break;
    }
  }

  // Parse steps if present (simplified YAML array parsing)
  if (frontmatterStr.includes('steps:')) {
    frontmatter.steps = parseYAMLSteps(frontmatterStr);
  }

  return { frontmatter, body };
}

/**
 * Parse workflow steps from YAML
 */
function parseYAMLSteps(yaml: string): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  const stepsMatch = yaml.match(/steps:\s*\n((?:\s+-[\s\S]*?(?=\n\S|\n*$))+)/);

  if (!stepsMatch) return steps;

  const stepsStr = stepsMatch[1];
  const stepRegex = /\s*-\s*name:\s*(.+)\n\s*(?:shell|command):\s*(.+)/g;

  let match;
  let stepIndex = 0;
  while ((match = stepRegex.exec(stepsStr)) !== null) {
    steps.push({
      id: `step-${stepIndex++}`,
      name: match[1].trim(),
      action: 'shell',
      command: match[2].trim(),
    });
  }

  return steps;
}

/**
 * Parse workflow steps from markdown body (simple format)
 * Each line starting with "- " is a step
 */
function parseWorkflowSteps(body: string): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  const lines = body.split('\n');

  let stepIndex = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ') && !trimmed.startsWith('* ')) continue;

    const content = trimmed.slice(2).trim();
    if (!content) continue;

    // Check if it's a named step (format: "Step Name: command")
    const colonIndex = content.indexOf(':');
    let name: string;
    let command: string;

    if (colonIndex !== -1 && colonIndex < 30) {
      name = content.slice(0, colonIndex).trim();
      command = content.slice(colonIndex + 1).trim();
    } else {
      name = `Step ${stepIndex + 1}`;
      command = content;
    }

    steps.push({
      id: `step-${stepIndex++}`,
      name,
      action: 'shell',
      command,
    });
  }

  return steps;
}

/**
 * Format command ID to display name
 * "deploy-prod" -> "Deploy Prod"
 */
function formatCommandName(id: string): string {
  return id
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a project has custom commands
 */
export function hasCustomCommands(projectPath: string): boolean {
  const commandsDir = path.join(projectPath, '.recoder', 'commands');
  const workflowsDir = path.join(projectPath, '.recoder', 'workflows');

  return fs.existsSync(commandsDir) || fs.existsSync(workflowsDir);
}

/**
 * Create example custom command file
 */
export function createExampleCommand(projectPath: string): void {
  const commandsDir = path.join(projectPath, '.recoder', 'commands');

  if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
  }

  const examplePath = path.join(commandsDir, 'example.md');
  const exampleContent = `---
description: Example custom command
category: custom
icon: i-ph-star
---
echo "Hello from custom command!"
`;

  fs.writeFileSync(examplePath, exampleContent);
}
