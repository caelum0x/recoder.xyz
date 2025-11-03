/**
 * Starter Search Engine
 * Fast, fuzzy search for starter templates using TF-IDF and semantic matching
 * Alternative to Elasticsearch - lightweight but powerful
 */

import { loadStarterTemplates, type StarterTemplate } from '../templates/starter-integration';
import { STARTER_TEMPLATES as STATIC_TEMPLATES } from './template-matcher';
import { STARTER_CONFIG, log, logVerbose } from './starter-config';

interface SearchResult {
  template: StarterTemplate;
  score: number;
  matches: string[];
  reasoning: string;
}

interface SearchIndex {
  templates: StarterTemplate[];
  termFrequency: Map<string, Map<string, number>>; // term -> templateId -> frequency
  documentFrequency: Map<string, number>; // term -> number of docs containing it
  templateTokens: Map<string, Set<string>>; // templateId -> tokens
  lastIndexed: number;
}

let searchIndex: SearchIndex | null = null;

/**
 * Build search index from all starter templates
 */
export function buildSearchIndex(): SearchIndex {
  const now = Date.now();
  const cacheTimeout = STARTER_CONFIG.search.cacheTimeout;
  
  // Return cached index if still valid
  if (searchIndex && (now - searchIndex.lastIndexed) < cacheTimeout) {
    return searchIndex;
  }

  log('🔍 Building starter search index...');
  
  // Try to load templates from file system, fallback to static definitions
  let templates = loadStarterTemplates();
  
  // If file system loading failed (returns empty array), use static templates
  if (templates.length === 0) {
    log('   → Using static template definitions (file system unavailable)');
    templates = STATIC_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      path: t.path,
      description: t.description,
      keywords: t.keywords,
      framework: t.framework,
      category: t.category as string,
      files: [],
      packageJson: undefined,
    }));
  }
  
  const termFrequency = new Map<string, Map<string, number>>();
  const documentFrequency = new Map<string, number>();
  const templateTokens = new Map<string, Set<string>>();

  // Process each template
  for (const template of templates) {
    const tokens = tokenizeTemplate(template);
    templateTokens.set(template.id, tokens);

    // Count term frequencies
    for (const token of tokens) {
      // Term frequency for this template
      if (!termFrequency.has(token)) {
        termFrequency.set(token, new Map());
      }
      const tfMap = termFrequency.get(token)!;
      tfMap.set(template.id, (tfMap.get(template.id) || 0) + 1);

      // Document frequency (how many templates have this term)
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  searchIndex = {
    templates,
    termFrequency,
    documentFrequency,
    templateTokens,
    lastIndexed: now,
  };

  log(`✅ Indexed ${templates.length} starters with ${termFrequency.size} unique terms`);
  
  return searchIndex;
}

/**
 * Tokenize a template into searchable terms
 */
function tokenizeTemplate(template: StarterTemplate): Set<string> {
  const tokens = new Set<string>();

  // Add from ID (normalized)
  const idTokens = template.id.split(/[-_]/).filter(Boolean);
  idTokens.forEach(t => tokens.add(normalize(t)));

  // Add from name
  const nameTokens = template.name.split(/[\s-_]+/).filter(Boolean);
  nameTokens.forEach(t => tokens.add(normalize(t)));

  // Add from description
  if (template.description) {
    const descTokens = template.description.split(/[\s-_]+/).filter(Boolean);
    descTokens.forEach(t => tokens.add(normalize(t)));
  }

  // Add keywords
  template.keywords.forEach(k => tokens.add(normalize(k)));

  // Add framework
  tokens.add(normalize(template.framework));

  // Add category
  tokens.add(normalize(template.category));

  // Add common variations
  if (template.framework === 'nextjs') {
    tokens.add('next');
    tokens.add('next.js');
    tokens.add('nextjs');
  }
  if (template.framework === 'react') {
    tokens.add('react');
    tokens.add('reactjs');
  }

  return tokens;
}

/**
 * Normalize a term for searching
 */
function normalize(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars except dash
    .replace(/\s+/g, '-') // Replace spaces with dash
    .replace(/-+/g, '-'); // Collapse multiple dashes
}

/**
 * Tokenize user query with smart extraction
 */
function tokenizeQuery(query: string): string[] {
  const normalized = query.toLowerCase();
  const tokens: string[] = [];

  // Extract common patterns
  const patterns = {
    // Project types (order matters - more specific first)
    blog: /\bblog\b|\bblogging\b|\barticle\b|\bpost\b(?!man)|\bcms\b|\bcontent\b/i,
    ecommerce: /e-?commerce|shop|store|shopping|marketplace|cart|product/i,
    dashboard: /dashboard|admin\s*panel|analytics|metrics/i,
    auth: /\bauth\b(?!or)|\bauthentication\b|\blogin\b|\bsignup\b|\bsign\s*up\b/i,
    mobile: /mobile|ios|android|app|react\s*native|expo/i,
    api: /\bapi\b|backend|server|rest|graphql/i,
    
    // Frameworks
    nextjs: /next\.?js|nextjs/,
    react: /\breact\b/,
    vue: /\bvue\b/,
    angular: /angular/,
    svelte: /svelte/,
    express: /express/,
    
    // Technologies
    typescript: /typescript|ts\b/,
    tailwind: /tailwind/,
    prisma: /prisma/,
    mongodb: /mongo|mongodb/,
    stripe: /stripe|payment/,
    shadcn: /shadcn|ui\s*component/,
  };

  // Extract matched patterns
  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.test(normalized)) {
      tokens.push(key);
    }
  }

  // Add individual words
  const words = normalized
    .split(/[\s,.-]+/)
    .filter(w => w.length > 2) // Skip very short words
    .map(normalize);
  
  tokens.push(...words);

  return [...new Set(tokens)]; // Remove duplicates
}

