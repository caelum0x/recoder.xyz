// Two-Factor Authentication Types and Interfaces

export interface TwoFactorSetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
  setupId: string;
}

export interface TwoFactorVerifyRequest {
  code: string;
  setupId?: string;
  isSetup?: boolean;
}

export interface TwoFactorVerifyResponse {
  success: boolean;
  message?: string;
  backupCodeUsed?: boolean;
}

export interface TwoFactorStatusResponse {
  enabled: boolean;
  setupComplete: boolean;
  backupCodesRemaining: number;
  enabledAt?: Date;
}

export interface BackupCode {
  code: string;
  used: boolean;
  usedAt?: Date;
}

export interface TwoFactorBackupCodesResponse {
  codes: string[];
  count: number;
}

export interface TwoFactorDisableRequest {
  code?: string;
  backupCode?: string;
}

// TOTP Configuration
export interface TOTPConfig {
  issuer: string;
  label: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: number;
  period: number;
}

// Default TOTP configuration
export const DEFAULT_TOTP_CONFIG: TOTPConfig = {
  issuer: 'ReCoder',
  label: 'ReCoder',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
};

// Error types
export class TwoFactorError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'TwoFactorError';
  }
}

export const TwoFactorErrorCodes = {
  INVALID_CODE: 'INVALID_CODE',
  CODE_EXPIRED: 'CODE_EXPIRED',
  SETUP_NOT_FOUND: 'SETUP_NOT_FOUND',
  ALREADY_ENABLED: 'ALREADY_ENABLED',
  NOT_ENABLED: 'NOT_ENABLED',
  INVALID_BACKUP_CODE: 'INVALID_BACKUP_CODE',
  NO_BACKUP_CODES: 'NO_BACKUP_CODES',
  SETUP_EXPIRED: 'SETUP_EXPIRED',
} as const;

export type TwoFactorErrorCode = typeof TwoFactorErrorCodes[keyof typeof TwoFactorErrorCodes];