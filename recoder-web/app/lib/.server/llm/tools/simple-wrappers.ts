/**
 * Simple wrapper functions for enterprise tools API
 * These provide direct function access to tools without needing Config objects
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { isDomainAllowed, parseDomainList } from '~/lib/.server/web/web-safety';

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('SimpleWrappers');

/**
 * Simple glob search function
 */
export async function globSearch(
  pattern: string,
  options?: { cwd?: string; ignore?: string[] }
): Promise<{ success: boolean; files: string[]; error?: string }> {
  try {
    const cwd = options?.cwd || process.cwd();
    const files = await glob(pattern, {
      cwd,
      ignore: options?.ignore || ['node_modules/**', '.git/**'],
      nodir: true,
    });
    return { success: true, files };
  } catch (error) {
    return {
      success: false,
      files: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Simple ripgrep-like search using node
 * Falls back to simple file content search if ripgrep not available
 */
export async function simpleGrep(
  pattern: string,
  searchPath: string,
  options?: { caseSensitive?: boolean; maxResults?: number }
): Promise<{ success: boolean; matches: Array<{ file: string; line: number; content: string }>; error?: string }> {
  try {
    const matches: Array<{ file: string; line: number; content: string }> = [];
    const maxResults = options?.maxResults || 100;
    const regex = new RegExp(pattern, options?.caseSensitive ? 'g' : 'gi');

    // Get all files in path
    const files = await glob('**/*', {
      cwd: searchPath,
      ignore: ['node_modules/**', '.git/**', '*.lock', 'package-lock.json'],
      nodir: true,
    });

    for (const file of files) {
      if (matches.length >= maxResults) break;

      const fullPath = path.join(searchPath, file);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;
          if (regex.test(lines[i])) {
            matches.push({
              file,
              line: i + 1,
              content: lines[i].substring(0, 200), // Truncate long lines
            });
          }
        }
      } catch {
        // Skip files that can't be read (binary, etc.)
      }
    }

    return { success: true, matches };
  } catch (error) {
    return {
      success: false,
      matches: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Simple memory store (in-memory for session)
 */
const memoryStore = new Map<string, { value: string; timestamp: number }>();

export async function memoryOperation(
  operation: 'store' | 'retrieve' | 'list' | 'delete',
  data?: { key?: string; value?: string }
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    switch (operation) {
      case 'store':
        if (!data?.key || data.value === undefined) {
          return { success: false, error: 'Key and value required for store operation' };
        }
        memoryStore.set(data.key, { value: data.value, timestamp: Date.now() });
        return { success: true, result: { stored: data.key } };

      case 'retrieve':
        if (!data?.key) {
          return { success: false, error: 'Key required for retrieve operation' };
        }
        const item = memoryStore.get(data.key);
        if (!item) {
          return { success: false, error: `Key '${data.key}' not found` };
        }
        return { success: true, result: item.value };

      case 'list':
        return {
          success: true,
          result: Array.from(memoryStore.entries()).map(([k, v]) => ({
            key: k,
            timestamp: v.timestamp,
          }))
        };

      case 'delete':
        if (!data?.key) {
          return { success: false, error: 'Key required for delete operation' };
        }
        const deleted = memoryStore.delete(data.key);
        return { success: true, result: { deleted } };

      default:
        return { success: false, error: `Unknown operation: ${operation}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Simple web fetch wrapper
 */
export async function simpleFetch(
  url: string,
  options?: { timeout?: number; extractText?: boolean }
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options?.timeout || 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Recoder-Web/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const content = await response.text();

    // Simple HTML to text conversion if needed
    if (options?.extractText && content.includes('<html')) {
      // Basic HTML stripping
      const textContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 10000); // Limit size
      return { success: true, content: textContent };
    }

    return { success: true, content: content.substring(0, 50000) }; // Limit size
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Read multiple files efficiently
 */
export async function readMultipleFiles(
  filePaths: string[],
  workingDir: string,
  options?: { maxFileSize?: number }
): Promise<{ success: boolean; files: Array<{ path: string; content?: string; error?: string }>}> {
  const maxSize = options?.maxFileSize || 100000; // 100KB default
  const results: Array<{ path: string; content?: string; error?: string }> = [];

  for (const filePath of filePaths) {
    const fullPath = path.join(workingDir, filePath);
    try {
      const stats = await fs.stat(fullPath);
      if (stats.size > maxSize) {
        results.push({ path: filePath, error: `File too large (${stats.size} bytes)` });
        continue;
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      results.push({ path: filePath, content });
    } catch (error) {
      results.push({
        path: filePath,
        error: error instanceof Error ? error.message : 'Failed to read file'
      });
    }
  }

  return { success: true, files: results };
}

/**
 * Apply line-based edits to a file
 */
export async function applyEdits(
  filePath: string,
  edits: Array<{ lineNumber: number; operation: 'insert' | 'delete' | 'replace'; content?: string; endLine?: number }>,
  workingDir: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const fullPath = path.join(workingDir, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // Sort edits in reverse order to avoid index shifting
    const sortedEdits = [...edits].sort((a, b) => b.lineNumber - a.lineNumber);

    for (const edit of sortedEdits) {
      const idx = edit.lineNumber - 1; // Convert to 0-based

      switch (edit.operation) {
        case 'insert':
          if (edit.content !== undefined) {
            lines.splice(idx, 0, edit.content);
          }
          break;

        case 'delete':
          const deleteCount = edit.endLine ? edit.endLine - edit.lineNumber + 1 : 1;
          lines.splice(idx, deleteCount);
          break;

        case 'replace':
          if (edit.content !== undefined) {
            const replaceCount = edit.endLine ? edit.endLine - edit.lineNumber + 1 : 1;
            lines.splice(idx, replaceCount, edit.content);
          }
          break;
      }
    }

    await fs.writeFile(fullPath, lines.join('\n'));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply edits',
    };
  }
}

/**
 * Web search using multiple free sources
 * Priority: Tavily (if API key) > DuckDuckGo Instant Answer > HTML scraping
 */
export async function webSearch(
  query: string,
  options?: {
    maxResults?: number;
    tavilyApiKey?: string;
    allowedDomains?: string[] | string;
    blockedDomains?: string[] | string;
  }
): Promise<{ success: boolean; results: Array<{ title: string; url: string; snippet: string }>; error?: string }> {
  const maxResults = options?.maxResults || 5;
  const allowedDomains = parseDomainList(options?.allowedDomains);
  const blockedDomains = parseDomainList(options?.blockedDomains);

  // Try Tavily first if API key is available
  if (options?.tavilyApiKey) {
    try {
      const tavilyResult = await searchWithTavily(query, options.tavilyApiKey, maxResults);
      if (tavilyResult.success && tavilyResult.results.length > 0) {
        return filterSearchResults(tavilyResult, allowedDomains, blockedDomains, maxResults);
      }
    } catch (e) {
      logger.warn('Tavily search failed, falling back:', e);
    }
  }

  // Try DuckDuckGo Instant Answer API (free, no key needed)
  try {
    const ddgResult = await searchWithDuckDuckGo(query, maxResults);
    if (ddgResult.success && ddgResult.results.length > 0) {
      return filterSearchResults(ddgResult, allowedDomains, blockedDomains, maxResults);
    }
  } catch (e) {
    logger.warn('DuckDuckGo search failed, falling back:', e);
  }

  // Fallback: Use DuckDuckGo HTML search scraping
  try {
    const scrapeResult = await searchWithScraping(query, maxResults);
    return filterSearchResults(scrapeResult, allowedDomains, blockedDomains, maxResults);
  } catch (e) {
    logger.error('All search methods failed:', e);
    return {
      success: false,
      results: [],
      error: 'All search methods failed. Please try a more specific query.'
    };
  }
}

function filterSearchResults(
  result: { success: boolean; results: Array<{ title: string; url: string; snippet: string }>; error?: string },
  allowedDomains?: string[],
  blockedDomains?: string[],
  maxResults: number = 5
): { success: boolean; results: Array<{ title: string; url: string; snippet: string }>; error?: string } {
  const filtered = result.results.filter((item) => {
    if (!item.url) return true;
    try {
      const host = new URL(item.url).hostname.toLowerCase();
      return isDomainAllowed(host, { allowedDomains, blockedDomains });
    } catch {
      return false;
    }
  }).slice(0, maxResults);

  if (filtered.length === 0) {
    return {
      success: false,
      results: [],
      error: result.error || 'No search results matched the configured domain policy',
    };
  }

  return {
    success: true,
    results: filtered,
  };
}

/**
 * Search using Tavily API (premium, needs API key)
 */
async function searchWithTavily(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<{ success: boolean; results: Array<{ title: string; url: string; snippet: string }> }> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: maxResults,
      include_answer: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = await response.json() as {
    results: Array<{ title: string; url: string; content: string }>;
    answer?: string;
  };

  const results = data.results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content.substring(0, 300),
  }));

  // Add the AI-generated answer as the first result if available
  if (data.answer) {
    results.unshift({
      title: 'AI Summary',
      url: '',
      snippet: data.answer,
    });
  }

  return { success: true, results };
}

/**
 * Search using DuckDuckGo Instant Answer API (free, limited)
 */
async function searchWithDuckDuckGo(
  query: string,
  maxResults: number
): Promise<{ success: boolean; results: Array<{ title: string; url: string; snippet: string }> }> {
  const encodedQuery = encodeURIComponent(query);
  const response = await fetch(
    `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`,
    {
      headers: {
        'User-Agent': 'Recoder-Web/1.0 (https://recoder.xyz)',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`DuckDuckGo API error: ${response.status}`);
  }

  const data = await response.json() as {
    Abstract: string;
    AbstractSource: string;
    AbstractURL: string;
    RelatedTopics: Array<{
      Text?: string;
      FirstURL?: string;
      Topics?: Array<{ Text: string; FirstURL: string }>;
    }>;
    Results: Array<{ Text: string; FirstURL: string }>;
  };

  const results: Array<{ title: string; url: string; snippet: string }> = [];

  // Add abstract if available
  if (data.Abstract && data.AbstractURL) {
    results.push({
      title: data.AbstractSource || 'Summary',
      url: data.AbstractURL,
      snippet: data.Abstract,
    });
  }

  // Add direct results
  for (const r of data.Results || []) {
    if (results.length >= maxResults) break;
    if (r.Text && r.FirstURL) {
      results.push({
        title: r.Text.split(' - ')[0] || r.Text,
        url: r.FirstURL,
        snippet: r.Text,
      });
    }
  }

  // Add related topics
  for (const topic of data.RelatedTopics || []) {
    if (results.length >= maxResults) break;

    if (topic.Text && topic.FirstURL) {
      results.push({
        title: topic.Text.split(' - ')[0] || topic.Text,
        url: topic.FirstURL,
        snippet: topic.Text,
      });
    }

    // Handle nested topics
    if (topic.Topics) {
      for (const subTopic of topic.Topics) {
        if (results.length >= maxResults) break;
        if (subTopic.Text && subTopic.FirstURL) {
          results.push({
            title: subTopic.Text.split(' - ')[0] || subTopic.Text,
            url: subTopic.FirstURL,
            snippet: subTopic.Text,
          });
        }
      }
    }
  }

  return { success: results.length > 0, results };
}

/**
 * Fallback search using HTML scraping
 */
async function searchWithScraping(
  query: string,
  maxResults: number
): Promise<{ success: boolean; results: Array<{ title: string; url: string; snippet: string }> }> {
  const encodedQuery = encodeURIComponent(query);
  const response = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodedQuery}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Scrape failed: ${response.status}`);
  }

  const html = await response.text();
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  // Parse DuckDuckGo HTML results using simpler patterns
  // Match result blocks
  const resultBlockRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  const urls: string[] = [];
  const titles: string[] = [];

  // Extract titles and URLs
  while ((match = resultBlockRegex.exec(html)) !== null) {
    const [, rawUrl, titleHtml] = match;
    let url = rawUrl;

    // Decode the DDG redirect URL
    const udMatch = rawUrl.match(/uddg=([^&]+)/);
    if (udMatch) {
      url = decodeURIComponent(udMatch[1]);
    }

    const title = titleHtml.replace(/<[^>]*>/g, '').trim();
    if (title && url && !url.includes('duckduckgo.com')) {
      urls.push(url);
      titles.push(decodeHtmlEntities(title));
    }
  }

  // Extract snippets
  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    const snippet = match[1].replace(/<[^>]*>/g, '').trim();
    snippets.push(decodeHtmlEntities(snippet));
  }

  // Combine results
  for (let i = 0; i < Math.min(titles.length, maxResults); i++) {
    results.push({
      title: titles[i] || '',
      url: urls[i] || '',
      snippet: snippets[i] || '',
    });
  }

  return { success: results.length > 0, results };
}

/**
 * Decode HTML entities in text
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * Browser automation actions
 */
export type BrowserAction =
  | 'launch'
  | 'click'
  | 'type'
  | 'screenshot'
  | 'extract'
  | 'execute'
  | 'scroll_down'
  | 'scroll_up'
  | 'close';

export interface BrowserAutomationParams {
  action: BrowserAction;
  projectId: string;
  url?: string;
  selector?: string;
  text?: string;
  script?: string;
  sessionToken?: string;  // Auth token for docker-backend API
}

export interface BrowserAutomationResult {
  success: boolean;
  screenshot?: string;
  logs?: string[];
  currentUrl?: string;
  extractedContent?: string;
  error?: string;
}

/**
 * Semantic code search
 * Find code by meaning using embeddings
 */
export interface CodeSearchParams {
  action: 'index' | 'search' | 'status' | 'clear';
  projectId: string;
  workspacePath?: string;
  query?: string;
  openaiApiKey?: string;
  maxResults?: number;
  directoryPrefix?: string;
  sessionToken?: string;  // Auth token for docker-backend API
}

export interface CodeSearchResponse {
  success: boolean;
  results?: Array<{
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    score: number;
  }>;
  stats?: {
    indexed: boolean;
    totalBlocks: number;
    totalFiles: number;
  };
  indexing?: {
    status: string;
    filesScanned: number;
    blocksIndexed: number;
  };
  error?: string;
}

export async function codeSearch(params: CodeSearchParams): Promise<CodeSearchResponse> {
  const { action, projectId, query, openaiApiKey, maxResults, directoryPrefix, sessionToken } = params;

  // Call docker-backend API for real code indexing/search
  const DOCKER_URL = process.env.DOCKER_BACKEND_URL || 'http://localhost:3100';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  switch (action) {
    case 'index': {
      if (!openaiApiKey) {
        return { success: false, error: 'openaiApiKey required for index action' };
      }

      try {
        const response = await fetch(`${DOCKER_URL}/api/code-index/${projectId}/index`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ openaiApiKey }),
        });

        const result = await response.json() as any;

        return {
          success: result.success,
          indexing: {
            status: result.success ? 'complete' : 'error',
            filesScanned: result.filesIndexed || 0,
            blocksIndexed: result.blocksIndexed || 0,
          },
          error: result.error,
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Indexing failed' };
      }
    }

    case 'search': {
      if (!query) {
        return { success: false, error: 'query required for search action' };
      }
      if (!openaiApiKey) {
        return { success: false, error: 'openaiApiKey required for search action' };
      }

      try {
        const response = await fetch(`${DOCKER_URL}/api/code-index/${projectId}/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, openaiApiKey, maxResults: maxResults || 10, directoryPrefix }),
        });

        const result = await response.json() as any;

        return {
          success: result.success,
          results: result.results?.map((r: any) => ({
            filePath: r.block?.filePath || r.filePath,
            content: r.block?.content || r.content,
            startLine: r.block?.startLine || r.startLine,
            endLine: r.block?.endLine || r.endLine,
            score: r.score,
          })) || [],
          error: result.error,
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Search failed' };
      }
    }

    case 'status': {
      try {
        const response = await fetch(`${DOCKER_URL}/api/code-index/${projectId}/status`, {
          method: 'GET',
          headers,
        });

        const result = await response.json() as any;

        return {
          success: true,
          stats: result.stats ? {
            indexed: result.stats.indexed,
            totalBlocks: result.stats.totalBlocks,
            totalFiles: result.stats.totalFiles,
          } : undefined,
          indexing: result.indexing ? {
            status: result.indexing.status,
            filesScanned: result.indexing.filesScanned,
            blocksIndexed: result.indexing.blocksIndexed,
          } : undefined,
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Status check failed' };
      }
    }

    case 'clear': {
      try {
        const response = await fetch(`${DOCKER_URL}/api/code-index/${projectId}`, {
          method: 'DELETE',
          headers,
        });

        const result = await response.json() as any;
        return { success: result.success, error: result.error };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Clear failed' };
      }
    }

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

/**
 * Browser automation wrapper
 * Executes browser actions via docker-backend where Puppeteer is installed
 */
export async function browserAutomation(
  params: BrowserAutomationParams
): Promise<BrowserAutomationResult> {
  const { action, projectId, url, selector, text, script, sessionToken } = params;

  // Call docker-backend API for real Puppeteer automation
  const DOCKER_URL = process.env.DOCKER_BACKEND_URL || 'http://localhost:3100';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  try {
    const response = await fetch(`${DOCKER_URL}/api/browser/${projectId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, url, selector, text, script }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Browser API error: ${response.status} - ${errorText}` };
    }

    const result = await response.json() as BrowserAutomationResult;
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Browser automation failed',
    };
  }
}
