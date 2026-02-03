/**
 * Meta-Prompt Generator System
 *
 * Generates optimized system prompts from task descriptions using meta-prompting techniques.
 * Inspired by vscode-ai-toolkit's prompt-generator pattern.
 *
 * This module provides functions to take a task description and transform it into
 * a well-structured, optimized system prompt following best practices for LLM prompting.
 */

// ============================================
// Types
// ============================================

/** Best practice categories for prompt optimization */
export type BestPractice =
  | 'understand-task'
  | 'minimal-changes'
  | 'reasoning-before-conclusions'
  | 'examples-with-placeholders'
  | 'clarity-conciseness'
  | 'proper-formatting'
  | 'constants-inclusion'
  | 'output-format'
  | 'preserve-user-content'
  | 'structured-thinking'
  | 'error-handling'
  | 'context-awareness';

/** Configuration for prompt generation */
export interface MetaPromptConfig {
  /** Which best practices to apply */
  practices?: BestPractice[];
  /** Include examples in the output */
  includeExamples?: boolean;
  /** Number of examples to include (1-3) */
  exampleCount?: 1 | 2 | 3;
  /** Desired output format */
  outputFormat?: 'text' | 'json' | 'markdown' | 'code';
  /** Maximum length guidance (short, medium, long) */
  lengthGuidance?: 'short' | 'medium' | 'long';
  /** Whether to include a reasoning section */
  includeReasoning?: boolean;
  /** Whether to include notes/edge cases section */
  includeNotes?: boolean;
  /** Whether to include steps breakdown */
  includeSteps?: boolean;
  /** Custom constants to include */
  constants?: Record<string, string>;
  /** Domain-specific context (e.g., 'web-development', 'data-analysis') */
  domain?: string;
  /** Existing prompt to improve (for minimal changes mode) */
  existingPrompt?: string;
}

/** Result of meta-prompt generation */
export interface MetaPromptResult {
  /** The generated system prompt */
  prompt: string;
  /** Applied best practices */
  appliedPractices: BestPractice[];
  /** Estimated token count */
  estimatedTokens: number;
  /** Structure breakdown */
  structure: {
    hasInstruction: boolean;
    hasDetails: boolean;
    hasSteps: boolean;
    hasOutputFormat: boolean;
    hasExamples: boolean;
    hasNotes: boolean;
  };
  /** Warnings or suggestions */
  suggestions: string[];
}

/** Example format for few-shot learning */
export interface PromptExample {
  input: string;
  output: string;
  explanation?: string;
}

// ============================================
// Constants
// ============================================

/** All available best practices */
export const ALL_BEST_PRACTICES: BestPractice[] = [
  'understand-task',
  'minimal-changes',
  'reasoning-before-conclusions',
  'examples-with-placeholders',
  'clarity-conciseness',
  'proper-formatting',
  'constants-inclusion',
  'output-format',
  'preserve-user-content',
  'structured-thinking',
  'error-handling',
  'context-awareness',
];

/** Default best practices to apply */
export const DEFAULT_BEST_PRACTICES: BestPractice[] = [
  'understand-task',
  'reasoning-before-conclusions',
  'clarity-conciseness',
  'proper-formatting',
  'output-format',
  'structured-thinking',
];

/** Best practice descriptions */
const PRACTICE_DESCRIPTIONS: Record<BestPractice, string> = {
  'understand-task': 'Grasp the main objective, goals, requirements, constraints, and expected output',
  'minimal-changes': 'For existing prompts, improve only if simple; for complex prompts, enhance clarity without altering structure',
  'reasoning-before-conclusions': 'Encourage reasoning steps before conclusions; never start with conclusions',
  'examples-with-placeholders': 'Include high-quality examples using [placeholders] for complex elements',
  'clarity-conciseness': 'Use clear, specific language; avoid unnecessary instructions or bland statements',
  'proper-formatting': 'Use markdown features for readability; avoid code blocks unless specifically requested',
  'constants-inclusion': 'Include constants like guides, rubrics, and examples that are not susceptible to injection',
  'output-format': 'Explicitly specify the output format including length and syntax',
  'preserve-user-content': 'Preserve extensive guidelines or examples from input; break down vague items into sub-steps',
  'structured-thinking': 'Organize the prompt with clear sections and logical flow',
  'error-handling': 'Include guidance for handling edge cases and errors gracefully',
  'context-awareness': 'Consider the context in which the prompt will be used and adapt accordingly',
};

