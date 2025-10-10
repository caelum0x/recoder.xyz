/**
 * Cryptography utilities for API key encryption
 * Securely encrypt and decrypt sensitive user API keys
 */

import crypto from 'crypto';

// Get encryption key from environment (must be 64 hex characters = 32 bytes)
const getEncryptionKey = (): Buffer => {
  const key = process.env.API_KEY_ENCRYPTION_SECRET;
  
  if (!key) {
    // Development fallback (NEVER use in production)
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  Using development encryption key. Set API_KEY_ENCRYPTION_SECRET in production!');
      return Buffer.from('0'.repeat(64), 'hex');
    }
    throw new Error('API_KEY_ENCRYPTION_SECRET is required');
  }
  
  if (key.length !== 64) {
    throw new Error('API_KEY_ENCRYPTION_SECRET must be 64 hex characters (32 bytes)');
  }
  
  return Buffer.from(key, 'hex');
};

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt an API key for secure storage
 * @param apiKey The plaintext API key
 * @returns Encrypted string in format: iv:authTag:encrypted
 */
export function encryptApiKey(apiKey: string): string {
  if (!apiKey) {
    throw new Error('API key cannot be empty');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted
  ].join(':');
}

/**
 * Decrypt an API key from storage
 * @param encryptedKey The encrypted string in format: iv:authTag:encrypted
 * @returns The plaintext API key
 */
export function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey) {
    throw new Error('Encrypted key cannot be empty');
  }

  const parts = encryptedKey.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Hash a password using bcrypt
 * @param password The plaintext password
 * @returns The hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 10);
}

/**
 * Verify a password against a hash
 * @param password The plaintext password
 * @param hash The hashed password
 * @returns True if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hash);
}

/**
 * Mask an API key for display (show only prefix and last 4 chars)
 * @param apiKey The API key to mask
 * @returns Masked version like "rck_abc...xyz1"
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 12) {
    return '***';
  }
  
  const prefix = apiKey.substring(0, 8);
  const suffix = apiKey.substring(apiKey.length - 4);
  return `${prefix}...${suffix}`;
}

/**
 * Generate a cryptographically secure random token
 * @param prefix Optional prefix for the token
 * @returns Random token string
 */
export function generateSecureToken(prefix: string = ''): string {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return prefix ? `${prefix}_${randomBytes}` : randomBytes;
}

/**
 * Generate encryption key for setup
 * Run this once to generate API_KEY_ENCRYPTION_SECRET
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
