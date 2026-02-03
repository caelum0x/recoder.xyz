/**
 * Test Data Generator
 * Generates realistic test data from prompt templates with statistical distribution analysis.
 * Based on vscode-ai-toolkit's test-data-generator.prompt pattern.
 */

import { createOpenRouterClient, type OpenRouterMessage } from './openrouter-client';
import type { Messages } from '~/lib/types/chat';

// Types for test data generation
export interface VariableExample {
  key: string;
  value: string;
}

export interface TestCase {
  id: string;
  variables: Record<string, string>;
  createdAt: Date;
  metadata?: {
    strategy?: string;
    templateId?: string;
    distributionAnalysis?: DistributionAnalysis;
  };
}

export interface DistributionAnalysis {
  variableName: string;
  characteristics: {
    avgLength: number;
    minLength: number;
    maxLength: number;
    format?: string;
    tone?: string;
    semanticCategory?: string;
  };
  patterns: string[];
}

export interface TestDataTemplate {
  id: string;
  name: string;
  promptTemplate: string;
  variables: string[];
  examples: VariableExample[][];
  description?: string;
  createdAt: Date;
}

export interface GenerationOptions {
  count?: number;
  temperature?: number;
  diversityFactor?: number;
  excludeSimilarTo?: TestCase[];
}

export interface GenerationResult {
  testCases: TestCase[];
  distributionAnalysis: DistributionAnalysis[];
  generationMetadata: {
    model: string;
    tokensUsed: number;
    generationTime: number;
    strategy: string;
  };
}

/**
 * Extract variable names from a Mustache-style template
 * Supports {{variable}} and {{{variable}}} syntax
 */
