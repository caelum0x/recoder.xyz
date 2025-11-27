import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.API_KEY_ENCRYPTION_SECRET;
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.warn('WARNING: ENCRYPTION_KEY is not set or too short. API keys will not be encrypted securely.');
}

/**
 * Encrypt sensitive data (like API keys) using AES-256-GCM
 * @param text - Plain text to encrypt
 * @returns Base64 encoded encrypted string (includes IV and auth tag)
 */
export function encrypt(text: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // Generate random initialization vector
  const iv = crypto.randomBytes(16);

  // Create cipher
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 32)), // Ensure 32 bytes
    iv
  );

  // Encrypt the text
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final()
  ]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine IV + authTag + encrypted data
  const result = Buffer.concat([iv, authTag, encrypted]);

  return result.toString('base64');
}

/**
 * Decrypt encrypted data
 * @param encryptedData - Base64 encoded encrypted string
 * @returns Decrypted plain text
 */
export function decrypt(encryptedData: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // Decode from base64
  const buffer = Buffer.from(encryptedData, 'base64');

  // Extract components
  const iv = buffer.subarray(0, 16);
  const authTag = buffer.subarray(16, 32);
  const encrypted = buffer.subarray(32);

  // Create decipher
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
    iv
  );

  // Set auth tag
  decipher.setAuthTag(authTag);

  // Decrypt
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Get display-safe version of API key (shows only prefix)
 * @param apiKey - Full API key
 * @returns Masked version (e.g., 'sk-or-v1-***')
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';

  // For OpenRouter keys: sk-or-v1-XXXX -> show sk-or-v1-***
  if (apiKey.startsWith('sk-or-')) {
    const parts = apiKey.split('-');
    if (parts.length >= 3) {
      return `${parts[0]}-${parts[1]}-${parts[2]}-***`;
    }
  }

  // For other keys: sk-XXXX -> show sk-***
  if (apiKey.startsWith('sk-')) {
    return `${apiKey.substring(0, 8)}***`;
  }

  // Generic: show first 8 chars
  return `${apiKey.substring(0, 8)}***`;
}

/**
 * Validate API key format
 * @param apiKey - API key to validate
 * @param provider - Provider name
 * @returns true if format is valid
 */
export function validateApiKeyFormat(apiKey: string, provider: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  switch (provider.toLowerCase()) {
    case 'openrouter':
      return apiKey.startsWith('sk-or-v1-') && apiKey.length > 20;

    case 'anthropic':
      return apiKey.startsWith('sk-ant-') && apiKey.length > 20;

    case 'openai':
      return apiKey.startsWith('sk-') && apiKey.length > 20;

    case 'groq':
      return apiKey.startsWith('gsk_') && apiKey.length > 20;

    case 'google':
      // Google API keys don't have a standard prefix
      return apiKey.length > 30;

    default:
      // Generic validation
      return apiKey.length > 10;
  }
}
