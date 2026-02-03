/**
 * Response Quality Service
 * Scores AI responses on multiple dimensions to help users understand response quality.
 *
 * Features:
 * 1. Completeness scoring - Did the AI finish the task?
 * 2. Code quality scoring - Proper syntax, best practices?
 * 3. Relevance scoring - Does it address the user's request?
 * 4. Efficiency scoring - Concise without being incomplete?
 * 5. Issue detection - Truncation, placeholder code, missing imports
 * 6. Improvement suggestions
 */

import { detectLanguage, extractImports } from './code-context';

// ============================================================================
// Types
// ============================================================================

export type QualityDimension = 'completeness' | 'codeQuality' | 'relevance' | 'efficiency';

export interface DimensionScore {
  score: number; // 0-100
  weight: number; // 0-1
  issues: string[];
  suggestions: string[];
}

export interface QualityScores {
  completeness: DimensionScore;
  codeQuality: DimensionScore;
  relevance: DimensionScore;
  efficiency: DimensionScore;
}

export interface QualityIssue {
  type: 'truncation' | 'placeholder' | 'missing_import' | 'syntax_error' | 'incomplete_code' | 'verbose' | 'off_topic' | 'missing_explanation';
  severity: 'low' | 'medium' | 'high';
  message: string;
  location?: {
    line?: number;
    snippet?: string;
  };
}

export interface QualityResult {
  /** Overall quality score 0-100 */
  overallScore: number;
  /** Individual dimension scores */
  dimensions: QualityScores;
  /** Detected issues */
  issues: QualityIssue[];
  /** Improvement suggestions */
  suggestions: string[];
  /** Quality grade (A-F) */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Whether the response is considered acceptable */
  acceptable: boolean;
  /** Timestamp of evaluation */
  timestamp: number;
  /** Response metadata */
  metadata: {
    responseLength: number;
    codeBlockCount: number;
    hasExplanation: boolean;
    estimatedTokens: number;
  };
}