/**
 * Calculate TF-IDF score for a template given query tokens
 */
function calculateTFIDF(
  template: StarterTemplate,
  queryTokens: string[],
  index: SearchIndex
): number {
  let score = 0;
  const totalDocs = index.templates.length;

  for (const token of queryTokens) {
    // Get term frequency in this template
    const tf = index.termFrequency.get(token)?.get(template.id) || 0;
    
    if (tf === 0) continue;

    // Get document frequency
    const df = index.documentFrequency.get(token) || 0;
    
    // Calculate IDF (inverse document frequency)
    // Templates that have rare terms get higher scores
    const idf = df > 0 ? Math.log(totalDocs / df) : 0;
    
    // TF-IDF score
    score += tf * idf;
  }

  return score;
}

/**
 * Calculate fuzzy match score using Levenshtein distance
 */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const config = STARTER_CONFIG.fuzzyMatch;

  // Exact match
  if (q === t) return config.exactMatchScore;

  // Contains match
  if (t.includes(q)) return config.containsMatchScore;

  // Levenshtein distance
  const distance = levenshteinDistance(q, t);
  const maxLen = Math.max(q.length, t.length);
  const similarity = 1 - (distance / maxLen);

  return similarity > config.minSimilarity ? similarity : 0;
}

/**
 * Levenshtein distance algorithm
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Detect primary intent from query (what is the MAIN thing they want)
 */
