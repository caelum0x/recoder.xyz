// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { validatePassword } from '@/lib/password-validation';

describe('validatePassword', () => {
  it('accepts strong passwords', () => {
    expect(validatePassword('Str0ng!Pass').valid).toBe(true);
  });

  it('returns actionable errors for weak passwords', () => {
    const result = validatePassword('weak');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
    expect(result.errors).toContain('Password must include an uppercase letter');
    expect(result.errors).toContain('Password must include a number');
    expect(result.errors).toContain('Password must include a special character');
  });
});