export interface QualityConfig {
  /** Minimum acceptable score (default: 60) */
  minAcceptableScore: number;
  /** Weight for each dimension (should sum to 1) */
  weights: {
    completeness: number;
    codeQuality: number;
    relevance: number;
    efficiency: number;
  };
  /** Strict mode enables more rigorous checks */
  strictMode: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_CONFIG: QualityConfig = {
  minAcceptableScore: 60,
  weights: {
    completeness: 0.35,
    codeQuality: 0.30,
    relevance: 0.25,
    efficiency: 0.10,
  },
  strictMode: false,
};

// Common placeholder patterns that indicate incomplete code
const PLACEHOLDER_PATTERNS = [
  /\/\/\s*TODO\s*:/gi,
  /\/\*\s*TODO\s*:/gi,
  /\/\/\s*\.\.\./g,
  /\/\/\s*add\s+(your|code|implementation|logic)\s+here/gi,
  /\/\/\s*implement\s+this/gi,
  /\/\/\s*fill\s+in/gi,
  /throw\s+new\s+Error\s*\(\s*['"]not\s+implemented['"]\s*\)/gi,
  /throw\s+new\s+Error\s*\(\s*['"]TODO['"]\s*\)/gi,
  /\{\s*\/\*\s*\.\.\.\s*\*\/\s*\}/g,
  /pass\s*#\s*TODO/gi, // Python
  /raise\s+NotImplementedError/gi, // Python
  /\.{3}\s*\/\//g, // Ellipsis followed by comment
  /\[\.\.\..*?\]/g, // [...something] placeholder
  /<\.\.\.>/g, // <...> placeholder
  /FIXME/gi,
  /XXX/gi,
  /your[_-]?api[_-]?key/gi,
  /your[_-]?secret/gi,
  /replace[_-]?with/gi,
  /example\.com/gi,
];

// Patterns that indicate truncated code
const TRUNCATION_PATTERNS = [
  /```\s*$/m, // Code block that ends abruptly
  /\.\.\.\s*$/m, // Ends with ellipsis
  /\/\/\s*continued\s*$/mi, // "continued" at end
  /\/\/\s*etc\.?\s*$/mi, // "etc" at end
  /\/\/\s*and\s+so\s+on\s*$/mi,
  /\/\/\s*more\s+code\s+here\s*$/mi,
  /\/\/\s*rest\s+of\s+/mi,
  /\/\/\s*similar\s+for\s+/mi,
  /{[^}]*$/m, // Unclosed brace at end
  /\([^)]*$/m, // Unclosed paren at end
  /\[[^\]]*$/m, // Unclosed bracket at end
];

// Keywords that indicate explanation content
const EXPLANATION_KEYWORDS = [
  'here\'s', 'here is', 'this code', 'this will', 'this creates',
  'let me', 'i\'ll', 'the following', 'note that', 'important',
  'explanation', 'key points', 'summary', 'changes made', 'what i did',
];

// ============================================================================
// Core Scoring Functions
// ============================================================================

/**
 * Evaluate the quality of an AI response
 */
export function evaluateResponse(
  response: string,
  userQuery: string,
  config: Partial<QualityConfig> = {}
): QualityResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];

  // Extract code blocks and text content
  const codeBlocks = extractCodeBlocks(response);
  const textContent = stripCodeBlocks(response);
  const hasExplanation = checkHasExplanation(textContent);

  // Score each dimension
  const completenessResult = scoreCompleteness(response, codeBlocks, issues, suggestions);
  const codeQualityResult = scoreCodeQuality(codeBlocks, issues, suggestions);
  const relevanceResult = scoreRelevance(response, userQuery, issues, suggestions);
  const efficiencyResult = scoreEfficiency(response, codeBlocks, textContent, issues, suggestions);

  // Build dimensions object
  const dimensions: QualityScores = {
    completeness: { ...completenessResult, weight: cfg.weights.completeness },
    codeQuality: { ...codeQualityResult, weight: cfg.weights.codeQuality },
    relevance: { ...relevanceResult, weight: cfg.weights.relevance },
    efficiency: { ...efficiencyResult, weight: cfg.weights.efficiency },
  };

  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    dimensions.completeness.score * cfg.weights.completeness +
    dimensions.codeQuality.score * cfg.weights.codeQuality +
    dimensions.relevance.score * cfg.weights.relevance +
    dimensions.efficiency.score * cfg.weights.efficiency
  );

  // Determine grade
  const grade = scoreToGrade(overallScore);

  // Estimate token count (rough approximation: ~4 chars per token)
  const estimatedTokens = Math.ceil(response.length / 4);

  return {
    overallScore,
    dimensions,
    issues,
    suggestions: deduplicateSuggestions(suggestions),
    grade,
    acceptable: overallScore >= cfg.minAcceptableScore,
    timestamp: Date.now(),
    metadata: {
      responseLength: response.length,
      codeBlockCount: codeBlocks.length,
      hasExplanation,
      estimatedTokens,
    },
  };
}

/**
 * Score completeness - Did the AI finish the task?
 */
function scoreCompleteness(
  response: string,
  codeBlocks: CodeBlock[],
  issues: QualityIssue[],
  suggestions: string[]
): Omit<DimensionScore, 'weight'> {
  let score = 100;
  const dimensionIssues: string[] = [];
  const dimensionSuggestions: string[] = [];

  // Check for truncation
  const truncationIssues = detectTruncation(response);
  if (truncationIssues.length > 0) {
    score -= 40;
    issues.push(...truncationIssues);
    dimensionIssues.push('Response appears truncated');
    dimensionSuggestions.push('Request the AI to complete the truncated code');
  }

  // Check for placeholder code
  const placeholderIssues = detectPlaceholders(response);
  if (placeholderIssues.length > 0) {
    score -= Math.min(30, placeholderIssues.length * 10);
    issues.push(...placeholderIssues);
    dimensionIssues.push(`Found ${placeholderIssues.length} placeholder(s)`);
    dimensionSuggestions.push('Ask the AI to provide complete implementation');
  }

  // Check for incomplete code structures
  if (codeBlocks.length > 0) {
    const incompleteBlocks = codeBlocks.filter(block => hasIncompleteStructure(block.code));
    if (incompleteBlocks.length > 0) {
      score -= 20;
      issues.push({
        type: 'incomplete_code',
        severity: 'high',
        message: `${incompleteBlocks.length} code block(s) have incomplete structures`,
      });
      dimensionIssues.push('Some code blocks are incomplete');
      dimensionSuggestions.push('Request missing parts of the code');
    }
  }

  // Very short responses are often incomplete
  if (response.length < 100 && codeBlocks.length === 0) {
    score -= 20;
    dimensionIssues.push('Response is very short');
    dimensionSuggestions.push('Ask for more detailed explanation or implementation');
  }

  suggestions.push(...dimensionSuggestions);
  return { score: Math.max(0, score), issues: dimensionIssues, suggestions: dimensionSuggestions };
}

/**
 * Score code quality - Proper syntax, best practices?
 */
function scoreCodeQuality(
  codeBlocks: CodeBlock[],
  issues: QualityIssue[],
  suggestions: string[]
): Omit<DimensionScore, 'weight'> {
  let score = 100;
  const dimensionIssues: string[] = [];
  const dimensionSuggestions: string[] = [];

  // If no code blocks, return neutral score
  if (codeBlocks.length === 0) {
    return { score: 85, issues: [], suggestions: [] };
  }

  for (const block of codeBlocks) {
    const language = block.language || detectLanguage(block.code);

    // Check for syntax issues
    const syntaxIssues = checkBasicSyntax(block.code, language);
    if (syntaxIssues.length > 0) {
      score -= Math.min(20, syntaxIssues.length * 5);
      dimensionIssues.push(...syntaxIssues.map(i => i.message));
      issues.push(...syntaxIssues.map(msg => ({
        type: 'syntax_error' as const,
        severity: 'medium' as const,
        message: typeof msg === 'string' ? msg : msg.message,
      })));
    }

    // Check for missing imports (JavaScript/TypeScript)
    if (['javascript', 'typescript', 'jsx', 'tsx'].includes(language)) {
      const importIssues = checkMissingImports(block.code);
      if (importIssues.length > 0) {
        score -= Math.min(15, importIssues.length * 5);
        issues.push(...importIssues);
        dimensionIssues.push('Possible missing imports');
        dimensionSuggestions.push('Verify all imports are included');
      }
    }

    // Check for console.log statements (often should be removed)
    if (/console\.(log|debug|info)\s*\(/.test(block.code)) {
      score -= 5;
      dimensionIssues.push('Contains console.log statements');
      dimensionSuggestions.push('Consider removing debug statements');
    }

    // Check for hardcoded values that should be configurable
    if (/localhost:\d+|127\.0\.0\.1:\d+/.test(block.code)) {
      score -= 5;
      dimensionIssues.push('Contains hardcoded localhost URLs');
      dimensionSuggestions.push('Consider using environment variables for URLs');
    }

    // Check for proper error handling
    if (/async\s+function|\.then\s*\(/.test(block.code) && !/catch\s*\(|\.catch\s*\(|try\s*{/.test(block.code)) {
      score -= 10;
      dimensionIssues.push('Async code without error handling');
      dimensionSuggestions.push('Add try/catch or .catch() for async operations');
    }
  }

  suggestions.push(...dimensionSuggestions);
  return { score: Math.max(0, score), issues: dimensionIssues, suggestions: dimensionSuggestions };
}

/**
 * Score relevance - Does it address the user's request?
 */
function scoreRelevance(
  response: string,
  userQuery: string,
  issues: QualityIssue[],
  suggestions: string[]
): Omit<DimensionScore, 'weight'> {
  let score = 100;
  const dimensionIssues: string[] = [];
  const dimensionSuggestions: string[] = [];

  // Extract key terms from the user query
  const queryKeywords = extractKeywords(userQuery);
  const responseKeywords = extractKeywords(response.toLowerCase());

  // Calculate keyword overlap
  const matchedKeywords = queryKeywords.filter(kw =>
    responseKeywords.some(rk => rk.includes(kw) || kw.includes(rk))
  );
  const matchRatio = queryKeywords.length > 0 ? matchedKeywords.length / queryKeywords.length : 1;

  if (matchRatio < 0.3) {
    score -= 40;
    issues.push({
      type: 'off_topic',
      severity: 'high',
      message: 'Response may not address the original request',
    });
    dimensionIssues.push('Low relevance to original query');
    dimensionSuggestions.push('Rephrase your request more specifically');
  } else if (matchRatio < 0.5) {
    score -= 20;
    dimensionIssues.push('Partial relevance to query');
    dimensionSuggestions.push('Ask the AI to focus on specific aspects');
  }

  // Check if response acknowledges the request type
  const requestTypes = detectRequestType(userQuery);
  if (requestTypes.includes('code') && extractCodeBlocks(response).length === 0) {
    score -= 30;
    dimensionIssues.push('Expected code but none provided');
    dimensionSuggestions.push('Explicitly request code implementation');
  }

  if (requestTypes.includes('explanation') && !checkHasExplanation(response)) {
    score -= 15;
    dimensionIssues.push('Expected explanation but none provided');
    dimensionSuggestions.push('Ask the AI to explain the approach');
  }

  suggestions.push(...dimensionSuggestions);
  return { score: Math.max(0, score), issues: dimensionIssues, suggestions: dimensionSuggestions };
}

/**
 * Score efficiency - Concise without being incomplete?
 */
function scoreEfficiency(
  response: string,
  codeBlocks: CodeBlock[],
  textContent: string,
  issues: QualityIssue[],
  suggestions: string[]
): Omit<DimensionScore, 'weight'> {
  let score = 100;
  const dimensionIssues: string[] = [];
  const dimensionSuggestions: string[] = [];

  // Check for excessive verbosity
  const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
  const codeLineCount = codeBlocks.reduce((sum, b) => sum + b.code.split('\n').length, 0);

  // Too much explanation relative to code
  if (codeLineCount > 0 && wordCount > codeLineCount * 10) {
    score -= 15;
    issues.push({
      type: 'verbose',
      severity: 'low',
      message: 'Response contains excessive explanation',
    });
    dimensionIssues.push('Very verbose explanation');
    dimensionSuggestions.push('Request a more concise response');
  }

  // Check for repetitive content
  const repetitions = detectRepetition(response);
  if (repetitions > 3) {
    score -= 10;
    dimensionIssues.push('Contains repetitive content');
    dimensionSuggestions.push('Ask for a more concise version');
  }

  // Check for overly long code blocks that could be split
  for (const block of codeBlocks) {
    const lineCount = block.code.split('\n').length;
    if (lineCount > 200) {
      score -= 10;
      dimensionIssues.push('Very long code blocks');
      dimensionSuggestions.push('Consider asking for modular code');
      break;
    }
  }

  // Very short responses may be too terse
  if (response.length < 50) {
    score -= 20;
    dimensionIssues.push('Response may be too brief');
    dimensionSuggestions.push('Ask for more details');
  }

  suggestions.push(...dimensionSuggestions);
  return { score: Math.max(0, score), issues: dimensionIssues, suggestions: dimensionSuggestions };
}

// ============================================================================
// Detection Functions
// ============================================================================

interface CodeBlock {
  language: string;
  code: string;
}

/**
 * Extract code blocks from markdown-style response
 */
function extractCodeBlocks(response: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    blocks.push({
      language: match[1] || '',
      code: match[2],
    });
  }

  return blocks;
}

/**
 * Strip code blocks from response to get text content
 */
function stripCodeBlocks(response: string): string {
  return response.replace(/```[\s\S]*?```/g, '').trim();
}

/**
 * Check if response has meaningful explanation
 */
function checkHasExplanation(text: string): boolean {
  const lowerText = text.toLowerCase();
  return EXPLANATION_KEYWORDS.some(kw => lowerText.includes(kw));
}

/**
 * Detect truncation issues in response
 */
function detectTruncation(response: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const pattern of TRUNCATION_PATTERNS) {
    if (pattern.test(response)) {
      issues.push({
        type: 'truncation',
        severity: 'high',
        message: 'Response appears to be truncated',
      });
      break; // One truncation issue is enough
    }
  }

  return issues;
}

/**
 * Detect placeholder code patterns
 */
function detectPlaceholders(response: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const seen = new Set<string>();

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = response.match(pattern);
    if (matches) {
      for (const match of matches) {
        const key = match.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          issues.push({
            type: 'placeholder',
            severity: 'medium',
            message: `Placeholder code found: "${match.trim()}"`,
            location: { snippet: match },
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check for incomplete code structures
 */
function hasIncompleteStructure(code: string): boolean {
  // Count brackets
  const brackets: Array<[string, string]> = [
    ['{', '}'],
    ['(', ')'],
    ['[', ']'],
  ];

  for (const [open, close] of brackets) {
    // Escape special chars for regex
    const openEscaped = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const closeEscaped = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const openCount = (code.match(new RegExp(openEscaped, 'g')) || []).length;
    const closeCount = (code.match(new RegExp(closeEscaped, 'g')) || []).length;

    if (openCount !== closeCount) {
      return true;
    }
  }

  // Check for unclosed strings at end
  const lines = code.trim().split('\n');
  const lastLine = lines[lines.length - 1] || '';
  const singleQuotes = (lastLine.match(/'/g) || []).length;
  const doubleQuotes = (lastLine.match(/"/g) || []).length;
  const backticks = (lastLine.match(/`/g) || []).length;

  return (singleQuotes % 2 !== 0) || (doubleQuotes % 2 !== 0) || (backticks % 2 !== 0);
}

interface SyntaxIssue {
  message: string;
}

/**
 * Check for basic syntax issues
 */
function checkBasicSyntax(code: string, language: string): SyntaxIssue[] {
  const issues: SyntaxIssue[] = [];

  // JSX/TSX specific
  if (['jsx', 'tsx'].includes(language)) {
    if (/class=["']/.test(code)) {
      issues.push({ message: 'Use "className" instead of "class" in JSX' });
    }
    if (/for=["']/.test(code) && !/htmlFor/.test(code)) {
      issues.push({ message: 'Use "htmlFor" instead of "for" in JSX' });
    }
  }

  // TypeScript specific
  if (['typescript', 'tsx'].includes(language)) {
    if (/\bany\b/.test(code)) {
      issues.push({ message: 'Avoid using "any" type' });
    }
  }

  // General JavaScript/TypeScript
  if (['javascript', 'typescript', 'jsx', 'tsx'].includes(language)) {
    // Check for var usage
    if (/\bvar\s+\w+/.test(code)) {
      issues.push({ message: 'Consider using "const" or "let" instead of "var"' });
    }

    // Check for == instead of ===
    if (/[^!=]==[^=]/.test(code)) {
      issues.push({ message: 'Consider using "===" instead of "==" for strict equality' });
    }
  }

  return issues;
}

/**
 * Check for potentially missing imports
 */
function checkMissingImports(code: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Common identifiers that usually need imports
  const commonImportables: Record<string, string> = {
    'useState': 'react',
    'useEffect': 'react',
    'useRef': 'react',
    'useMemo': 'react',
    'useCallback': 'react',
    'useContext': 'react',
    'useReducer': 'react',
    'useLayoutEffect': 'react',
    'React': 'react',
    'clsx': 'clsx',
    'twMerge': 'tailwind-merge',
    'motion': 'framer-motion',
    'Link': 'react-router-dom or next/link',
    'useRouter': 'next/router or react-router-dom',
    'useParams': 'react-router-dom',
    'axios': 'axios',
    'z': 'zod',
  };

  const existingImports = extractImports(code, 'typescript');

  for (const [identifier, pkg] of Object.entries(commonImportables)) {
    // Check if identifier is used but not imported
    const useRegex = new RegExp(`\\b${identifier}\\b`, 'g');
    if (useRegex.test(code) && !existingImports.some(imp => imp.includes(identifier) || imp === pkg)) {
      issues.push({
        type: 'missing_import',
        severity: 'medium',
        message: `"${identifier}" is used but may not be imported from "${pkg}"`,
      });
    }
  }

  return issues;
}

/**
 * Extract keywords from text for relevance comparison
 */
function extractKeywords(text: string): string[] {
  // Common stop words to filter out
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under',
    'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
    'i', 'me', 'my', 'you', 'your', 'it', 'its', 'we', 'us', 'our', 'they',
    'them', 'their', 'this', 'that', 'these', 'those', 'what', 'which',
    'please', 'want', 'make', 'create', 'help', 'like', 'using', 'use',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)];
}

/**
 * Detect request type from query
 */
function detectRequestType(query: string): string[] {
  const types: string[] = [];
  const lowerQuery = query.toLowerCase();

  if (/code|implement|create|build|write|function|component|api/.test(lowerQuery)) {
    types.push('code');
  }
  if (/explain|why|how|what|describe|tell me/.test(lowerQuery)) {
    types.push('explanation');
  }
  if (/fix|debug|error|issue|problem|bug/.test(lowerQuery)) {
    types.push('fix');
  }
  if (/refactor|improve|optimize|clean/.test(lowerQuery)) {
    types.push('refactor');
  }

  return types.length > 0 ? types : ['general'];
}

/**
 * Detect repetitive content
 */
function detectRepetition(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences.length < 2) return 0;

  let repetitions = 0;
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      const similarity = calculateSimilarity(sentences[i], sentences[j]);
      if (similarity > 0.8) {
        repetitions++;
      }
    }
  }

