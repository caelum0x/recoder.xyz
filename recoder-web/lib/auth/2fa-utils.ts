// Two-Factor Authentication Utilities
import crypto from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { 
  TwoFactorSetupResponse, 
  TwoFactorVerifyRequest, 
  TwoFactorVerifyResponse,
  BackupCode,
  TwoFactorError,
  TwoFactorErrorCodes,
  DEFAULT_TOTP_CONFIG,
  TOTPConfig
} from './2fa-types';

// Configure TOTP settings
import { HashAlgorithms } from 'otplib/core';

authenticator.options = {
  algorithm: HashAlgorithms[DEFAULT_TOTP_CONFIG.algorithm as keyof typeof HashAlgorithms],
  digits: DEFAULT_TOTP_CONFIG.digits,
  period: DEFAULT_TOTP_CONFIG.period,
  window: 1, // Allow 1 time window of drift (30 seconds)
};

/**
 * Generate a new TOTP secret
 */
export function generateTOTPSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Generate TOTP setup URL for QR code
 */
export function generateTOTPSetupURL(secret: string, email: string, config: TOTPConfig = DEFAULT_TOTP_CONFIG): string {
  return authenticator.keyuri(email, config.issuer, secret);
}

/**
 * Generate QR code for TOTP setup
 */
export async function generateTOTPQRCode(secret: string, email: string, config: TOTPConfig = DEFAULT_TOTP_CONFIG): Promise<string> {
  const otpauth = generateTOTPSetupURL(secret, email, config);
  return QRCode.toDataURL(otpauth);
}

/**
 * Verify TOTP code
 */
export function verifyTOTP(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch (error) {
    console.error('TOTP verification error:', error);
    return false;
  }
}

/**
 * Generate backup codes
 */
export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Hash backup codes for storage
 */
export function hashBackupCodes(codes: string[]): string[] {
  return codes.map(code => crypto.createHash('sha256').update(code).digest('hex'));
}

/**
 * Verify backup code
 */
export function verifyBackupCode(inputCode: string, hashedCodes: string[]): { valid: boolean; index: number } {
  const inputHash = crypto.createHash('sha256').update(inputCode.toUpperCase()).digest('hex');
  
  for (let i = 0; i < hashedCodes.length; i++) {
    if (inputHash === hashedCodes[i]) {
      return { valid: true, index: i };
    }
  }
  
  return { valid: false, index: -1 };
}

/**
 * Parse backup codes from JSON string
 */
export function parseBackupCodes(backupCodesJson: string | null): BackupCode[] {
  if (!backupCodesJson) return [];
  
  try {
    const codes = JSON.parse(backupCodesJson);
    return Array.isArray(codes) ? codes : [];
  } catch (error) {
    console.error('Error parsing backup codes:', error);
    return [];
  }
}

/**
 * Serialize backup codes to JSON string
 */
export function serializeBackupCodes(codes: BackupCode[]): string {
  return JSON.stringify(codes);
}

/**
 * Generate setup ID for 2FA setup session
 */
export function generateSetupId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Check if setup has expired (15 minutes)
 */
export function isSetupExpired(setupAt: Date | null): boolean {
  if (!setupAt) return true;
  
  const now = new Date();
  const setupTime = new Date(setupAt);
  const diffMinutes = (now.getTime() - setupTime.getTime()) / (1000 * 60);
  
  return diffMinutes > 15;
}

/**
 * Encrypt sensitive data (TOTP secret)
 */
export function encryptData(data: string, key: string): string {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive data (TOTP secret)
 */
export function decryptData(encryptedData: string, key: string): string {
  const algorithm = 'aes-256-gcm';
  const parts = encryptedData.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipher(algorithm, key);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Validate TOTP code format
 */
export function isValidTOTPCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Validate backup code format
 */
export function isValidBackupCode(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}

/**
 * Generate 2FA setup response
 */
export async function generateSetupResponse(
  secret: string, 
  email: string, 
  backupCodes: string[],
  setupId: string
): Promise<TwoFactorSetupResponse> {
  const qrCode = await generateTOTPQRCode(secret, email);
  
  return {
    secret,
    qrCode,
    backupCodes,
    setupId,
  };
}

/**
 * Handle 2FA verification
 */
export async function handleVerification(
  request: TwoFactorVerifyRequest,
  userSecret: string | null,
  backupCodesJson: string | null,
  isSetup: boolean = false
): Promise<TwoFactorVerifyResponse> {
  // Try TOTP verification first
  if (request.code && isValidTOTPCode(request.code)) {
    if (!userSecret) {
      throw new TwoFactorError('TOTP not configured', TwoFactorErrorCodes.NOT_ENABLED);
    }
    
    const isValid = verifyTOTP(request.code, userSecret);
    if (isValid) {
      return {
        success: true,
        message: 'TOTP verification successful',
      };
    }
  }
  
  // Try backup code verification if TOTP failed
  if (request.code && isValidBackupCode(request.code)) {
    const backupCodes = parseBackupCodes(backupCodesJson);
    const unusedCodes = backupCodes.filter(code => !code.used);
    
    if (unusedCodes.length === 0) {
      throw new TwoFactorError('No unused backup codes available', TwoFactorErrorCodes.NO_BACKUP_CODES);
    }
    
    const hashedCodes = unusedCodes.map(code => 
      crypto.createHash('sha256').update(code.code).digest('hex')
    );
    
    const verification = verifyBackupCode(request.code, hashedCodes);
    
    if (verification.valid) {
      // Mark backup code as used
      unusedCodes[verification.index].used = true;
      unusedCodes[verification.index].usedAt = new Date();
      
      return {
        success: true,
        message: 'Backup code verification successful',
        backupCodeUsed: true,
      };
    }
  }
  
  throw new TwoFactorError('Invalid verification code', TwoFactorErrorCodes.INVALID_CODE);
}

/**
 * Get encryption key from environment
 */
export function getEncryptionKey(): string {
  const key = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('TWO_FACTOR_ENCRYPTION_KEY environment variable is not set');
  }
  return key;
}