export function extractVariables(template: string): string[] {
  const variableRegex = /\{\{\{?([^}#/]+?)\}?\}\}/g;
  const variables = new Set<string>();

  let match;
  while ((match = variableRegex.exec(template)) !== null) {
    const varName = match[1].trim();
    // Filter out Mustache control syntax
    if (!varName.startsWith('#') && !varName.startsWith('/') && !varName.startsWith('^') && varName !== '.') {
      variables.add(varName);
    }
  }

  return Array.from(variables);
}

/**
 * Analyze the statistical distribution of example values for a variable
 */
export function analyzeDistribution(
  variableName: string,
  examples: string[]
): DistributionAnalysis {
  if (examples.length === 0) {
    return {
      variableName,
      characteristics: {
        avgLength: 0,
        minLength: 0,
        maxLength: 0,
      },
      patterns: [],
    };
  }

  const lengths = examples.map(e => e.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);

  // Detect format patterns
  const patterns: string[] = [];

  // Check for common patterns
  const hasUrls = examples.some(e => /https?:\/\//.test(e));
  const hasEmails = examples.some(e => /\S+@\S+\.\S+/.test(e));
  const hasNumbers = examples.some(e => /\d+/.test(e));
  const hasCode = examples.some(e => /[{}\[\]();]/.test(e) || /function|const|let|var|import|export/.test(e));
  const hasMarkdown = examples.some(e => /[#*`]/.test(e));
  const isMultiline = examples.some(e => e.includes('\n'));

  if (hasUrls) patterns.push('contains-urls');
  if (hasEmails) patterns.push('contains-emails');
  if (hasNumbers) patterns.push('contains-numbers');
  if (hasCode) patterns.push('contains-code');
  if (hasMarkdown) patterns.push('contains-markdown');
  if (isMultiline) patterns.push('multiline');

  // Detect tone
  let tone: string | undefined;
  const formalIndicators = ['please', 'kindly', 'regarding', 'pursuant'];
  const casualIndicators = ['hey', 'gonna', 'wanna', 'cool', 'awesome'];
  const technicalIndicators = ['api', 'function', 'parameter', 'implementation', 'algorithm'];

  const allText = examples.join(' ').toLowerCase();
  if (formalIndicators.some(w => allText.includes(w))) tone = 'formal';
  else if (casualIndicators.some(w => allText.includes(w))) tone = 'casual';
  else if (technicalIndicators.some(w => allText.includes(w))) tone = 'technical';

  // Detect format
  let format: string | undefined;
  if (examples.every(e => e.startsWith('{') && e.endsWith('}'))) format = 'json';
  else if (examples.every(e => e.startsWith('<') && e.endsWith('>'))) format = 'xml';
  else if (examples.every(e => /^\d+$/.test(e))) format = 'numeric';
  else if (examples.every(e => /^\d{4}-\d{2}-\d{2}/.test(e))) format = 'date';

  return {
    variableName,
    characteristics: {
      avgLength: Math.round(avgLength),
      minLength,
      maxLength,
      format,
      tone,
    },
    patterns,
  };
}

/**
 * Build the prompt for test data generation
 * Based on vscode-ai-toolkit's test-data-generator.prompt
 */
function buildGenerationPrompt(
  template: TestDataTemplate,
  options: GenerationOptions
): string {
  const { promptTemplate, variables, examples } = template;
  const count = options.count ?? 1;

  // Build examples section if available
  let examplesSection = '';
  if (examples.length > 0) {
    examplesSection = `
Here are the example test cases provided:
<examples>
${examples.map((exampleSet, i) => `
<example index="${i + 1}">
<variables>
${exampleSet.map(v => `<${v.key}>${v.value}</${v.key}>`).join('\n')}
</variables>
</example>
`).join('')}
</examples>
`;
  }

  // Analyze distributions if we have examples
  const distributionAnalyses = variables.map(varName => {
    const varExamples = examples
      .flatMap(ex => ex.filter(v => v.key === varName).map(v => v.value));
    return analyzeDistribution(varName, varExamples);
  });

  const distributionHints = distributionAnalyses
    .filter(d => d.characteristics.avgLength > 0)
    .map(d => {
      const hints: string[] = [];
      hints.push(`  - "${d.variableName}": avg length ~${d.characteristics.avgLength} chars`);
      if (d.characteristics.format) hints.push(`    format: ${d.characteristics.format}`);
      if (d.characteristics.tone) hints.push(`    tone: ${d.characteristics.tone}`);
      if (d.patterns.length > 0) hints.push(`    patterns: ${d.patterns.join(', ')}`);
      return hints.join('\n');
    })
    .join('\n');

  return `<Prompt Template>
${promptTemplate}
</Prompt Template>

Your job is to construct ${count} test case${count > 1 ? 's' : ''} for the prompt template above. This template contains "variables", which are placeholders to be filled in later. The variables are:

<variables>
${variables.join('\n')}
</variables>
${examplesSection}
First, in <planning> tags, do the following:

1. Summarize the prompt template. What is the goal of the user who created it?
2. For each variable in <variables>, carefully consider what a paradigmatic, realistic example of that variable would look like. Think about:
   - Who will be responsible "in prod" for supplying values (human end user? downloaded from a website? extracted from a database?)
   - Length, format, and tone in addition to semantic content
   - Use the examples provided to guide this exercise
   - The goal is to acquire a sense of the statistical distribution the examples are being drawn from
   - Your examples should be drawn from that same distribution, but sufficiently different from the provided examples that they provide additional signal
${distributionHints ? `
Based on example analysis:
${distributionHints}
` : ''}

Once you're done, output ${count} test case${count > 1 ? 's' : ''} for this prompt template with a full, complete value for each variable.

<planning>
1. Summary of the prompt template:
[Summary of the prompt template]
2. Consideration of variables:
[Describe what paradigmatic, realistic examples of the variables would look like]
</planning>

<test_cases>
${Array.from({ length: count }, (_, i) => `
<test_case index="${i + 1}">
<variables>
${variables.map(v => `<${v}>
[a full, complete, realistic value for the variable "${v}" that differs from provided examples]
</${v}>`).join('\n')}
</variables>
</test_case>
`).join('')}
</test_cases>`;
}

/**
 * Parse the LLM response to extract generated test cases
 */
function parseGenerationResponse(
  response: string,
  variables: string[],
  templateId: string
): TestCase[] {
  const testCases: TestCase[] = [];

  // Extract test_cases section
  const testCasesMatch = response.match(/<test_cases>([\s\S]*?)<\/test_cases>/);
  if (!testCasesMatch) {
    // Try to extract single variables section (for single test case)
    const variablesMatch = response.match(/<variables>([\s\S]*?)<\/variables>/g);
    if (variablesMatch) {
      for (const varSection of variablesMatch) {
        const vars: Record<string, string> = {};

        for (const varName of variables) {
          const varMatch = varSection.match(new RegExp(`<${varName}>([\\s\\S]*?)<\\/${varName}>`, 'i'));
          if (varMatch) {
            vars[varName] = varMatch[1].trim();
          }
        }

        if (Object.keys(vars).length > 0) {
          testCases.push({
            id: `tc_${Date.now()}_${testCases.length}`,
            variables: vars,
            createdAt: new Date(),
            metadata: {
              templateId,
              strategy: 'statistical-distribution',
            },
          });
        }
      }
    }
    return testCases;
  }

  const testCasesContent = testCasesMatch[1];

  // Extract individual test cases
  const testCaseMatches = testCasesContent.matchAll(/<test_case[^>]*>([\s\S]*?)<\/test_case>/g);

  for (const match of testCaseMatches) {
    const testCaseContent = match[1];
    const vars: Record<string, string> = {};

    for (const varName of variables) {
      const varMatch = testCaseContent.match(new RegExp(`<${varName}>([\\s\\S]*?)<\\/${varName}>`, 'i'));
      if (varMatch) {
        vars[varName] = varMatch[1].trim();
      }
    }

    if (Object.keys(vars).length > 0) {
      testCases.push({
        id: `tc_${Date.now()}_${testCases.length}`,
        variables: vars,
        createdAt: new Date(),
        metadata: {
          templateId,
          strategy: 'statistical-distribution',
        },
      });
    }
  }

  return testCases;
}

/**
 * Main function to generate test data from a template
 */
export async function generateTestData(
  template: TestDataTemplate,
  apiKey: string,
  options: GenerationOptions = {}
): Promise<GenerationResult> {
  const startTime = Date.now();
  const count = options.count ?? 1;

  // Create OpenRouter client
  const client = createOpenRouterClient(apiKey);

  // Build the generation prompt
  const prompt = buildGenerationPrompt(template, options);

  // Prepare messages
  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You are an expert test data generator. Your job is to create realistic, paradigmatic test cases that match the statistical distribution of provided examples while being sufficiently different to provide additional testing signal.

Key guidelines:
- Analyze the format, tone, length, and semantic patterns of examples
- Generate values that are realistic and could appear in production
- Ensure diversity - don't copy examples, create new valid instances
- Maintain consistency with detected patterns (URLs, code, dates, etc.)
- Consider edge cases that would stress-test the template`
    },
    {
      role: 'user',
      content: prompt
    }
  ];

  // Make the API call
  const response = await client.createChatCompletion({
    model: 'anthropic/claude-3-5-sonnet',
    messages,
    temperature: options.temperature ?? 0.8,
    max_tokens: 4000,
  });

  const responseText = response.choices[0]?.message?.content || '';
  const tokensUsed = response.usage?.total_tokens || 0;

  // Parse the response
  const testCases = parseGenerationResponse(responseText, template.variables, template.id);

  // Analyze distributions for all variables
  const distributionAnalysis = template.variables.map(varName => {
    const allExamples = [
      ...template.examples.flatMap(ex => ex.filter(v => v.key === varName).map(v => v.value)),
      ...testCases.map(tc => tc.variables[varName]).filter(Boolean)
    ];
    return analyzeDistribution(varName, allExamples);
  });

  return {
    testCases,
    distributionAnalysis,
    generationMetadata: {
      model: 'anthropic/claude-3-5-sonnet',
      tokensUsed,
      generationTime: Date.now() - startTime,
      strategy: 'statistical-distribution',
    },
  };
}

/**
 * Generate test data without API call (for templates with simple patterns)
 * Uses rule-based generation when examples provide clear patterns
 */
export function generateTestDataLocal(
  template: TestDataTemplate,
  options: GenerationOptions = {}
): TestCase[] {
  const count = options.count ?? 1;
  const testCases: TestCase[] = [];

  for (let i = 0; i < count; i++) {
    const vars: Record<string, string> = {};

    for (const varName of template.variables) {
      const varExamples = template.examples
        .flatMap(ex => ex.filter(v => v.key === varName).map(v => v.value));

      const analysis = analyzeDistribution(varName, varExamples);

      // Generate based on detected patterns
      if (analysis.characteristics.format === 'numeric') {
        vars[varName] = String(Math.floor(Math.random() * 1000) + 1);
      } else if (analysis.characteristics.format === 'date') {
        const date = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000);
        vars[varName] = date.toISOString().split('T')[0];
      } else if (varExamples.length > 0) {
        // Pick a random example and slightly modify it
        const baseExample = varExamples[Math.floor(Math.random() * varExamples.length)];
        vars[varName] = `${baseExample} (variant ${i + 1})`;
      } else {
        vars[varName] = `[Sample ${varName} value ${i + 1}]`;
      }
    }

    testCases.push({
      id: `tc_local_${Date.now()}_${i}`,
      variables: vars,
      createdAt: new Date(),
      metadata: {
        templateId: template.id,
        strategy: 'local-rule-based',
      },
    });
  }

  return testCases;
}

/**
 * Validate that a test case has all required variables
 */
export function validateTestCase(
  testCase: TestCase,
  template: TestDataTemplate
): { valid: boolean; missingVariables: string[] } {
  const missingVariables: string[] = [];

  for (const varName of template.variables) {
    if (!testCase.variables[varName] || testCase.variables[varName].trim() === '') {
      missingVariables.push(varName);
    }
  }

  return {
    valid: missingVariables.length === 0,
    missingVariables,
  };
}

/**
 * Apply a test case to a template, replacing variables with values
 */
export function applyTestCase(
  template: string,
  testCase: TestCase
): string {
  let result = template;

  for (const [key, value] of Object.entries(testCase.variables)) {
    // Replace {{{key}}} (unescaped) first
    result = result.replace(new RegExp(`\\{\\{\\{${key}\\}\\}\\}`, 'g'), value);
    // Then replace {{key}} (escaped in Mustache, but we treat as plain)
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return result;
}

/**
 * Create a new template from a prompt string
 */
export function createTemplate(
  name: string,
  promptTemplate: string,
  examples: VariableExample[][] = [],
  description?: string
): TestDataTemplate {
  const variables = extractVariables(promptTemplate);

  return {
    id: `template_${Date.now()}`,
    name,
    promptTemplate,
    variables,
    examples,
    description,
    createdAt: new Date(),
  };
}
