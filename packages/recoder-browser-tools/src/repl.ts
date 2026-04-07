/**
 * REPL tool — execute JavaScript on a page via Playwright.
 * Replaces sitegeist's chrome.userScripts with page.evaluate().
 */

import type { Page } from 'playwright';
import type { ReplResult } from './types.js';

/**
 * Execute JavaScript code in the context of the current page.
 * The code has access to the DOM and can return values.
 */
export async function executeOnPage(
  page: Page,
  code: string,
  options?: { timeout?: number },
): Promise<ReplResult> {
  const timeout = options?.timeout ?? 30_000;

  try {
    const result = await page.evaluate(
      async ({ code, timeout }) => {
        // Wrap user code in an async IIFE with timeout
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
          // Execute the code
          const fn = new Function('signal', `return (async () => { ${code} })()`);
          const output = await fn(controller.signal);

          clearTimeout(timer);

          // Convert result to string
          if (output === undefined) return { output: 'undefined' };
          if (output === null) return { output: 'null' };
          if (typeof output === 'object') return { output: JSON.stringify(output, null, 2) };
          return { output: String(output) };
        } catch (err: any) {
          clearTimeout(timer);
          return { output: `Error: ${err.message}` };
        }
      },
      { code, timeout },
    );

    return result as ReplResult;
  } catch (err: any) {
    return { output: `Playwright evaluate error: ${err.message}` };
  }
}

/**
 * Execute JavaScript that extracts data from the page.
 * Returns the extracted data as a string.
 */
export async function extractFromPage(
  page: Page,
  extractionCode: string,
): Promise<string> {
  try {
    const result = await page.evaluate(extractionCode);

    if (typeof result === 'string') return result;
    if (result === undefined || result === null) return '';
    return JSON.stringify(result, null, 2);
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

/**
 * Inject a skill's library code into the page context.
 * The skill's functions become available for subsequent evaluate calls.
 */
export async function injectSkill(page: Page, libraryCode: string): Promise<void> {
  await page.evaluate(libraryCode);
}
