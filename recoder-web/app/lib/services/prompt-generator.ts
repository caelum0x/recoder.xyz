/**
 * Prompt Generator Service
 * Inspired by vscode-ai-toolkit's meta-prompt system
 *
 * Features:
 * - Templates for common prompts
 * - Variable substitution with {{placeholders}}
 * - Prompt composition from parts
 * - Model-specific optimizations
 * - Token counting for prompts
 */

import { MODEL_CONTEXT_WINDOWS, estimateTokens } from './condense';

// ============================================
// Types
// ============================================

/** Variable placeholder definition */
export interface PromptVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  type: 'string' | 'code' | 'path' | 'list';
  /** For list type, separator to use when joining */
  listSeparator?: string;
}

/** Prompt part that can be composed */
export interface PromptPart {
  id: string;
  name: string;
  content: string;
  description?: string;
  /** Order in which parts are composed (lower = earlier) */
  order: number;
  /** Whether this part is optional */
  optional: boolean;
}

/** Model capability tier for optimization */
export type ModelTier = 'fast' | 'balanced' | 'capable';

/** Model-specific prompt variant */
export interface ModelVariant {
  tier: ModelTier;
  content: string;
  /** Maximum tokens for this variant */
  maxTokens?: number;
}

/** Prompt template definition */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: PromptCategory;
  tags: string[];
  /** Main template content with {{variable}} placeholders */
  template: string;
  /** Variables used in this template */
  variables: PromptVariable[];
  /** Optional composable parts */
  parts?: PromptPart[];
  /** Model-specific variants */
  variants?: ModelVariant[];
  /** Example usage */
  example?: string;
  /** Whether this is a built-in template */
  isBuiltIn: boolean;
  /** Created timestamp */
  createdAt: Date;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Usage count */
  usageCount: number;
}

/** Prompt category */
export type PromptCategory =
  | 'component'
  | 'feature'
  | 'bugfix'
  | 'refactor'
  | 'testing'
  | 'documentation'
  | 'custom';

/** Generated prompt result */
export interface GeneratedPrompt {
  content: string;
  tokenCount: number;
  usedVariables: Record<string, string>;
  missingVariables: string[];
  warnings: string[];
  /** Selected parts if using composition */
  selectedParts?: string[];
}

/** Prompt generation options */
export interface PromptGenerationOptions {
  /** Values for variable substitution */
  variables?: Record<string, string | string[]>;
  /** Specific parts to include (if template has parts) */
  includeParts?: string[];
  /** Specific parts to exclude */
  excludeParts?: string[];
  /** Model ID for optimization */
  model?: string;
  /** Force a specific model tier */
  forceTier?: ModelTier;
  /** Maximum tokens for the prompt */
  maxTokens?: number;
  /** Whether to include example in prompt */
  includeExample?: boolean;
}

// ============================================
// Token Estimation
// ============================================

/**
 * Estimate token count for a prompt string
 * Uses the same estimation as condense service (~4 chars per token)
 */
export function estimatePromptTokens(prompt: string): number {
  return estimateTokens(prompt);
}

/**
 * Check if prompt fits within token budget
 */
export function promptFitsInBudget(prompt: string, maxTokens: number): boolean {
  return estimatePromptTokens(prompt) <= maxTokens;
}

/**
 * Get available token budget for model
 */
export function getModelTokenBudget(model?: string): number {
  if (!model) return MODEL_CONTEXT_WINDOWS.default;
  return MODEL_CONTEXT_WINDOWS[model] || MODEL_CONTEXT_WINDOWS.default;
}

/**
 * Calculate remaining tokens after prompt
 */
export function getRemainingTokens(prompt: string, model?: string): number {
  const budget = getModelTokenBudget(model);
  const used = estimatePromptTokens(prompt);
  return Math.max(0, budget - used);
}

// ============================================
// Model Tier Detection
// ============================================

/**
 * Model tier mapping for optimization
 */