  return repetitions;
}

/**
 * Calculate text similarity (simple Jaccard)
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Convert score to letter grade
 */
function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Deduplicate suggestions
 */
function deduplicateSuggestions(suggestions: string[]): string[] {
  return [...new Set(suggestions)];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get color class for quality score
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-yellow-500';
  return 'text-red-500';
}

/**
 * Get background color class for quality badge
 */
export function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500/20 border-green-500/50';
  if (score >= 60) return 'bg-yellow-500/20 border-yellow-500/50';
  return 'bg-red-500/20 border-red-500/50';
}

/**
 * Get color for grade
 */
export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-green-500';
    case 'B': return 'text-green-400';
    case 'C': return 'text-yellow-500';
    case 'D': return 'text-orange-500';
    case 'F': return 'text-red-500';
    default: return 'text-gray-500';
  }
}

/**
 * Format quality result for display
 */
export function formatQualityResult(result: QualityResult): string {
  const lines: string[] = [];

  lines.push(`Quality Score: ${result.overallScore}/100 (Grade: ${result.grade})`);
  lines.push('');
  lines.push('Dimension Scores:');
  lines.push(`  Completeness: ${result.dimensions.completeness.score}/100`);
  lines.push(`  Code Quality: ${result.dimensions.codeQuality.score}/100`);
  lines.push(`  Relevance: ${result.dimensions.relevance.score}/100`);
  lines.push(`  Efficiency: ${result.dimensions.efficiency.score}/100`);

  if (result.issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of result.issues) {
      lines.push(`  [${issue.severity}] ${issue.message}`);
    }
  }

  if (result.suggestions.length > 0) {
    lines.push('');
    lines.push('Suggestions:');
    for (const suggestion of result.suggestions) {
      lines.push(`  - ${suggestion}`);
    }
  }

  return lines.join('\n');
}

/**
 * Quick quality check (faster, less detailed)
 */
export function quickQualityCheck(response: string): { score: number; acceptable: boolean } {
  let score = 100;

  // Quick truncation check
  if (TRUNCATION_PATTERNS.some(p => p.test(response))) {
    score -= 30;
  }

  // Quick placeholder check
  const placeholders = PLACEHOLDER_PATTERNS.filter(p => p.test(response));
  score -= Math.min(30, placeholders.length * 10);

  // Very short response
  if (response.length < 100) {
    score -= 20;
  }

  return {
    score: Math.max(0, score),
    acceptable: score >= DEFAULT_CONFIG.minAcceptableScore,
  };
}