function detectPrimaryIntent(query: string): string | null {
  const normalized = query.toLowerCase();

  // Primary intents in priority order (most specific first)
  // FRAMEWORK INTENTS FIRST (highest priority)
  const intents = [
    {
      name: 'angular',
      patterns: [
        /\bangular\b/i,  // ANY mention of "angular" - will get massive boost later
        /(create|build|make|setup|start)\s+(a|an|the)?\s*angular/i,
        /angular\s+(app|project|application|starter|template)/i,
      ]
    },
    {
      name: 'react',
      patterns: [
        /\breact\s+(native|app|project|application|starter|template)\b/i,  // "react native", "react app"
        /(create|build|make|setup|start)\s+(a|an|the)?\s*react/i,
        /\breact\b(?!\s*native)/i,  // "react" but NOT "react native" (that's different)
      ]
    },
    {
      name: 'vue',
      patterns: [
        /\bvue\b/i,  // ANY mention of "vue"
        /(create|build|make|setup|start)\s+(a|an|the)?\s*vue/i,
        /vue\s+(app|project|application|starter|template)/i,
      ]
    },
    {
      name: 'nextjs',
      patterns: [
        /\bnext\.?js\b/i,  // ANY mention of "nextjs" or "next.js"
        /(create|build|make|setup|start)\s+(a|an|the)?\s*next/i,
        /next\.?js\s+(app|project|application|starter|template)/i,
      ]
    },
    {
      name: 'svelte',
      patterns: [
        /\bsvelte(kit)?\b/i,  // "svelte" or "sveltekit"
        /(create|build|make|setup|start)\s+(a|an|the)?\s*svelte/i,
        /svelte\s+(app|project|application|starter|template)/i,
      ]
    },
    {
      name: 'blog',
      patterns: [
        /\bblog\s+(platform|site|app|website)/i,      // "blog platform", "blog site", "blog app"
        /(create|build|make)\s+.*\bblog/i,           // "create a blog", "build blog"
        /\bblogging\s+(platform|site|app)/i,         // "blogging platform"
        /\bblog\s+with/i,                            // "blog with authentication"
        /\bpost[s]?\s+(creation|editing|management)/i, // "post creation", "posts editing"
        /(write|publish|create)\s+.*\bpost[s]?\b/i, // "write posts", "create post"
        /\barticle[s]?\s+/i,                         // "articles" (standalone)
        /\bcontent\s+(platform|management|cms)/i,    // "content platform", "content management"
      ]
    },
    {
      name: 'ecommerce',
      patterns: [
        /e-?commerce/i,
        /\bshop\b/i,
        /\bstore\b/i,
        /\bmarketplace\b/i,
        /\bproduct[s]?\s+(catalog|listing)/i,
      ]
    },
    {
      name: 'dashboard',
      patterns: [
        /\bdashboard\b/i,
        /\banalytics\s+panel\b/i,
        /\bmetrics\s+dashboard\b/i,
      ]
    },
    {
      name: 'portfolio',
      patterns: [
        /\bportfolio\b/i,
        /\bshowcase\b/i,
      ]
    },
    {
      name: 'landing',
      patterns: [
        /\blanding\s*page\b/i,
      ]
    },
  ];

  for (const intent of intents) {
    for (const pattern of intent.patterns) {
      if (pattern.test(normalized)) {
        log(`   🎯 Primary intent detected: ${intent.name} (matched: ${pattern})`);
        return intent.name;
      }
    }
  }

  return null;
}

/**
 * Search for best matching starter templates
 */
