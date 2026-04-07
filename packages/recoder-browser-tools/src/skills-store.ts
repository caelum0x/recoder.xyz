/**
 * Domain-aware skill store with glob matching.
 * Extracted from sitegeist's SkillsStore — zero chrome dependencies.
 */

import { minimatch } from 'minimatch';
import type { Skill } from './types.js';

/**
 * Match a URL against an array of domain glob patterns.
 * Handles www. stripping and path-aware matching.
 */
export function matchesAnyPattern(url: string, patterns: string[]): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const fullPath = hostname + parsed.pathname;

    for (const pattern of patterns) {
      const cleanPattern = pattern.replace(/^www\./, '');

      // If pattern contains a slash, match against hostname + path
      if (cleanPattern.includes('/')) {
        if (minimatch(fullPath, cleanPattern)) return true;
      } else {
        // Domain-only pattern
        if (minimatch(hostname, cleanPattern)) return true;
      }
    }
  } catch {
    // Invalid URL — no match
  }

  return false;
}

/**
 * In-memory skill store with JSON file persistence.
 */
export class SkillsStore {
  private skills = new Map<string, Skill>();

  /** Load skills from a plain array (e.g. parsed from JSON file). */
  loadFromArray(skills: Skill[]): void {
    this.skills.clear();
    for (const skill of skills) {
      this.skills.set(skill.name, skill);
    }
  }

  /** Get all skills. */
  getAll(): Skill[] {
    return [...this.skills.values()];
  }

  /** Get a skill by name. */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /** Save or update a skill. */
  save(skill: Skill): void {
    this.skills.set(skill.name, {
      ...skill,
      lastUpdated: new Date().toISOString(),
    });
  }

  /** Delete a skill by name. */
  delete(name: string): boolean {
    return this.skills.delete(name);
  }

  /** Find skills whose domain patterns match the given URL. */
  getSkillsForUrl(url: string): Skill[] {
    return this.getAll().filter((skill) =>
      matchesAnyPattern(url, skill.domainPatterns),
    );
  }

  /** Export all skills as a JSON-serializable array. */
  toJSON(): Skill[] {
    return this.getAll();
  }
}