const MODEL_TIERS: Record<string, ModelTier> = {
  // Fast models (smaller, quicker)
  'anthropic/claude-3-haiku': 'fast',
  'openai/gpt-4o-mini': 'fast',
  'google/gemini-flash-1.5': 'fast',
  'deepseek/deepseek-chat': 'fast',
  'claude-3-haiku-20240307': 'fast',
  'gpt-4o-mini': 'fast',

  // Balanced models
  'anthropic/claude-3.5-sonnet': 'balanced',
  'anthropic/claude-sonnet-4': 'balanced',
  'openai/gpt-4o': 'balanced',
  'google/gemini-pro-1.5': 'balanced',
  'claude-3-5-sonnet-20241022': 'balanced',
  'gpt-4o': 'balanced',

  // Capable models (largest, most capable)
  'anthropic/claude-3-opus': 'capable',
  'anthropic/claude-opus-4': 'capable',
  'openai/gpt-4-turbo': 'capable',
  'meta-llama/llama-3.1-405b-instruct': 'capable',
  'claude-3-opus-20240229': 'capable',
  'gpt-4-turbo-preview': 'capable',
};

/**
 * Detect model tier from model ID
 */
export function detectModelTier(model?: string): ModelTier {
  if (!model) return 'balanced';

  // Check exact match first
  if (MODEL_TIERS[model]) {
    return MODEL_TIERS[model];
  }

  // Check partial match
  const modelLower = model.toLowerCase();
  for (const [key, tier] of Object.entries(MODEL_TIERS)) {
    if (modelLower.includes(key.toLowerCase()) || key.toLowerCase().includes(modelLower)) {
      return tier;
    }
  }

  // Default based on model name patterns
  if (modelLower.includes('haiku') || modelLower.includes('mini') || modelLower.includes('flash')) {
    return 'fast';
  }
  if (modelLower.includes('opus') || modelLower.includes('turbo') || modelLower.includes('405b')) {
    return 'capable';
  }

  return 'balanced';
}

// ============================================
// Variable Substitution
// ============================================

/**
 * Extract variable names from a template string
 */
export function extractVariables(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  return variables;
}

/**
 * Substitute variables in a template string
 */
export function substituteVariables(
  template: string,
  values: Record<string, string | string[]>,
  variables?: PromptVariable[]
): { result: string; missing: string[]; used: Record<string, string> } {
  const variableNames = extractVariables(template);
  const missing: string[] = [];
  const used: Record<string, string> = {};

  let result = template;

  for (const varName of variableNames) {
    const value = values[varName];
    const varDef = variables?.find((v) => v.name === varName);

    let substitution: string;

    if (value === undefined || value === null || value === '') {
      // Check for default value
      if (varDef?.defaultValue !== undefined) {
        substitution = varDef.defaultValue;
      } else if (varDef?.required) {
        missing.push(varName);
        continue;
      } else {
        // Remove the placeholder for optional variables
        substitution = '';
      }
    } else if (Array.isArray(value)) {
      // Handle list values
      const separator = varDef?.listSeparator || ', ';
      substitution = value.join(separator);
    } else {
      substitution = value;
    }

    result = result.replace(new RegExp(`\\{\\{${varName}\\}\\}`, 'g'), substitution);
    used[varName] = substitution;
  }

  return { result, missing, used };
}

// ============================================
// Prompt Composition
// ============================================

/**
 * Compose prompt from parts
 */
export function composeParts(
  parts: PromptPart[],
  include?: string[],
  exclude?: string[]
): string {
  let selectedParts = parts;

  // Filter by include list
  if (include && include.length > 0) {
    selectedParts = selectedParts.filter((p) => include.includes(p.id) || !p.optional);
  }

  // Filter by exclude list
  if (exclude && exclude.length > 0) {
    selectedParts = selectedParts.filter((p) => !exclude.includes(p.id));
  }

  // Sort by order
  selectedParts.sort((a, b) => a.order - b.order);

  // Join parts with newlines
  return selectedParts.map((p) => p.content).join('\n\n');
}

// ============================================
// Model Optimization
// ============================================

/**
 * Get optimized prompt for model tier
 */
export function getOptimizedPrompt(
  template: PromptTemplate,
  tier: ModelTier
): string {
  // Check for tier-specific variant
  if (template.variants) {
    const variant = template.variants.find((v) => v.tier === tier);
    if (variant) {
      return variant.content;
    }
  }

  // Fall back to base template
  let optimized = template.template;

  // Apply tier-specific optimizations
  switch (tier) {
    case 'fast':
      // Shorten prompt for fast models
      optimized = shortenPrompt(optimized);
      break;
    case 'capable':
      // Add more detail for capable models
      if (template.example) {
        optimized += `\n\nExample:\n${template.example}`;
      }
      break;
    // 'balanced' uses the template as-is
  }

  return optimized;
}

