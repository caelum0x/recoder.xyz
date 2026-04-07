/**
 * @recoder/browser-tools
 *
 * Browser automation tools for Recoder agents.
 * Extracted from sitegeist (badlogic/sitegeist), chrome APIs replaced with Playwright.
 *
 * Provides:
 * - SkillsStore: domain-aware JS skill injection with glob matching
 * - navigateTo: Playwright-backed page navigation with skill discovery
 * - executeOnPage: JS REPL via page.evaluate()
 * - extractFromPage: data extraction from any page
 * - injectSkill: inject skill library code into page context
 */

export type { Skill, NavigateResult, ReplResult, BrowserContext } from './types.js';
export { SkillsStore, matchesAnyPattern } from './skills-store.js';
export { navigateTo, getCurrentPage, listPages } from './navigate.js';
export { executeOnPage, extractFromPage, injectSkill } from './repl.js';
