/**
 * Web Crawl Tool
 * Crawl a website to clone/replicate it
 */

import { z } from 'zod';
import type { AgentContext, ToolDefinition } from './types';
import { escapeXmlContent } from './types';

// ============================================================================
// Schema
// ============================================================================

const webCrawlSchema = z.object({
  url: z.string().describe('URL to crawl'),
});

export type WebCrawlArgs = z.infer<typeof webCrawlSchema>;

// ============================================================================
// Types
// ============================================================================

export interface WebCrawlResult {
  rootUrl: string;
  html?: string;
  markdown?: string;
  screenshot?: string;
}

// ============================================================================
// Web Crawl Implementation
// ============================================================================

const DESCRIPTION = `
You can crawl a website so you can clone it.

### When You MUST Trigger a Crawl
Trigger a crawl ONLY if BOTH conditions are true:

1. The user's message shows intent to CLONE / COPY / REPLICATE / RECREATE / DUPLICATE / MIMIC a website.
   - Keywords include: clone, copy, replicate, recreate, duplicate, mimic, build the same, make the same.

2. The user's message contains a URL or something that appears to be a domain name.
   - e.g. "example.com", "https://example.com"
   - Do not require 'http://' or 'https://'.
`;

const CLONE_INSTRUCTIONS = `

Replicate the website from the provided screenshot image and markdown.

**Use the screenshot as your primary visual reference** to understand the layout, colors, typography, and overall design of the website. The screenshot shows exactly how the page should look.

**IMPORTANT: Image Handling**
- Do NOT use or reference real external image URLs.
- Instead, create a file named "placeholder.svg" at "/public/assets/placeholder.svg".
- The file must be included in the output as its own code block.
- The SVG should be a simple neutral gray rectangle, like:
  \`\`\`svg
  <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#e2e2e2"/>
  </svg>
  \`\`\`

**When generating code:**
- Replace all \`<img src="...">\` with: \`<img src="/assets/placeholder.svg" alt="placeholder" />\`
- If using Next.js Image component: \`<Image src="/assets/placeholder.svg" alt="placeholder" width={400} height={300} />\`

Always include the placeholder.svg file in your output file tree.
`;

const MAX_TEXT_SNIPPET_LENGTH = 16_000;

/**
 * Format a code snippet with a label and language, truncating if necessary.
 */
function formatSnippet(label: string, value: string, lang: string): string {
  return `${label}:\n\`\`\`${lang}\n${truncateText(value)}\n\`\`\``;
}

function truncateText(value: string): string {
  if (value.length <= MAX_TEXT_SNIPPET_LENGTH) return value;
  return `${value.slice(0, MAX_TEXT_SNIPPET_LENGTH)}\n<!-- truncated -->`;
}

/**
 * Crawl a website
 */
export async function webCrawl(
  args: WebCrawlArgs,
  ctx: AgentContext,
): Promise<string> {
  const { url } = args;

  ctx.onXmlStream?.(`<recoder-web-crawl>${escapeXmlContent(url)}`);

  try {
    // Call the web crawl API
    const response = await fetch('/api/tools/web-crawl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Web crawl failed: ${error}`);
    }

    const result: WebCrawlResult = await response.json();

    if (!result.markdown) {
      throw new Error('No content available from web crawl');
    }

    ctx.onXmlComplete?.(`<recoder-web-crawl>${escapeXmlContent(url)}</recoder-web-crawl>`);

    ctx.log?.(`Web crawl completed for: ${url}`, 'info');

    // Format the result for the agent
    let instructions = CLONE_INSTRUCTIONS;

    if (result.screenshot) {
      instructions += `\n\nScreenshot URL: ${result.screenshot}`;
    }

    instructions += '\n\n' + formatSnippet('Markdown snapshot', result.markdown, 'markdown');

    return instructions;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.onXmlComplete?.(`<recoder-web-crawl error="${escapeXmlContent(errorMessage)}">${escapeXmlContent(url)}</recoder-web-crawl>`);
    throw new Error(`Web crawl failed: ${errorMessage}`);
  }
}

// ============================================================================
// Tool Definition
// ============================================================================

export const webCrawlTool: ToolDefinition<WebCrawlArgs> = {
  name: 'web_crawl',
  description: DESCRIPTION,
  inputSchema: webCrawlSchema,
  defaultConsent: 'ask',

  getConsentPreview: (args) => `Crawl URL: "${args.url}"`,

  buildXml: (args, isComplete) => {
    if (!args.url) return undefined;
    let xml = `<recoder-web-crawl>${escapeXmlContent(args.url)}`;
    if (isComplete) {
      xml += '</recoder-web-crawl>';
    }
    return xml;
  },

  execute: webCrawl,
};
