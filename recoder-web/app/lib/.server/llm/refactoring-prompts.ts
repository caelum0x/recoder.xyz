/**
 * Refactoring Prompt Templates
 *
 * Templates for AI-powered code improvement suggestions.
 * Based on Kilo Code's support-prompt.ts patterns.
 */

// =============================================================================
// Types
// =============================================================================

export type RefactoringType = 'improve' | 'simplify' | 'optimize' | 'document' | 'explain';

export interface RefactoringContext {
  filePath: string;
  selectedCode: string;
  lineStart?: number;
  lineEnd?: number;
  fullFileContent?: string;
  language?: string;
}

// =============================================================================
// Prompt Templates
// =============================================================================

export const REFACTORING_PROMPTS: Record<RefactoringType, string> = {
  improve: `Analyze the following code and suggest improvements for:

1. **Readability** - Better variable names, clearer logic flow
2. **Maintainability** - Extract functions, reduce complexity
3. **Best Practices** - Follow language conventions and patterns
4. **Error Handling** - Add proper error handling where missing

For each suggestion:
- Show the BEFORE code (with line numbers)
- Explain WHY it should change
- Show the AFTER code
- Rate impact: [LOW/MEDIUM/HIGH]

Focus on actionable changes that provide real value. Don't suggest trivial changes.`,

  simplify: `Analyze the following code and suggest ways to simplify it:

1. **Remove redundant code** - Eliminate duplicate logic
2. **Combine similar operations** - Merge related code
3. **Use built-in functions** - Replace manual implementations
4. **Reduce nesting depth** - Flatten conditionals where possible
5. **Extract complex conditions** - Named variables for readability

For each simplification:
- Show the current complex code
- Explain what makes it complex
- Show the simplified version
- Estimate lines of code reduction`,

  optimize: `Analyze the following code for performance improvements:

1. **Algorithm efficiency** - Identify O(n²) that could be O(n)
2. **Unnecessary iterations** - Find redundant loops
3. **Memory inefficiencies** - Spot unnecessary allocations
4. **Caching opportunities** - Where to memoize or cache
5. **Redundant computations** - Calculations that repeat

For each optimization:
- Current code with complexity analysis
- Why it's inefficient
- Optimized version with new complexity
- Expected performance improvement`,

  document: `Add documentation to the following code:

1. **JSDoc/TSDoc comments** - For all functions and methods
2. **Inline comments** - For complex logic blocks
3. **Type annotations** - Where types are implicit
4. **Examples** - Usage examples in function docs

Documentation style:
- Be concise but complete
- Explain the "why" not just the "what"
- Include @param and @returns
- Add @throws for error cases
- Include @example where helpful`,

  explain: `Explain the following code in detail:

1. **Purpose** - What does this code accomplish?
2. **Flow** - Step-by-step execution walkthrough
3. **Key concepts** - Important patterns or algorithms used
4. **Dependencies** - What this code relies on
5. **Side effects** - Any external state modifications

Format your explanation with:
- A brief summary (1-2 sentences)
- Detailed breakdown by section
- Any potential issues or improvements noted`,
};

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Format a refactoring prompt with context
 */
export function formatRefactoringPrompt(type: RefactoringType, context: RefactoringContext): string {
  const template = REFACTORING_PROMPTS[type] || REFACTORING_PROMPTS.improve;

  const lineInfo = context.lineStart ? ` (lines ${context.lineStart}-${context.lineEnd})` : '';
  const langHint = context.language ? context.language : detectLanguage(context.filePath);

  return `${template}

---

**File:** \`${context.filePath}\`${lineInfo}

**Code to analyze:**
\`\`\`${langHint}
${context.selectedCode}
\`\`\`

After analysis, provide your suggestions in a clear format. Then ask if I want to apply any of the changes using the str_replace or multi_apply_diff tools.`;
}

/**
 * Format a refactoring prompt for the current open file
 */
export function formatCurrentFilePrompt(type: RefactoringType): string {
  const basePrompts: Record<RefactoringType, string> = {
    improve: `Analyze the currently open file for code improvements.

First, use the readFile tool to read the current file, then:
1. Identify areas for improvement (readability, maintainability, best practices)
2. For each issue, show the BEFORE code with line numbers
3. Explain WHY it should change
4. Show the AFTER code
5. Rate impact: [LOW/MEDIUM/HIGH]

After analysis, ask if I want to apply any changes.`,

    simplify: `Simplify the currently open file.

First, use the readFile tool to read the current file, then:
1. Find redundant or complex code
2. Suggest simplifications with before/after examples
3. Estimate lines of code reduction

After analysis, ask if I want to apply any changes.`,

    optimize: `Optimize the currently open file for performance.

First, use the readFile tool to read the current file, then:
1. Analyze algorithm complexity
2. Find performance bottlenecks
3. Suggest optimizations with complexity analysis

After analysis, ask if I want to apply any changes.`,

    document: `Add documentation to the currently open file.

First, use the readFile tool to read the current file, then:
1. Identify undocumented functions and classes
2. Generate JSDoc/TSDoc comments
3. Add inline comments for complex logic

After analysis, apply the documentation changes.`,

    explain: `Explain the currently open file.

First, use the readFile tool to read the current file, then:
1. Summarize the file's purpose
2. Explain key functions and their roles
3. Describe the data flow and dependencies`,
  };

  return basePrompts[type] || basePrompts.improve;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Detect programming language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    vue: 'vue',
    svelte: 'svelte',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
  };

  return languageMap[ext] || '';
}

/**
 * Get refactoring type description
 */
export function getRefactoringDescription(type: RefactoringType): string {
  const descriptions: Record<RefactoringType, string> = {
    improve: 'General code improvements (readability, maintainability, best practices)',
    simplify: 'Reduce complexity and remove redundant code',
    optimize: 'Performance optimizations and algorithm improvements',
    document: 'Add JSDoc/TSDoc comments and inline documentation',
    explain: 'Detailed explanation of code functionality',
  };

  return descriptions[type] || descriptions.improve;
}