/**
 * Shorten a prompt for fast models
 */
function shortenPrompt(prompt: string): string {
  // Remove verbose instructions
  let shortened = prompt
    .replace(/Please\s+/gi, '')
    .replace(/Make sure to\s+/gi, '')
    .replace(/Be sure to\s+/gi, '')
    .replace(/It's important that\s+/gi, '')
    .replace(/Note that\s+/gi, '');

  // Remove redundant whitespace
  shortened = shortened.replace(/\n{3,}/g, '\n\n').trim();

  return shortened;
}

/**
 * Truncate prompt to fit token budget
 */
export function truncateToFit(prompt: string, maxTokens: number): string {
  const currentTokens = estimatePromptTokens(prompt);
  if (currentTokens <= maxTokens) {
    return prompt;
  }

  // Estimate characters to keep (~4 chars per token)
  const targetChars = maxTokens * 4;
  const truncated = prompt.slice(0, targetChars - 50);

  // Try to end at a sentence boundary
  const lastPeriod = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = Math.max(lastPeriod, lastNewline);

  if (cutPoint > targetChars * 0.8) {
    return truncated.slice(0, cutPoint + 1) + '\n[Truncated]';
  }

  return truncated + '...[Truncated]';
}

// ============================================
// Prompt Generation
// ============================================

/**
 * Generate a prompt from a template
 */
export function generatePrompt(
  template: PromptTemplate,
  options: PromptGenerationOptions = {}
): GeneratedPrompt {
  const warnings: string[] = [];
  let content: string;

  // Determine model tier
  const tier = options.forceTier || detectModelTier(options.model);

  // Get base content (potentially optimized for model)
  if (options.model || options.forceTier) {
    content = getOptimizedPrompt(template, tier);
  } else {
    content = template.template;
  }

  // Compose parts if template has them
  let selectedParts: string[] | undefined;
  if (template.parts && template.parts.length > 0) {
    const partsContent = composeParts(
      template.parts,
      options.includeParts,
      options.excludeParts
    );
    // Replace {{parts}} placeholder or append
    if (content.includes('{{parts}}')) {
      content = content.replace('{{parts}}', partsContent);
    } else {
      content = partsContent + '\n\n' + content;
    }
    selectedParts = template.parts
      .filter((p) => {
        if (options.excludeParts?.includes(p.id)) return false;
        if (options.includeParts?.length && !options.includeParts.includes(p.id) && p.optional) return false;
        return true;
      })
      .map((p) => p.id);
  }

  // Substitute variables
  const { result, missing, used } = substituteVariables(
    content,
    options.variables || {},
    template.variables
  );
  content = result;

  // Add warnings for missing required variables
  for (const varName of missing) {
    const varDef = template.variables.find((v) => v.name === varName);
    if (varDef?.required) {
      warnings.push(`Missing required variable: {{${varName}}}`);
    }
  }

  // Include example if requested
  if (options.includeExample && template.example && !content.includes(template.example)) {
    content += `\n\nExample:\n${template.example}`;
  }

  // Check token limit
  const tokenCount = estimatePromptTokens(content);
  const maxTokens = options.maxTokens || getModelTokenBudget(options.model) * 0.25; // Use 25% of budget for prompt

  if (tokenCount > maxTokens) {
    warnings.push(`Prompt exceeds token budget (${tokenCount} > ${maxTokens}). Consider truncating.`);
    if (options.maxTokens) {
      content = truncateToFit(content, options.maxTokens);
    }
  }

  return {
    content,
    tokenCount: estimatePromptTokens(content),
    usedVariables: used,
    missingVariables: missing,
    warnings,
    selectedParts,
  };
}

// ============================================
// Built-in Templates
// ============================================

/** Common prompt variables */
const COMMON_VARIABLES: Record<string, PromptVariable> = {
  filename: {
    name: 'filename',
    description: 'The name of the file to create or modify',
    required: true,
    type: 'path',
  },
  language: {
    name: 'language',
    description: 'The programming language (e.g., TypeScript, Python)',
    required: false,
    defaultValue: 'TypeScript',
    type: 'string',
  },
  framework: {
    name: 'framework',
    description: 'The framework being used (e.g., React, Vue, Next.js)',
    required: false,
    defaultValue: 'React',
    type: 'string',
  },
  description: {
    name: 'description',
    description: 'A description of what to create or do',
    required: true,
    type: 'string',
  },
  componentName: {
    name: 'componentName',
    description: 'The name of the component',
    required: true,
    type: 'string',
  },
  props: {
    name: 'props',
    description: 'Props for the component',
    required: false,
    type: 'list',
    listSeparator: ', ',
  },
  errorMessage: {
    name: 'errorMessage',
    description: 'The error message to fix',
    required: true,
    type: 'string',
  },
  codeContext: {
    name: 'codeContext',
    description: 'Relevant code context',
    required: false,
    type: 'code',
  },
  testFramework: {
    name: 'testFramework',
    description: 'The testing framework (e.g., Jest, Vitest)',
    required: false,
    defaultValue: 'Vitest',
    type: 'string',
  },
  features: {
    name: 'features',
    description: 'List of features to implement',
    required: false,
    type: 'list',
    listSeparator: '\n- ',
  },
};

/** Built-in prompt templates */
export const BUILT_IN_TEMPLATES: PromptTemplate[] = [
  {
    id: 'create-component',
    name: 'Create Component',
    description: 'Create a new UI component with proper structure and styling',
    category: 'component',
    tags: ['component', 'ui', 'react', 'create'],
    template: `Create a {{framework}} component called {{componentName}}.

Description: {{description}}

Requirements:
- Use {{language}} with proper types
- Use functional component with hooks
- Add proper prop types{{props}}
- Use Tailwind CSS for styling
- Handle loading, error, and empty states where appropriate
- Include helpful comments

{{codeContext}}`,
    variables: [
      COMMON_VARIABLES.componentName,
      COMMON_VARIABLES.description,
      COMMON_VARIABLES.framework,
      COMMON_VARIABLES.language,
      COMMON_VARIABLES.props,
      COMMON_VARIABLES.codeContext,
    ],
    variants: [
      {
        tier: 'fast',
        content: `Create {{componentName}} component in {{framework}}.
{{description}}
Use {{language}}, Tailwind CSS, proper types.{{props}}{{codeContext}}`,
      },
      {
        tier: 'capable',
        content: `Create a comprehensive {{framework}} component called {{componentName}}.

## Description
{{description}}

## Requirements
1. Use {{language}} with comprehensive type definitions
2. Implement as a functional component using React hooks
3. Define clear prop types with optional/required distinctions{{props}}
4. Use Tailwind CSS for all styling (no inline styles)
5. Implement proper state management
6. Handle all edge cases:
   - Loading states with skeleton/spinner
   - Error states with retry option
   - Empty states with helpful messages
7. Add accessibility attributes (aria-labels, roles)
8. Include JSDoc comments for props and complex logic
9. Follow component composition patterns
10. Consider performance (memo, useMemo, useCallback where appropriate)

{{codeContext}}`,
      },
    ],
    example: `// Example: Button component
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export function Button({ label, onClick, variant = 'primary', disabled }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={\`px-4 py-2 rounded \${variant === 'primary' ? 'bg-blue-500' : 'bg-gray-500'}\`}
    >
      {label}
    </button>
  );
}`,
    isBuiltIn: true,
    createdAt: new Date('2024-01-01'),
    usageCount: 0,
  },
  {
    id: 'fix-bug',
    name: 'Fix Bug',
    description: 'Diagnose and fix a bug based on error message',
    category: 'bugfix',
    tags: ['bug', 'fix', 'debug', 'error'],
    template: `Fix the following bug in {{filename}}.

Error Message:
\`\`\`
{{errorMessage}}
\`\`\`

{{codeContext}}

Instructions:
1. Analyze the error and identify the root cause
2. Explain why this error occurs
3. Provide the corrected code
4. Explain the fix

Use {{language}} with proper error handling.`,
    variables: [
      COMMON_VARIABLES.filename,
      COMMON_VARIABLES.errorMessage,
      COMMON_VARIABLES.codeContext,
      COMMON_VARIABLES.language,
    ],
    variants: [
      {
        tier: 'fast',
        content: `Fix bug in {{filename}}:
\`\`\`
{{errorMessage}}
\`\`\`
{{codeContext}}
Provide corrected code.`,
      },
    ],
    isBuiltIn: true,
    createdAt: new Date('2024-01-01'),
    usageCount: 0,
  },
  {
    id: 'add-feature',
    name: 'Add Feature',
    description: 'Add a new feature to existing code',
    category: 'feature',
    tags: ['feature', 'implement', 'add'],
    template: `Add the following feature to {{filename}}.

Feature Description:
{{description}}

{{features}}

{{codeContext}}

Requirements:
- Integrate seamlessly with existing code
- Follow existing code patterns and conventions
- Use {{language}} with proper types
- Add error handling
- Consider edge cases`,
    variables: [
      COMMON_VARIABLES.filename,
      COMMON_VARIABLES.description,
      COMMON_VARIABLES.features,
      COMMON_VARIABLES.codeContext,
      COMMON_VARIABLES.language,
    ],
    isBuiltIn: true,
    createdAt: new Date('2024-01-01'),
    usageCount: 0,
  },
  {
    id: 'refactor',
    name: 'Refactor',
    description: 'Refactor code for better quality and maintainability',
    category: 'refactor',
    tags: ['refactor', 'clean', 'improve', 'optimize'],
    template: `Refactor the following code in {{filename}}.

Goals:
{{description}}

{{codeContext}}

Refactoring Guidelines:
- Improve code readability and maintainability
- Extract reusable functions where appropriate
- Apply SOLID principles
- Reduce complexity and duplication
- Maintain backward compatibility
- Use {{language}} best practices
- Add or improve type definitions
- Keep the same functionality`,
    variables: [
      COMMON_VARIABLES.filename,
      COMMON_VARIABLES.description,
      COMMON_VARIABLES.codeContext,
      COMMON_VARIABLES.language,
    ],
    variants: [
      {
        tier: 'fast',
        content: `Refactor {{filename}}:
{{description}}
{{codeContext}}
Improve readability, reduce duplication, maintain functionality.`,
      },
    ],
    isBuiltIn: true,
    createdAt: new Date('2024-01-01'),
    usageCount: 0,
  },
  {
    id: 'write-tests',
    name: 'Write Tests',
    description: 'Write unit tests for existing code',
    category: 'testing',
    tags: ['test', 'testing', 'unit', 'jest', 'vitest'],
    template: `Write unit tests for the code in {{filename}}.

{{codeContext}}

Testing Requirements:
- Use {{testFramework}} as the testing framework
- Write tests using {{language}}
- Cover all exported functions/components
- Include edge cases and error scenarios
- Use descriptive test names
- Mock external dependencies
- Aim for high code coverage
- Follow AAA pattern (Arrange, Act, Assert)`,
    variables: [
      COMMON_VARIABLES.filename,
      COMMON_VARIABLES.codeContext,
      COMMON_VARIABLES.testFramework,
      COMMON_VARIABLES.language,
    ],
    example: `// Example test structure
import { describe, it, expect, vi } from 'vitest';
import { myFunction } from './myFile';

describe('myFunction', () => {
  it('should return expected result for valid input', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should throw for invalid input', () => {
    expect(() => myFunction(null)).toThrow();
  });
});`,
    isBuiltIn: true,
    createdAt: new Date('2024-01-01'),
    usageCount: 0,
  },
  {
    id: 'add-documentation',
    name: 'Add Documentation',
    description: 'Add comprehensive documentation to code',
    category: 'documentation',
    tags: ['docs', 'documentation', 'comments', 'jsdoc'],
    template: `Add documentation to the code in {{filename}}.

{{codeContext}}

Documentation Requirements:
- Add JSDoc/TSDoc comments to all exported items
- Include @param, @returns, @throws, and @example tags
- Document complex logic with inline comments
- Add type descriptions where helpful
- Keep documentation concise but complete
- Use {{language}} documentation conventions`,
    variables: [
      COMMON_VARIABLES.filename,
      COMMON_VARIABLES.codeContext,
      COMMON_VARIABLES.language,
    ],
    example: `/**
 * Calculates the total price including tax.
 *
 * @param basePrice - The base price before tax
 * @param taxRate - The tax rate as a decimal (e.g., 0.1 for 10%)
 * @returns The total price including tax
 * @throws {Error} If basePrice is negative
 *
 * @example
 * \`\`\`ts
 * const total = calculateTotal(100, 0.1);
 * console.log(total); // 110
 * \`\`\`
 */
function calculateTotal(basePrice: number, taxRate: number): number {
  if (basePrice < 0) throw new Error('Price cannot be negative');
  return basePrice * (1 + taxRate);
}`,
    isBuiltIn: true,
    createdAt: new Date('2024-01-01'),
    usageCount: 0,
  },
];

// ============================================
// Common Prompt Parts
// ============================================

/** Reusable prompt parts for composition */
export const PROMPT_PARTS: Record<string, PromptPart> = {
  context: {
    id: 'context',
    name: 'Context',
    content: `## Context
{{codeContext}}`,
    description: 'Adds code context section',
    order: 0,
    optional: true,
  },
  instructions: {
    id: 'instructions',
    name: 'Instructions',
    content: `## Instructions
{{description}}`,
    description: 'Main instructions section',
    order: 10,
    optional: false,
  },
  examples: {
    id: 'examples',
    name: 'Examples',
    content: `## Examples
Provide examples showing the expected input/output or behavior.`,
    description: 'Examples section for few-shot learning',
    order: 20,
    optional: true,
  },
  constraints: {
    id: 'constraints',
    name: 'Constraints',
    content: `## Constraints
- Follow existing code patterns
- Use {{language}} with proper types
- Handle errors gracefully
- Consider performance implications`,
    description: 'Constraints and requirements section',
    order: 30,
    optional: true,
  },
  output: {
    id: 'output',
    name: 'Output Format',
    content: `## Output Format
Provide the complete, working code without placeholders or TODOs.`,
    description: 'Expected output format section',
    order: 40,
    optional: true,
  },
  reasoning: {
    id: 'reasoning',
    name: 'Reasoning',
    content: `## Approach
Before implementing, briefly explain your approach and any trade-offs.`,
    description: 'Asks for reasoning before implementation',
    order: 5,
    optional: true,
  },
};

// ============================================
// Template Helpers
// ============================================

/**
 * Get a built-in template by ID
 */
export function getBuiltInTemplate(id: string): PromptTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get all built-in templates
 */
export function getAllBuiltInTemplates(): PromptTemplate[] {
  return [...BUILT_IN_TEMPLATES];
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: PromptCategory): PromptTemplate[] {
  return BUILT_IN_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Search templates by query
 */
export function searchTemplates(query: string): PromptTemplate[] {
  const lowerQuery = query.toLowerCase();
  return BUILT_IN_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Create a quick prompt without using a template
 */
export function createQuickPrompt(
  instruction: string,
  options: {
    context?: string;
    language?: string;
    constraints?: string[];
  } = {}
): string {
  let prompt = instruction;

  if (options.context) {
    prompt = `## Context\n${options.context}\n\n${prompt}`;
  }

  if (options.language) {
    prompt += `\n\nUse ${options.language}.`;
  }

  if (options.constraints && options.constraints.length > 0) {
    prompt += `\n\nConstraints:\n${options.constraints.map((c) => `- ${c}`).join('\n')}`;
  }

  return prompt;
}

/**
 * Combine multiple prompts with a separator
 */
export function combinePrompts(prompts: string[], separator: string = '\n\n---\n\n'): string {
  return prompts.filter(Boolean).join(separator);
}

/**
 * Create a custom template
 */
export function createTemplate(
  params: Omit<PromptTemplate, 'id' | 'isBuiltIn' | 'createdAt' | 'usageCount'>
): PromptTemplate {
  return {
    ...params,
    id: `custom-${Date.now()}`,
    isBuiltIn: false,
    createdAt: new Date(),
    usageCount: 0,
  };
}

/**
 * Validate a template has all required variables defined
 */
export function validateTemplate(template: PromptTemplate): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const usedVars = extractVariables(template.template);
  const definedVars = template.variables.map((v) => v.name);

  // Check for undefined variables
  for (const varName of usedVars) {
    if (!definedVars.includes(varName) && !Object.keys(COMMON_VARIABLES).includes(varName)) {
      errors.push(`Variable {{${varName}}} is used but not defined`);
    }
  }

  // Check for unused variable definitions
  for (const varDef of template.variables) {
    if (!usedVars.includes(varDef.name)) {
      errors.push(`Variable {{${varDef.name}}} is defined but not used`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
