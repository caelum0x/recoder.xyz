import { describe, expect, it } from 'vitest';
import { detectLocaleFromPathname, localizePath, stripLocalePrefix } from '../locale-paths';

describe('locale-paths', () => {
  it('detects the leading locale segment', () => {
    expect(detectLocaleFromPathname('/tr/dashboard')).toBe('tr');
    expect(detectLocaleFromPathname('/en/docs/getting-started')).toBe('en');
    expect(detectLocaleFromPathname('/dashboard')).toBeNull();
  });

  it('strips locale prefixes without breaking root paths', () => {
    expect(stripLocalePrefix('/tr/dashboard')).toBe('/dashboard');
    expect(stripLocalePrefix('/en')).toBe('/');
    expect(stripLocalePrefix('/settings')).toBe('/settings');
  });

  it('reapplies the current locale to internal app paths', () => {
    expect(localizePath('/dashboard', 'tr')).toBe('/tr/dashboard');
    expect(localizePath('/tr/dashboard', 'tr')).toBe('/tr/dashboard');
    expect(localizePath('/', 'tr')).toBe('/tr');
    expect(localizePath('https://agents.recoder.xyz', 'tr')).toBe('https://agents.recoder.xyz');
  });
});
