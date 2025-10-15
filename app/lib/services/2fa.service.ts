import { authenticator } from 'otplib';
import { QRCodeSVG } from 'qrcode.react';
import crypto from 'crypto';
import { prisma } from '../prisma';

/**
 * Two-Factor Authentication Service
 * Implements TOTP (Time-based One-Time Password) for 2FA
 */

export class TwoFactorAuthService {
  /**
   * Generate a new secret for 2FA
   */
  static generateSecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * Generate QR code URL for authenticator apps
   */
  static generateQRCodeURL(email: string, secret: string): string {
    const issuer = 'recoder.xyz';
    return authenticator.keyuri(email, issuer, secret);
  }

  /**
   * Generate backup codes for 2FA recovery
   */
  static generateBackupCodes(count: number = 8): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Hash backup codes for storage
   */
  static hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Verify TOTP token
   */
  static verifyToken(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch (error) {
      return false;
    }
  }

  /**
   * Enable 2FA for user
   */
  static async enable2FA(userId: string, token: string): Promise<{
    success: boolean;
    backupCodes?: string[];
    message: string;
  }> {
    try {
      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (user.twoFactorEnabled) {
        return { success: false, message: '2FA is already enabled' };
      }

      if (!user.twoFactorSecret) {
        return { success: false, message: 'No 2FA secret found. Generate one first.' };
      }

      // Verify the token
      const isValid = this.verifyToken(token, user.twoFactorSecret);
      if (!isValid) {
        return { success: false, message: 'Invalid verification code' };
      }

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      const hashedCodes = backupCodes.map(code => this.hashBackupCode(code));

      // Enable 2FA
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          // Store backup codes in metadata (you might want a separate table)
          // For now, we'll store them as JSON in a new field
        },
      });

      // TODO: Store backup codes in separate table or encrypted field

      return {
        success: true,
        backupCodes,
        message: '2FA enabled successfully. Save your backup codes!',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to enable 2FA',
      };
    }
  }

  /**
   * Disable 2FA for user
   */
  static async disable2FA(userId: string, password: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (!user.twoFactorEnabled) {
        return { success: false, message: '2FA is not enabled' };
      }

      // TODO: Verify password before disabling

      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      });

      return {
        success: true,
        message: '2FA disabled successfully',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to disable 2FA',
      };
    }
  }

  /**
   * Setup 2FA - generate secret
   */
  static async setup2FA(userId: string): Promise<{
    success: boolean;
    secret?: string;
    qrCode?: string;
    message: string;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Generate new secret
      const secret = this.generateSecret();
      const qrCodeURL = this.generateQRCodeURL(user.email, secret);

      // Save secret (not enabled yet)
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: secret,
        },
      });

      return {
        success: true,
        secret,
        qrCode: qrCodeURL,
        message: 'Scan the QR code with your authenticator app',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to setup 2FA',
      };
    }
  }

  /**
   * Verify 2FA during login
   */
  static async verify2FALogin(userId: string, token: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return { success: false, message: '2FA is not enabled' };
      }

      // Verify token
      const isValid = this.verifyToken(token, user.twoFactorSecret);

      if (!isValid) {
        // TODO: Check backup codes
        return { success: false, message: 'Invalid verification code' };
      }

      return {
        success: true,
        message: '2FA verification successful',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to verify 2FA',
      };
    }
  }

  /**
   * Verify backup code
   */
  static async verifyBackupCode(userId: string, code: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // TODO: Implement backup code verification
      // This requires storing backup codes in database
      // and marking them as used when verified

      return {
        success: false,
        message: 'Backup code verification not implemented',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to verify backup code',
      };
    }
  }
}
