import { describe, expect, it } from 'vitest';
import {
  dataStoreRegistry,
  getProviderDefinition,
  isDataStoreProvider,
  parseConfiguration,
  safeParseConfiguration,
  getAllProviders,
  getAllProviderDefinitions,
} from './index';

describe('dataStoreRegistry', () => {
  it('should contain postgres provider', () => {
    const postgres = dataStoreRegistry.find((p) => p.provider === 'postgres');
    expect(postgres).toBeDefined();
    expect(postgres?.label).toBe('PostgreSQL');
  });

  it('should have configuration schema for each provider', () => {
    for (const provider of dataStoreRegistry) {
      expect(provider.configurationSchema).toBeDefined();
      expect(typeof provider.configurationSchema.safeParse).toBe('function');
    }
  });
});

describe('isDataStoreProvider', () => {
  it('should return true for valid provider', () => {
    expect(isDataStoreProvider('postgres')).toBe(true);
  });

  it('should return false for invalid provider string', () => {
    expect(isDataStoreProvider('mysql')).toBe(false);
    expect(isDataStoreProvider('mongodb')).toBe(false);
    expect(isDataStoreProvider('')).toBe(false);
  });

  it('should return false for non-string values', () => {
    expect(isDataStoreProvider(123)).toBe(false);
    expect(isDataStoreProvider(null)).toBe(false);
    expect(isDataStoreProvider(undefined)).toBe(false);
    expect(isDataStoreProvider({})).toBe(false);
    expect(isDataStoreProvider([])).toBe(false);
    expect(isDataStoreProvider(true)).toBe(false);
  });
});

describe('getProviderDefinition', () => {
  it('should return definition for valid provider', () => {
    const def = getProviderDefinition('postgres');

    expect(def.provider).toBe('postgres');
    expect(def.label).toBe('PostgreSQL');
    expect(def.configurationSchema).toBeDefined();
  });

  it('should throw for unknown provider', () => {
    // @ts-expect-error Testing invalid provider
    expect(() => getProviderDefinition('mysql')).toThrow(
      'Unknown data store provider: mysql'
    );
  });
});

describe('parseConfiguration', () => {
  describe('with postgres provider', () => {
    it('should parse valid configuration', () => {
      const config = {
        connectionStringSecretId: 'secret_123',
      };

      const result = parseConfiguration('postgres', config);

      expect(result.connectionStringSecretId).toBe('secret_123');
    });

    it('should throw when connectionStringSecretId is missing', () => {
      const config = {};

      expect(() => parseConfiguration('postgres', config)).toThrow();
    });

    it('should throw when connectionStringSecretId is empty', () => {
      const config = {
        connectionStringSecretId: '',
      };

      expect(() => parseConfiguration('postgres', config)).toThrow();
    });

    it('should throw when connectionStringSecretId is not a string', () => {
      const config = {
        connectionStringSecretId: 123,
      };

      expect(() => parseConfiguration('postgres', config)).toThrow();
    });

    it('should ignore unknown keys (strip mode)', () => {
      const config = {
        connectionStringSecretId: 'secret_123',
        unknownKey: 'should be ignored',
      };

      const result = parseConfiguration('postgres', config);

      expect(result.connectionStringSecretId).toBe('secret_123');
      expect('unknownKey' in result).toBe(false);
    });
  });
});

describe('safeParseConfiguration', () => {
  describe('with postgres provider', () => {
    it('should return success for valid configuration', () => {
      const config = {
        connectionStringSecretId: 'secret_456',
      };

      const result = safeParseConfiguration('postgres', config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.connectionStringSecretId).toBe('secret_456');
      }
    });

    it('should return failure for invalid configuration', () => {
      const config = {
        connectionStringSecretId: '',
      };

      const result = safeParseConfiguration('postgres', config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should return failure for missing required fields', () => {
      const config = {};

      const result = safeParseConfiguration('postgres', config);

      expect(result.success).toBe(false);
    });
  });
});

describe('getAllProviders', () => {
  it('should return array of provider identifiers', () => {
    const providers = getAllProviders();

    expect(Array.isArray(providers)).toBe(true);
    expect(providers).toContain('postgres');
  });

  it('should return a new array each time', () => {
    const providers1 = getAllProviders();
    const providers2 = getAllProviders();

    expect(providers1).not.toBe(providers2);
    expect(providers1).toEqual(providers2);
  });
});

describe('getAllProviderDefinitions', () => {
  it('should return all provider definitions', () => {
    const definitions = getAllProviderDefinitions();

    expect(definitions).toBe(dataStoreRegistry);
    expect(definitions.length).toBeGreaterThan(0);
  });

  it('should include all required properties for each definition', () => {
    const definitions = getAllProviderDefinitions();

    for (const def of definitions) {
      expect(def.provider).toBeDefined();
      expect(typeof def.provider).toBe('string');
      expect(def.label).toBeDefined();
      expect(typeof def.label).toBe('string');
      expect(def.configurationSchema).toBeDefined();
    }
  });
});
