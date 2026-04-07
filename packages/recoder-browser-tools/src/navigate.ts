/**
 * Navigate tool — Playwright-backed browser navigation.
 * Extracted from sitegeist's NavigateTool, chrome.tabs replaced with Playwright Page.
 */

import type { Page } from 'playwright';
import type { NavigateResult, Skill } from './types.js';
import type { SkillsStore } from './skills-store.js';

export interface NavigateOptions {
  page: Page;
  skillsStore?: SkillsStore;
}

/**
 * Navigate to a URL and return page info + matching skills.
 */
export async function navigateTo(
  url: string,
  options: NavigateOptions,
): Promise<NavigateResult> {
  const { page, skillsStore } = options;

  // Ensure URL has protocol
  const fullUrl = url.startsWith('http') ? url : `https://${url}`;

  await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const currentUrl = page.url();
  const title = await page.title();

  // Find matching skills for this domain
  const skills = skillsStore?.getSkillsForUrl(currentUrl);

  return { url: currentUrl, title, skills };
}

/**
 * Get current page info.
 */
export async function getCurrentPage(page: Page): Promise<{ url: string; title: string }> {
  return {
    url: page.url(),
    title: await page.title(),
  };
}

/**
 * List all open pages in the browser context.
 */
export async function listPages(page: Page): Promise<Array<{ url: string; title: string }>> {
  const context = page.context();
  const pages = context.pages();

  return Promise.all(
    pages.map(async (p) => ({
      url: p.url(),
      title: await p.title(),
    })),
  );
}
