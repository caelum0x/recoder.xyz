/**
 * Skill type — per-domain JavaScript injection library.
 * Extracted from sitegeist's SkillsStore.
 */
export interface Skill {
  name: string;
  domainPatterns: string[];
  shortDescription: string;
  description: string;
  createdAt: string;
  lastUpdated: string;
  examples: string;
  library: string;
}

/**
 * Navigate action result.
 */
export interface NavigateResult {
  url: string;
  title: string;
  skills?: Skill[];
}

/**
 * REPL execution result.
 */
export interface ReplResult {
  output: string;
  files?: Array<{ name: string; data: string; mimeType: string }>;
}

/**
 * Browser context abstraction — can be backed by Playwright Page or Chrome tabs.
 */
export interface BrowserContext {
  goto(url: string): Promise<void>;
  currentUrl(): Promise<string>;
  currentTitle(): Promise<string>;
  evaluate<T>(code: string): Promise<T>;
  waitForLoad(): Promise<void>;
}
