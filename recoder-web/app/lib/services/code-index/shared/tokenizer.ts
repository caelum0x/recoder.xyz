/**
 * Simple Tokenizer for BM25 Search
 * Handles text tokenization for keyword-based search
 */

// Common programming stopwords
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'were', 'will', 'with', 'this', 'but', 'they', 'have',
  'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how',
  // Programming-specific
  'var', 'let', 'const', 'function', 'return', 'if', 'else', 'for',
  'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch',
  'throw', 'new', 'class', 'extends', 'implements', 'interface',
  'public', 'private', 'protected', 'static', 'final', 'abstract',
  'import', 'export', 'from', 'require', 'module', 'exports',
  'async', 'await', 'promise', 'null', 'undefined', 'true', 'false',
  'void', 'type', 'typeof', 'instanceof'
]);

/**
 * Splits camelCase and PascalCase identifiers
 */
function splitCamelCase(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/);
}

/**
 * Splits snake_case identifiers
 */
function splitSnakeCase(text: string): string[] {
  return text.split('_').filter(Boolean);
}

/**
 * Tokenizes text for BM25 search
 * @param text The text to tokenize
 * @param options Tokenization options
 * @returns Array of tokens
 */
export function tokenize(
  text: string,
  options: {
    lowercase?: boolean;
    removeStopWords?: boolean;
    splitIdentifiers?: boolean;
    minLength?: number;
  } = {}
): string[] {
  const {
    lowercase = true,
    removeStopWords = true,
    splitIdentifiers = true,
    minLength = 2
  } = options;

  // Remove code comments and strings for cleaner tokenization
  let cleanText = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // Multi-line comments
    .replace(/\/\/.*$/gm, ' ') // Single-line comments
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ') // Double-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ') // Single-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, ' '); // Template literals

  // Split on non-alphanumeric characters
  let tokens = cleanText.split(/[^a-zA-Z0-9_]+/).filter(Boolean);

  // Process each token
  const processedTokens: string[] = [];
  for (const token of tokens) {
    let subtokens = [token];

    if (splitIdentifiers) {
      // Split camelCase
      subtokens = subtokens.flatMap(t => splitCamelCase(t));
      // Split snake_case
      subtokens = subtokens.flatMap(t => splitSnakeCase(t));
    }

    for (let subtoken of subtokens) {
      if (lowercase) {
        subtoken = subtoken.toLowerCase();
      }

      // Skip short tokens
      if (subtoken.length < minLength) continue;

      // Skip numeric-only tokens
      if (/^\d+$/.test(subtoken)) continue;

      // Skip stop words
      if (removeStopWords && STOP_WORDS.has(subtoken.toLowerCase())) continue;

      processedTokens.push(subtoken);
    }
  }

  return processedTokens;
}

/**
 * Computes term frequency for tokens
 * @param tokens Array of tokens
 * @returns Map of term to frequency
 */
export function computeTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

/**
 * Normalizes term frequency using log normalization
 * @param tf Raw term frequency
 * @returns Normalized term frequency
 */
export function normalizeTermFrequency(tf: number): number {
  return tf === 0 ? 0 : 1 + Math.log(tf);
}

/**
 * Computes inverse document frequency
 * @param documentFrequency Number of documents containing the term
 * @param totalDocuments Total number of documents
 * @returns IDF score
 */
export function computeIDF(documentFrequency: number, totalDocuments: number): number {
  if (documentFrequency === 0) return 0;
  return Math.log((totalDocuments - documentFrequency + 0.5) / (documentFrequency + 0.5) + 1);
}

/**
 * Extracts n-grams from tokens
 * @param tokens Array of tokens
 * @param n N-gram size
 * @returns Array of n-grams
 */
export function extractNGrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];

  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Stems a word using simple suffix stripping (Porter-like)
 * @param word Word to stem
 * @returns Stemmed word
 */
export function stem(word: string): string {
  word = word.toLowerCase();

  // Common suffixes to remove
  const suffixes = [
    'ation', 'ition', 'ness', 'ment', 'able', 'ible',
    'ful', 'less', 'ing', 'tion', 'sion', 'ous',
    'ive', 'ly', 'er', 'or', 'al', 'ed', 'es', 's'
  ];

  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }

  return word;
}

/**
 * Tokenizes with stemming
 * @param text Text to tokenize
 * @returns Array of stemmed tokens
 */
export function tokenizeWithStemming(text: string): string[] {
  const tokens = tokenize(text);
  return tokens.map(stem);
}