/** Output format specifications */
const OUTPUT_FORMAT_SPECS: Record<string, string> = {
  text: 'Provide your response as clear, well-structured text. Use paragraphs for organization.',
  json: 'Respond with valid JSON. Do not wrap in code blocks unless specifically requested. Ensure all keys use camelCase.',
  markdown: 'Format your response using Markdown. Use headers, lists, and emphasis appropriately.',
  code: 'Provide complete, working code. Include necessary imports and handle edge cases. Use appropriate comments.',
};

/** Length guidance specifications */
const LENGTH_SPECS: Record<string, string> = {
  short: 'Be concise. Aim for 1-2 paragraphs or equivalent.',
  medium: 'Provide moderate detail. Aim for 3-5 paragraphs or equivalent.',
  long: 'Be comprehensive and thorough. Include all relevant details and explanations.',
};

/** Domain-specific context additions */
const DOMAIN_CONTEXTS: Record<string, string> = {
  'web-development': `
Consider:
- Modern web standards and accessibility
- Responsive design principles
- Security best practices (XSS, CSRF prevention)
- Performance optimization
- Browser compatibility`,

  'data-analysis': `
Consider:
- Data validation and cleaning
- Statistical accuracy
- Visualization best practices
- Handling missing or anomalous data
- Reproducibility of analysis`,

  'api-design': `
Consider:
- RESTful principles or GraphQL conventions
- Proper HTTP status codes
- Request/response validation
- Rate limiting and pagination
- API versioning`,

  'testing': `
Consider:
- Test coverage and edge cases
- Mocking and stubbing dependencies
- Test isolation and determinism
- Meaningful assertions
- Test performance`,

  'documentation': `
Consider:
- Audience-appropriate language
- Clear examples and use cases
- Consistent terminology
- Logical organization
- Keeping documentation up to date`,
};

// ============================================
// Core Functions
// ============================================

/**
 * Generate an optimized system prompt from a task description
 *
 * @param taskDescription - The task to create a prompt for
 * @param config - Optional configuration for prompt generation
 * @returns MetaPromptResult with the generated prompt and metadata
 *
 * @example
 * ```ts
 * const result = generateMetaPrompt(
 *   'Create a React component that displays a user profile',
 *   { outputFormat: 'code', domain: 'web-development' }
 * );
 * console.log(result.prompt);
 * ```
 */
