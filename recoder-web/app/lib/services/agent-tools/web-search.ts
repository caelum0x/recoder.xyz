/**
 * Web Search Tool
 * Search the web for real-time information
 */

import { z } from 'zod';
import type { AgentContext, ToolDefinition } from './types';
import { escapeXmlAttr, escapeXmlContent } from './types';

// ============================================================================
// Schema
// ============================================================================

const webSearchSchema = z.object({
  query: z.string().describe('The search query to look up on the web'),
});

export type WebSearchArgs = z.infer<typeof webSearchSchema>;

// ============================================================================
// Types
// ============================================================================

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  summary?: string;
}

// ============================================================================
// Web Search Implementation
// ============================================================================

const DESCRIPTION = `
Use this tool to access real-time information beyond your training data cutoff.

When to Search:
- Current API documentation, library versions, or breaking changes
- Latest best practices, security advisories, or bug fixes
- Specific error messages or troubleshooting solutions
- Recent framework updates or deprecation notices

Query Tips:
- Be specific: Include version numbers, exact error messages, or technical terms
- Add context: "React 19 useEffect cleanup" not just "React hooks"

Examples:
- OpenAI GPT-5 API model names
- NextJS 14 app router middleware auth
- Tailwind CSS v4 breaking changes
`;

/**
 * Search the web for information
 */
export async function webSearch(
  args: WebSearchArgs,
  ctx: AgentContext,
): Promise<string> {
  const { query } = args;

  ctx.onXmlStream?.(`<recoder-web-search query="${escapeXmlAttr(query)}">`);

  try {
    // Call the web search API
    const response = await fetch('/api/tools/web-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Web search failed: ${error}`);
    }

    const data: WebSearchResponse = await response.json();

    if (!data.results || data.results.length === 0) {
      const noResultsMsg = 'No results found for the query.';
      ctx.onXmlComplete?.(`<recoder-web-search query="${escapeXmlAttr(query)}">${escapeXmlContent(noResultsMsg)}</recoder-web-search>`);
      return noResultsMsg;
    }

    // Format results for the agent
    let resultText = '';

    if (data.summary) {
      resultText += `Summary: ${data.summary}\n\n`;
    }

    resultText += 'Search Results:\n';
    for (const result of data.results) {
      resultText += `\n**${result.title}**\n`;
      resultText += `URL: ${result.url}\n`;
      resultText += `${result.snippet}\n`;
    }

    ctx.onXmlComplete?.(`<recoder-web-search query="${escapeXmlAttr(query)}">${escapeXmlContent(resultText)}</recoder-web-search>`);

    ctx.log?.(`Web search completed for: ${query}`, 'info');

    return resultText;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.onXmlComplete?.(`<recoder-web-search query="${escapeXmlAttr(query)}" error="${escapeXmlAttr(errorMessage)}"></recoder-web-search>`);
    throw new Error(`Web search failed: ${errorMessage}`);
  }
}

// ============================================================================
// Tool Definition
// ============================================================================

export const webSearchTool: ToolDefinition<WebSearchArgs> = {
  name: 'web_search',
  description: DESCRIPTION,
  inputSchema: webSearchSchema,
  defaultConsent: 'ask',

  getConsentPreview: (args) => `Search the web: "${args.query}"`,

  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<recoder-web-search query="${escapeXmlAttr(args.query)}">Searching...`;
  },

  execute: webSearch,
};
