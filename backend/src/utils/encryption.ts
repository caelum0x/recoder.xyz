/**
 * Encryption Utilities
 * Handles encryption/decryption of sensitive data like API keys
 */

import crypto from 'crypto';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Get encryption key from environment
 * Derives a key using PBKDF2 if needed
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    logger.error('ENCRYPTION_KEY environment variable is not set');
    throw new Error('ENCRYPTION_KEY_MISSING');
  }

  // If key is already 32 bytes (64 hex chars), use it directly
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }

  // Otherwise, derive a key using PBKDF2
  const salt = Buffer.from(process.env.ENCRYPTION_SALT || 'recoder-salt-default', 'utf8');
  return crypto.pbkdf2Sync(key, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt sensitive data (like API keys)
 * Format: salt:iv:tag:encrypted_data (all hex encoded)
 */
export async function encryptApiKey(plaintext: string): Promise<string> {
  try {
    if (!plaintext) {
      throw new Error('Cannot encrypt empty string');
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Format: iv:tag:encrypted_data
    const result = `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
    
    logger.debug('API key encrypted successfully');
    return result;
  } catch (error) {
    logger.error('Failed to encrypt API key', { error });
    throw new Error('ENCRYPTION_FAILED');
  }
}

/**
 * Decrypt encrypted data
 */
export async function decryptApiKey(encrypted: string): Promise<string> {
  try {
    if (!encrypted) {
      throw new Error('Cannot decrypt empty string');
    }

    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, tagHex, encryptedData] = parts;
    
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    logger.debug('API key decrypted successfully');
    return decrypted;
  } catch (error) {
    logger.error('Failed to decrypt API key', { error });
    throw new Error('DECRYPTION_FAILED');
  }
}

/**
 * Hash sensitive data (one-way, for verification only)
 */
export function hashSensitiveData(data: string): string {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate API key prefix (first 12 chars for display)
 */
export function generateApiKeyPrefix(apiKey: string): string {
  if (apiKey.length < 12) {
    return apiKey;
  }
  return apiKey.substring(0, 12);
}

/**
 * Mask API key for logging (show only prefix)
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return '****';
  }
  
  const prefix = apiKey.substring(0, 8);
  return `${prefix}${'*'.repeat(Math.min(apiKey.length - 8, 20))}`;
}

/**
 * Validate API key format (basic checks)
 */
export function validateApiKeyFormat(apiKey: string): boolean {
  // OpenRouter keys start with 'sk-or-' and are at least 40 chars
  if (apiKey.startsWith('sk-or-')) {
    return apiKey.length >= 40;
  }
  
  // Other formats
  return apiKey.length >= 20;
}

/**
 * Generate encryption key for .env (run once during setup)
 */
export function generateEncryptionKey(): string {
  const key = crypto.randomBytes(KEY_LENGTH);
  return key.toString('hex');
}

/**
 * Test encryption/decryption
 */
export async function testEncryption(): Promise<boolean> {
  try {
    const testData = 'test-api-key-12345';
    const encrypted = await encryptApiKey(testData);
    const decrypted = await decryptApiKey(encrypted);
    
    const success = decrypted === testData;
    
    if (success) {
      logger.info('Encryption test passed');
    } else {
      logger.error('Encryption test failed: decrypted data does not match');
    }
    
    return success;
  } catch (error) {
    logger.error('Encryption test failed with error', { error });
    return false;
  }
}
