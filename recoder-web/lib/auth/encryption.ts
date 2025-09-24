import crypto from 'crypto';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Encrypt data using AES-256-GCM
 */
export function encryptData(data: string, key: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive key from password using PBKDF2
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
  
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);
  cipher.setAAD(Buffer.from('2fa-secret', 'utf8'));
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Combine salt, iv, tag, and encrypted data
  const result = Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')]);
  
  return result.toString('base64');
}

/**
 * Decrypt data using AES-256-GCM
 */
export function decryptData(encryptedData: string, key: string): string {
  const data = Buffer.from(encryptedData, 'base64');
  
  // Extract components
  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  // Derive key from password using PBKDF2
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
  
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(tag);
  decipher.setAAD(Buffer.from('2fa-secret', 'utf8'));
  
  let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Hash backup code using bcrypt
 */
export function hashBackupCode(code: string): string {
  const bcrypt = require('bcrypt');
  return bcrypt.hashSync(code, 10);
}

/**
 * Verify backup code against hash
 */
export function verifyBackupCode(code: string, hash: string): boolean {
  const bcrypt = require('bcrypt');
  return bcrypt.compareSync(code, hash);
}