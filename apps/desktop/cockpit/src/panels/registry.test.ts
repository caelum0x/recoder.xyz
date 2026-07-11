/**
 * Unit tests for the panel registry (panels/registry.ts).
 *
 * These tests verify the structural contract of the registry — that all expected
 * panels are registered, each entry has the required fields, and the load()
 * function is callable. They do NOT exercise the lazy-imported components
 * themselves (those have their own component tests).
 *
 * Test conventions follow the existing cockpit test suite:
 *  - vitest describe/it/expect (no globals — vitest.config.ts has globals:false)
 *  - node environment (no jsdom needed for a pure-data registry)
 *  - no mocks: the registry is plain data; we read it directly
 */
import { describe, expect, it } from 'vitest';
import {
  PANEL_REGISTRY,
  PRIMARY_PANEL_IDS,
  MORE_PANEL_IDS,
  getPanelById,
} from './registry';

/** The full set of panel ids the registry must expose (matches CockpitView). */
const EXPECTED_IDS = [
  'board',
  'sessions',
  'dmux',
  'substrates',
  'governance',
  'policy',
  'brain',
  'memory',
  'events',
  'connectors',
] as const;

describe('PANEL_REGISTRY structure', () => {
  it('registers all expected panel ids', () => {
    const registeredIds = PANEL_REGISTRY.map((p) => p.id);
    for (const id of EXPECTED_IDS) {
      expect(registeredIds).toContain(id);
    }
  });

  it('has no duplicate ids', () => {
    const ids = PANEL_REGISTRY.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every entry has a non-empty title and capability', () => {
    for (const entry of PANEL_REGISTRY) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.capability.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a load function', () => {
    for (const entry of PANEL_REGISTRY) {
      expect(typeof entry.load).toBe('function');
    }
  });

  it('healthKey is either a non-empty string or null (never undefined)', () => {
    for (const entry of PANEL_REGISTRY) {
      expect(entry.healthKey === null || typeof entry.healthKey === 'string').toBe(true);
      if (entry.healthKey !== null) {
        expect(entry.healthKey.length).toBeGreaterThan(0);
      }
    }
  });

  it('primary field is a boolean on every entry', () => {
    for (const entry of PANEL_REGISTRY) {
      expect(typeof entry.primary).toBe('boolean');
    }
  });
});

describe('PRIMARY_PANEL_IDS and MORE_PANEL_IDS', () => {
  it('board and sessions are primary', () => {
    expect(PRIMARY_PANEL_IDS).toContain('board');
    expect(PRIMARY_PANEL_IDS).toContain('sessions');
  });

  it('advanced panels are in the More group', () => {
    const moreExpected = ['dmux', 'substrates', 'governance', 'policy', 'brain', 'memory', 'events', 'connectors'];
    for (const id of moreExpected) {
      expect(MORE_PANEL_IDS).toContain(id);
    }
  });

  it('primary and more groups are disjoint', () => {
    const primarySet = new Set(PRIMARY_PANEL_IDS);
    for (const id of MORE_PANEL_IDS) {
      expect(primarySet.has(id)).toBe(false);
    }
  });

  it('primary + more covers every registered panel', () => {
    const allFromGroups = new Set([...PRIMARY_PANEL_IDS, ...MORE_PANEL_IDS]);
    for (const entry of PANEL_REGISTRY) {
      expect(allFromGroups.has(entry.id)).toBe(true);
    }
  });
});

describe('getPanelById', () => {
  it('returns the entry for a known id', () => {
    const entry = getPanelById('policy');
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('policy');
    expect(entry?.title).toBe('Rules');
  });

  it('returns undefined for an unknown id', () => {
    expect(getPanelById('does-not-exist')).toBeUndefined();
  });

  it('round-trips every registered id', () => {
    for (const entry of PANEL_REGISTRY) {
      const found = getPanelById(entry.id);
      expect(found).toBe(entry);
    }
  });
});

describe('panel load() functions', () => {
  it('each load() is a function that returns a thenable (Promise)', () => {
    for (const entry of PANEL_REGISTRY) {
      // We deliberately do NOT await — that would pull in all panel components
      // and their Preact dependencies at test time. We only verify the contract:
      // load() returns an object with a .then method (a Promise).
      const result = entry.load();
      expect(typeof result.then).toBe('function');
      // Consume the promise so it doesn't leak as an unhandled rejection.
      // The import will fail in node (no real bundler), but we only care about
      // the structural guarantee that load() is callable and returns a Promise.
      result.catch(() => undefined);
    }
  });
});