export function generateMetaPrompt(
  taskDescription: string,
  config: MetaPromptConfig = {}
): MetaPromptResult {
  const {
    practices = DEFAULT_BEST_PRACTICES,
    includeExamples = false,
    exampleCount = 1,
    outputFormat = 'text',
    lengthGuidance = 'medium',
    includeReasoning = true,
    includeNotes = false,
    includeSteps = false,
    constants = {},
    domain,
    existingPrompt,
  } = config;

  const suggestions: string[] = [];
  const appliedPractices: BestPractice[] = [];
  const sections: string[] = [];

  // 1. Understand the task (extract key components)
  const taskAnalysis = analyzeTask(taskDescription);
  if (practices.includes('understand-task')) {
    appliedPractices.push('understand-task');
  }

  // 2. Handle existing prompt (minimal changes mode)
  if (existingPrompt && practices.includes('minimal-changes')) {
    appliedPractices.push('minimal-changes');
    if (isSimplePrompt(existingPrompt)) {
      // For simple prompts, we can enhance more
      taskDescription = enhanceSimplePrompt(existingPrompt, taskDescription);
    } else {
      // For complex prompts, preserve structure
      suggestions.push('Complex existing prompt detected - preserving structure while adding clarity');
      return enhanceComplexPrompt(existingPrompt, config, suggestions);
    }
  }

  // 3. Build the main instruction (first line)
  const mainInstruction = buildMainInstruction(taskDescription, taskAnalysis);
  sections.push(mainInstruction);

  // 4. Add details section
  if (taskAnalysis.hasDetails) {
    sections.push(buildDetailsSection(taskAnalysis));
  }

  // 5. Add domain context
  if (domain && DOMAIN_CONTEXTS[domain]) {
    if (practices.includes('context-awareness')) {
      appliedPractices.push('context-awareness');
    }
    sections.push(DOMAIN_CONTEXTS[domain].trim());
  }

  // 6. Add reasoning section
  if (includeReasoning && practices.includes('reasoning-before-conclusions')) {
    appliedPractices.push('reasoning-before-conclusions');
    sections.push(buildReasoningSection());
  }

  // 7. Add steps section
  if (includeSteps || taskAnalysis.isComplex) {
    sections.push(buildStepsSection(taskAnalysis));
  }

  // 8. Add constants
  if (Object.keys(constants).length > 0 && practices.includes('constants-inclusion')) {
    appliedPractices.push('constants-inclusion');
    sections.push(buildConstantsSection(constants));
  }

  // 9. Add output format section
  if (practices.includes('output-format')) {
    appliedPractices.push('output-format');
    sections.push(buildOutputFormatSection(outputFormat, lengthGuidance));
  }

  // 10. Add examples section
  if (includeExamples && practices.includes('examples-with-placeholders')) {
    appliedPractices.push('examples-with-placeholders');
    sections.push(buildExamplesSection(taskAnalysis, exampleCount));
  }

  // 11. Add notes section
  if (includeNotes) {
    sections.push(buildNotesSection(taskAnalysis));
  }

  // Apply clarity and conciseness
  if (practices.includes('clarity-conciseness')) {
    appliedPractices.push('clarity-conciseness');
  }

  // Apply proper formatting
  if (practices.includes('proper-formatting')) {
    appliedPractices.push('proper-formatting');
  }

  // Build final prompt
  const prompt = sections.filter(Boolean).join('\n\n');

  // Estimate tokens (~4 chars per token)
  const estimatedTokens = Math.ceil(prompt.length / 4);

  // Add suggestions based on analysis
  if (estimatedTokens > 2000) {
    suggestions.push('Prompt is lengthy. Consider condensing for faster model response.');
  }
  if (!includeExamples && taskAnalysis.isComplex) {
    suggestions.push('Complex task detected. Consider adding examples for better results.');
  }
  if (!domain && taskAnalysis.detectedDomain) {
    suggestions.push(`Detected domain: ${taskAnalysis.detectedDomain}. Consider setting domain for specialized guidance.`);
  }

  return {
    prompt,
    appliedPractices,
    estimatedTokens,
    structure: {
      hasInstruction: true,
      hasDetails: taskAnalysis.hasDetails,
      hasSteps: includeSteps || taskAnalysis.isComplex,
      hasOutputFormat: practices.includes('output-format'),
      hasExamples: includeExamples,
      hasNotes: includeNotes,
    },
    suggestions,
  };
}

/**
 * Generate a quick system prompt with sensible defaults
 *
 * @param taskDescription - The task to create a prompt for
 * @returns The generated system prompt string
 */
export function generateQuickPrompt(taskDescription: string): string {
  const result = generateMetaPrompt(taskDescription, {
    practices: ['understand-task', 'clarity-conciseness', 'output-format'],
    includeReasoning: false,
    includeSteps: false,
    lengthGuidance: 'short',
  });
  return result.prompt;
}

