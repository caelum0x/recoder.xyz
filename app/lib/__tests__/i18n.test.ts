// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveMessagesLocale } from '@/i18n';

describe('resolveMessagesLocale', () => {
  it('keeps the Turkey route but serves English copy', () => {
    expect(resolveMessagesLocale('tr')).toBe('en');
  });

  it('leaves other locales unchanged', () => {
    expect(resolveMessagesLocale('en')).toBe('en');
    expect(resolveMessagesLocale('de')).toBe('de');
  });
});