export function searchStarters(
  query: string,
  limit: number = STARTER_CONFIG.search.maxResults,
  minScore: number = STARTER_CONFIG.search.minScore
): SearchResult[] {
  const index = buildSearchIndex();
  const queryTokens = tokenizeQuery(query);
  const scoring = STARTER_CONFIG.scoring;
  const primaryIntent = detectPrimaryIntent(query);

  log(`🔍 Searching for: "${query}"`);
  logVerbose(`   Query tokens: ${queryTokens.join(', ')}`);
  if (primaryIntent) {
    log(`   Primary intent detected: ${primaryIntent}`);
  }

  const results: SearchResult[] = [];

    for (const template of index.templates) {
    let score = 0;
    const matches: string[] = [];

    // MASSIVE boost if template matches primary intent
    if (primaryIntent) {
      const templateHasIntent =
        template.id.toLowerCase().includes(primaryIntent) ||
        template.name.toLowerCase().includes(primaryIntent) ||
        template.keywords.some(k => k.toLowerCase().includes(primaryIntent)) ||
        template.description.toLowerCase().includes(primaryIntent);

      if (templateHasIntent) {
        score += 10.0; // Huge boost for primary intent match
        matches.push('primary-intent');
        log(`   💎 Primary intent match: ${template.id}`);
      } else {
        // PENALTY for templates that DON'T match the primary intent category
        // This prevents auth templates from matching e-commerce requests, etc.
        const intentCategoryMap: Record<string, string[]> = {
          // Framework intents
          'angular': ['angular', 'ng'],
          'react': ['react', 'reactjs'],
          'vue': ['vue', 'vuejs'],
          'nextjs': ['nextjs', 'next.js', 'next'],
          'svelte': ['svelte', 'sveltekit'],
          // Project type intents
          'ecommerce': ['ecommerce', 'e-commerce', 'shop', 'store', 'commerce', 'cart', 'product', 'shopping', 'marketplace', 'stripe', 'payment'],
          'blog': ['blog', 'content', 'cms', 'article', 'post', 'mdx'],
          'dashboard': ['dashboard', 'admin', 'analytics', 'metrics'],
          'auth': ['auth', 'authentication', 'login', 'signup', 'user'],
          'api': ['api', 'backend', 'server', 'rest'],
        };
        
        const expectedKeywords = intentCategoryMap[primaryIntent];
        if (expectedKeywords) {
          // Check if template category/id/keywords match the expected category
          const categoryMatches = expectedKeywords.some(keyword => 
            template.category.toLowerCase().includes(keyword) ||
            template.id.toLowerCase().includes(keyword) ||
            template.keywords.some(k => k.toLowerCase().includes(keyword))
          );
          
          if (!categoryMatches) {
            // This template doesn't match the primary intent category
            // Apply severe penalty to push it down in rankings
            score *= 0.2; // 80% reduction
            matches.push(`category-mismatch:${template.category}`);
            logVerbose(`   ⚠️ Category mismatch penalty for ${template.id} (expected ${primaryIntent}, got ${template.category})`);
          }
        }
      }
    }

    // TF-IDF score (configurable weight)
    const tfidfScore = calculateTFIDF(template, queryTokens, index);
    score += tfidfScore * scoring.tfidf;

    if (tfidfScore > 0) {
      matches.push('keyword-match');
    }

    // Fuzzy matching on template ID (configurable weight)
    const idMatch = fuzzyMatch(query, template.id);
    score += idMatch * scoring.idMatch;
    
    if (idMatch > STARTER_CONFIG.fuzzyMatch.minSimilarity) {
      matches.push('id-match');
    }

    // Fuzzy matching on template name (configurable weight)
    const nameMatch = fuzzyMatch(query, template.name);
    score += nameMatch * scoring.nameMatch;
    
    if (nameMatch > STARTER_CONFIG.fuzzyMatch.minSimilarity) {
      matches.push('name-match');
    }

    // Exact framework match - MASSIVE boost for framework-specific requests
    // Changed from scoring.framework (0.1) to 50.0 for decisive framework matching
    if (queryTokens.includes(template.framework)) {
      score += 50.0;  // Huge boost - framework match should always win
      matches.push('framework-exact-match');
      log(`   🎯 Framework exact match: ${template.framework} in template ${template.id}`);
    }

    // Exact category match (configurable weight)
    if (queryTokens.includes(template.category)) {
      score += scoring.category;
      matches.push('category-match');
    }

    // Boost for exact keyword matches
    for (const token of queryTokens) {
      const templateTokenSet = index.templateTokens.get(template.id) || new Set();
      if (templateTokenSet.has(token)) {
        score += 0.05; // Small boost per exact token match
      }
    }

    if (score >= minScore) {
      results.push({
        template,
        score,
        matches,
        reasoning: generateReasoning(template, matches, score),
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Log top results
  log(`   Found ${results.length} matches:`);
  // Log ALL results (not just top 3) for debugging
  results.forEach(r => {
    log(`   - ${r.template.id}: ${r.score.toFixed(3)} (${r.matches.join(', ')})`);
  });

  return results.slice(0, limit);
}

/**
 * Generate human-readable reasoning for match
 */
function generateReasoning(template: StarterTemplate, matches: string[], score: number): string {
  const reasons: string[] = [];

  if (matches.includes('primary-intent')) {
    reasons.push('PRIMARY INTENT MATCH');
  }
  if (matches.includes('id-match')) {
    reasons.push('exact ID match');
  }
  if (matches.includes('name-match')) {
    reasons.push('name similarity');
  }
  if (matches.includes('framework-match')) {
    reasons.push(`${template.framework} framework`);
  }
  if (matches.includes('keyword-match')) {
    reasons.push('keyword relevance');
  }
  if (matches.includes('category-match')) {
    reasons.push(`${template.category} category`);
  }

  const confidence = Math.round(score * 100);
  return reasons.length > 0
    ? `Matched by ${reasons.join(', ')} (${confidence}% confidence)`
    : `Partial match (${confidence}% confidence)`;
}

/**
 * Get best starter match for a query
 */
export function findBestStarter(query: string): SearchResult | null {
  const minScore = STARTER_CONFIG.search.minScore;
  const results = searchStarters(query, 1, minScore);
  return results.length > 0 ? results[0] : null;
}

/**
 * Clear search index cache (useful for testing)
 */
export function clearSearchIndex(): void {
  searchIndex = null;
  log('🗑️  Search index cache cleared');
}