/**
 * Generate a comprehensive system prompt with all best practices
 *
 * @param taskDescription - The task to create a prompt for
 * @param domain - Optional domain for specialized context
 * @returns The generated system prompt string
 */
export function generateComprehensivePrompt(
  taskDescription: string,
  domain?: string
): string {
  const result = generateMetaPrompt(taskDescription, {
    practices: ALL_BEST_PRACTICES,
    includeExamples: true,
    exampleCount: 2,
    includeReasoning: true,
    includeNotes: true,
    includeSteps: true,
    domain,
  });
  return result.prompt;
}

/**
 * Improve an existing prompt using meta-prompting best practices
 *
 * @param existingPrompt - The prompt to improve
 * @param improvements - Optional specific improvements to make
 * @returns The improved prompt
 */
export function improveExistingPrompt(
  existingPrompt: string,
  improvements?: {
    addExamples?: boolean;
    addSteps?: boolean;
    addOutputFormat?: boolean;
    addReasoning?: boolean;
    domain?: string;
  }
): string {
  const result = generateMetaPrompt(existingPrompt, {
    existingPrompt,
    practices: ['minimal-changes', 'clarity-conciseness', 'proper-formatting'],
    includeExamples: improvements?.addExamples,
    includeSteps: improvements?.addSteps,
    includeReasoning: improvements?.addReasoning,
    domain: improvements?.domain,
  });
  return result.prompt;
}

// ============================================
// Helper Functions
// ============================================

interface TaskAnalysis {
  objective: string;
  requirements: string[];
  constraints: string[];
  expectedOutput: string;
  isComplex: boolean;
  hasDetails: boolean;
  detectedDomain?: string;
  keywords: string[];
}

function analyzeTask(taskDescription: string): TaskAnalysis {
  const words = taskDescription.toLowerCase();
  const keywords: string[] = [];

  // Extract common keywords
  const keywordPatterns = [
    'create', 'build', 'implement', 'design', 'develop',
    'fix', 'debug', 'resolve', 'update', 'modify',
    'analyze', 'evaluate', 'review', 'test', 'validate',
    'document', 'explain', 'describe', 'summarize',
    'optimize', 'improve', 'enhance', 'refactor',
  ];

  for (const pattern of keywordPatterns) {
    if (words.includes(pattern)) {
      keywords.push(pattern);
    }
  }

  // Detect domain
  let detectedDomain: string | undefined;
  if (words.includes('react') || words.includes('component') || words.includes('css') || words.includes('html')) {
    detectedDomain = 'web-development';
  } else if (words.includes('api') || words.includes('endpoint') || words.includes('rest')) {
    detectedDomain = 'api-design';
  } else if (words.includes('test') || words.includes('spec') || words.includes('assert')) {
    detectedDomain = 'testing';
  } else if (words.includes('data') || words.includes('analysis') || words.includes('chart')) {
    detectedDomain = 'data-analysis';
  } else if (words.includes('document') || words.includes('readme') || words.includes('guide')) {
    detectedDomain = 'documentation';
  }

  // Extract requirements (lines starting with - or numbers)
  const requirements: string[] = [];
  const requirementMatches = taskDescription.match(/[-*]\s+.+|^\d+\.\s+.+/gm);
  if (requirementMatches) {
    requirements.push(...requirementMatches.map((r) => r.replace(/^[-*\d.]\s*/, '').trim()));
  }

  // Complexity assessment
  const isComplex =
    taskDescription.length > 200 ||
    requirements.length > 3 ||
    taskDescription.includes('multiple') ||
    taskDescription.includes('complex') ||
    taskDescription.split(/[.!?]/).length > 3;

  // Extract main objective (first sentence or line)
  const objective = taskDescription.split(/[.!?\n]/)[0].trim();

  return {
    objective,
    requirements,
    constraints: [], // Could be extracted with more sophisticated parsing
    expectedOutput: extractExpectedOutput(taskDescription),
    isComplex,
    hasDetails: requirements.length > 0 || taskDescription.length > 100,
    detectedDomain,
    keywords,
  };
}

function extractExpectedOutput(taskDescription: string): string {
  const outputPatterns = [
    /output\s*:?\s*(.+?)(?:\.|$)/i,
    /return\s+(.+?)(?:\.|$)/i,
    /produce\s+(.+?)(?:\.|$)/i,
    /generate\s+(.+?)(?:\.|$)/i,
  ];

  for (const pattern of outputPatterns) {
    const match = taskDescription.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return 'the requested result';
}

function isSimplePrompt(prompt: string): boolean {
  return (
    prompt.length < 300 &&
    !prompt.includes('#') &&
    prompt.split('\n').length < 10
  );
}

function enhanceSimplePrompt(existingPrompt: string, additionalContext: string): string {
  return `${existingPrompt}\n\nAdditional context: ${additionalContext}`;
}

function enhanceComplexPrompt(
  existingPrompt: string,
  config: MetaPromptConfig,
  suggestions: string[]
): MetaPromptResult {
  // For complex prompts, we preserve structure and only add missing elements
  let enhanced = existingPrompt;

  // Add output format if missing
  if (!existingPrompt.includes('# Output') && config.outputFormat) {
    enhanced += `\n\n# Output Format\n${OUTPUT_FORMAT_SPECS[config.outputFormat]}`;
  }

  return {
    prompt: enhanced,
    appliedPractices: ['minimal-changes', 'preserve-user-content'],
    estimatedTokens: Math.ceil(enhanced.length / 4),
    structure: {
      hasInstruction: true,
      hasDetails: true,
      hasSteps: existingPrompt.includes('# Steps') || existingPrompt.includes('## Steps'),
      hasOutputFormat: existingPrompt.includes('Output'),
      hasExamples: existingPrompt.includes('Example'),
      hasNotes: existingPrompt.includes('Note'),
    },
    suggestions,
  };
}

function buildMainInstruction(taskDescription: string, analysis: TaskAnalysis): string {
  // Clean and format the main instruction
  let instruction = analysis.objective;

  // Ensure it starts with a verb
  const verbStarters = ['Create', 'Build', 'Implement', 'Design', 'Develop', 'Fix', 'Analyze', 'Generate', 'Write', 'Provide'];
  const startsWithVerb = verbStarters.some((v) =>
    instruction.toLowerCase().startsWith(v.toLowerCase())
  );

  if (!startsWithVerb) {
    // Infer action from keywords
    if (analysis.keywords.includes('create') || analysis.keywords.includes('build')) {
      instruction = `Create ${instruction}`;
    } else if (analysis.keywords.includes('fix') || analysis.keywords.includes('debug')) {
      instruction = `Fix ${instruction}`;
    } else if (analysis.keywords.includes('analyze') || analysis.keywords.includes('evaluate')) {
      instruction = `Analyze ${instruction}`;
    } else {
      instruction = `Complete the following: ${instruction}`;
    }
  }

  return instruction.charAt(0).toUpperCase() + instruction.slice(1);
}

function buildDetailsSection(analysis: TaskAnalysis): string {
  const details: string[] = [];

  if (analysis.requirements.length > 0) {
    details.push('Requirements:');
    for (const req of analysis.requirements) {
      details.push(`- ${req}`);
    }
  }

  if (analysis.constraints.length > 0) {
    details.push('\nConstraints:');
    for (const constraint of analysis.constraints) {
      details.push(`- ${constraint}`);
    }
  }

  return details.join('\n');
}

function buildReasoningSection(): string {
  return `# Approach

Before providing your response, briefly consider:
1. What is the core problem or goal?
2. What are the key considerations or trade-offs?
3. What approach will best achieve the objective?

Then provide your solution.`;
}

function buildStepsSection(analysis: TaskAnalysis): string {
  const steps = [
    '# Steps',
    '',
  ];

  if (analysis.requirements.length > 0) {
    // Use requirements as steps if available
    analysis.requirements.forEach((req, i) => {
      steps.push(`${i + 1}. ${req}`);
    });
  } else {
    // Generate generic steps based on task type
    if (analysis.keywords.includes('create') || analysis.keywords.includes('build')) {
      steps.push('1. Understand the requirements and constraints');
      steps.push('2. Plan the structure and components');
      steps.push('3. Implement the solution');
      steps.push('4. Validate the result meets all requirements');
    } else if (analysis.keywords.includes('fix') || analysis.keywords.includes('debug')) {
      steps.push('1. Identify the root cause of the issue');
      steps.push('2. Determine the appropriate fix');
      steps.push('3. Apply the fix');
      steps.push('4. Verify the issue is resolved');
    } else if (analysis.keywords.includes('analyze') || analysis.keywords.includes('evaluate')) {
      steps.push('1. Review the subject matter thoroughly');
      steps.push('2. Identify key findings and patterns');
      steps.push('3. Draw conclusions based on evidence');
      steps.push('4. Provide recommendations if applicable');
    } else {
      steps.push('1. Understand the task requirements');
      steps.push('2. Plan your approach');
      steps.push('3. Execute the task');
      steps.push('4. Review and validate the output');
    }
  }

  return steps.join('\n');
}

function buildConstantsSection(constants: Record<string, string>): string {
  const lines = ['# Reference'];

  for (const [key, value] of Object.entries(constants)) {
    lines.push(`\n## ${key}`);
    lines.push(value);
  }

  return lines.join('\n');
}

function buildOutputFormatSection(format: string, length: string): string {
  const lines = [
    '# Output Format',
    '',
    OUTPUT_FORMAT_SPECS[format] || OUTPUT_FORMAT_SPECS.text,
    '',
    LENGTH_SPECS[length] || LENGTH_SPECS.medium,
  ];

  return lines.join('\n');
}

function buildExamplesSection(analysis: TaskAnalysis, count: number): string {
  const lines = ['# Examples', ''];

  // Generate placeholder examples based on task type
  for (let i = 0; i < count; i++) {
    lines.push(`**Example ${i + 1}:**`);
    lines.push('');
    lines.push('Input: [describe input scenario here]');
    lines.push('');
    lines.push('Output: [expected output for this scenario]');
    lines.push('');
    if (i < count - 1) {
      lines.push('---');
      lines.push('');
    }
  }

  lines.push('');
  lines.push('(Note: Replace placeholders with actual examples relevant to your use case.)');

  return lines.join('\n');
}

function buildNotesSection(analysis: TaskAnalysis): string {
  const notes = ['# Notes', ''];

  if (analysis.isComplex) {
    notes.push('- This is a complex task. Break it down into smaller steps if needed.');
  }

  notes.push('- Handle edge cases gracefully.');
  notes.push('- If uncertain about requirements, make reasonable assumptions and note them.');
  notes.push('- Prioritize clarity and maintainability in your response.');

  return notes.join('\n');
}

// ============================================
// Specialized Generators
// ============================================

/**
 * Generate a code review prompt
 */
export function generateCodeReviewPrompt(options: {
  language?: string;
  focusAreas?: string[];
  codeContext?: string;
}): string {
  const { language = 'TypeScript', focusAreas = [], codeContext } = options;

  return generateMetaPrompt(
    `Review ${language} code for quality, correctness, and best practices`,
    {
      domain: 'web-development',
      includeSteps: true,
      outputFormat: 'markdown',
      constants: {
        'Focus Areas': focusAreas.length > 0
          ? focusAreas.map((a) => `- ${a}`).join('\n')
          : '- Code quality\n- Performance\n- Security\n- Maintainability',
        ...(codeContext ? { 'Code Context': codeContext } : {}),
      },
    }
  ).prompt;
}

/**
 * Generate a bug fix prompt
 */
export function generateBugFixPrompt(options: {
  errorMessage: string;
  codeContext?: string;
  language?: string;
}): string {
  const { errorMessage, codeContext, language = 'TypeScript' } = options;

  return generateMetaPrompt(
    `Debug and fix a ${language} error: ${errorMessage}`,
    {
      includeReasoning: true,
      includeSteps: true,
      outputFormat: 'code',
      constants: {
        'Error Message': `\`\`\`\n${errorMessage}\n\`\`\``,
        ...(codeContext ? { 'Relevant Code': codeContext } : {}),
      },
    }
  ).prompt;
}

/**
 * Generate a feature implementation prompt
 */
export function generateFeaturePrompt(options: {
  featureDescription: string;
  requirements?: string[];
  techStack?: string;
}): string {
  const { featureDescription, requirements = [], techStack } = options;

  return generateMetaPrompt(
    `Implement a new feature: ${featureDescription}`,
    {
      domain: 'web-development',
      includeSteps: true,
      outputFormat: 'code',
      includeNotes: true,
      constants: {
        ...(requirements.length > 0 ? {
          'Requirements': requirements.map((r) => `- ${r}`).join('\n'),
        } : {}),
        ...(techStack ? { 'Tech Stack': techStack } : {}),
      },
    }
  ).prompt;
}

/**
 * Generate a refactoring prompt
 */
export function generateRefactoringPrompt(options: {
  goal: string;
  codeContext: string;
  preserveBehavior?: boolean;
}): string {
  const { goal, codeContext, preserveBehavior = true } = options;

  return generateMetaPrompt(
    `Refactor code to ${goal}${preserveBehavior ? ' while preserving existing behavior' : ''}`,
    {
      includeReasoning: true,
      includeSteps: true,
      outputFormat: 'code',
      constants: {
        'Original Code': codeContext,
        'Refactoring Goal': goal,
        ...(preserveBehavior ? {
          'Constraint': 'The refactored code must produce identical results to the original.',
        } : {}),
      },
    }
  ).prompt;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get the description of a best practice
 */
export function getBestPracticeDescription(practice: BestPractice): string {
  return PRACTICE_DESCRIPTIONS[practice] || 'Unknown practice';
}

/**
 * Get all best practice descriptions
 */
export function getAllBestPracticeDescriptions(): Record<BestPractice, string> {
  return { ...PRACTICE_DESCRIPTIONS };
}

/**
 * Validate a generated prompt for common issues
 */
export function validatePrompt(prompt: string): {
  isValid: boolean;
  issues: string[];
  score: number;
} {
  const issues: string[] = [];
  let score = 100;

  // Check for common issues
  if (prompt.length < 50) {
    issues.push('Prompt is too short');
    score -= 20;
  }

  if (prompt.length > 4000) {
    issues.push('Prompt is very long, consider condensing');
    score -= 10;
  }

  if (!prompt.match(/^[A-Z]/)) {
    issues.push('Prompt should start with a capital letter');
    score -= 5;
  }

  if (prompt.includes('please') || prompt.includes('Please')) {
    issues.push('Avoid using "please" - be direct');
    score -= 5;
  }

  if (prompt.includes('I want you to')) {
    issues.push('Avoid "I want you to" - state the task directly');
    score -= 5;
  }

  // Check for output format
  if (!prompt.toLowerCase().includes('format') && !prompt.toLowerCase().includes('output')) {
    issues.push('Consider adding output format specification');
    score -= 10;
  }

  return {
    isValid: issues.length === 0,
    issues,
    score: Math.max(0, score),
  };
}

/**
 * Estimate the complexity of a task description
 */
export function estimateTaskComplexity(taskDescription: string): 'simple' | 'moderate' | 'complex' {
  const analysis = analyzeTask(taskDescription);

  if (analysis.isComplex) {
    return 'complex';
  }

  if (analysis.requirements.length > 1 || taskDescription.length > 150) {
    return 'moderate';
  }

  return 'simple';
}
