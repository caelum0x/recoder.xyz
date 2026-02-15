import { authenticator } from 'otplib';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { encryptApiKey, decryptApiKey, verifyPassword } from '../crypto';

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
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Hash backup codes for storage
   */
  static hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code.toUpperCase().trim()).digest('hex');
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
   * Store hashed backup codes in the user's backupCodes field (encrypted JSON array)
   */
  private static async storeBackupCodes(userId: string, hashedCodes: string[]): Promise<void> {
    const codesJson = JSON.stringify(hashedCodes);
    const encrypted = encryptApiKey(codesJson);

    await prisma.users.update({
      where: { id: userId },
      data: {
        backupCodes: encrypted,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Retrieve and decrypt stored backup codes
   */
  private static async getStoredBackupCodes(userId: string): Promise<string[]> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { backupCodes: true },
    });

    if (!user?.backupCodes) return [];

    try {
      const decrypted = decryptApiKey(user.backupCodes);
      return JSON.parse(decrypted) as string[];
    } catch {
      return [];
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
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (user.twoFactorEnabled) {
        return { success: false, message: '2FA is already enabled' };
      }

      if (!user.totpSecret) {
        return { success: false, message: 'No 2FA secret found. Generate one first.' };
      }

      // Verify the token against the temp secret
      const secret = user.totpSecretTemp || user.totpSecret;
      const isValid = this.verifyToken(token, secret);
      if (!isValid) {
        return { success: false, message: 'Invalid verification code' };
      }

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      const hashedCodes = backupCodes.map(code => this.hashBackupCode(code));

      // Enable 2FA and persist the secret
      await prisma.users.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          totpSecret: secret,
          totpSecretTemp: null,
          twoFactorEnabledAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Store encrypted hashed backup codes
      await this.storeBackupCodes(userId, hashedCodes);

      return {
        success: true,
        backupCodes,
        message: '2FA enabled successfully. Save your backup codes!',
      };
    } catch (error) {
      console.error('[2FA] Failed to enable:', error);
      return { success: false, message: 'Failed to enable 2FA' };
    }
  }

  /**
   * Disable 2FA for user (requires password)
   */
  static async disable2FA(userId: string, password: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (!user.twoFactorEnabled) {
        return { success: false, message: '2FA is not enabled' };
      }

      // Verify password before disabling
      if (!user.password) {
        return { success: false, message: 'Password verification required. No password set on account.' };
      }

      const isPasswordValid = await verifyPassword(password, user.password);
      if (!isPasswordValid) {
        return { success: false, message: 'Invalid password' };
      }

      await prisma.users.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          totpSecret: null,
          totpSecretTemp: null,
          backupCodes: null,
          backupCodesTemp: null,
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        message: '2FA disabled successfully',
      };
    } catch (error) {
      console.error('[2FA] Failed to disable:', error);
      return { success: false, message: 'Failed to disable 2FA' };
    }
  }

  /**
   * Setup 2FA - generate secret (stored as temp until verified)
   */
  static async setup2FA(userId: string): Promise<{
    success: boolean;
    secret?: string;
    qrCode?: string;
    message: string;
  }> {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Generate new secret
      const secret = this.generateSecret();
      const qrCodeURL = this.generateQRCodeURL(user.email, secret);

      // Save as temp secret (not enabled yet - will be confirmed during enable2FA)
      await prisma.users.update({
        where: { id: userId },
        data: {
          totpSecretTemp: secret,
          twoFactorSetupAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        secret,
        qrCode: qrCodeURL,
        message: 'Scan the QR code with your authenticator app',
      };
    } catch (error) {
      console.error('[2FA] Failed to setup:', error);
      return { success: false, message: 'Failed to setup 2FA' };
    }
  }

  /**
   * Verify 2FA during login (TOTP or backup code)
   */
  static async verify2FALogin(userId: string, token: string): Promise<{
    success: boolean;
    message: string;
    usedBackupCode?: boolean;
  }> {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (!user.twoFactorEnabled || !user.totpSecret) {
        return { success: false, message: '2FA is not enabled' };
      }

      // Try TOTP first
      const isValid = this.verifyToken(token, user.totpSecret);
      if (isValid) {
        return { success: true, message: '2FA verification successful' };
      }

      // If TOTP fails, try as backup code
      const backupResult = await this.verifyBackupCode(userId, token);
      if (backupResult.success) {
        return {
          success: true,
          message: 'Verified with backup code. Consider generating new backup codes.',
          usedBackupCode: true,
        };
      }

      return { success: false, message: 'Invalid verification code' };
    } catch (error) {
      console.error('[2FA] Failed to verify login:', error);
      return { success: false, message: 'Failed to verify 2FA' };
    }
  }

  /**
   * Verify and consume a backup code
   */
  static async verifyBackupCode(userId: string, code: string): Promise<{
    success: boolean;
    message: string;
    remainingCodes?: number;
  }> {
    try {
      const storedCodes = await this.getStoredBackupCodes(userId);
      if (storedCodes.length === 0) {
        return { success: false, message: 'No backup codes available' };
      }

      const hashedInput = this.hashBackupCode(code);

      // Find matching code
      const matchIndex = storedCodes.findIndex(stored => {
        if (stored.length !== hashedInput.length) return false;
        return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(hashedInput));
      });

      if (matchIndex === -1) {
        return { success: false, message: 'Invalid backup code' };
      }

      // Remove the used code
      storedCodes.splice(matchIndex, 1);

      // Save updated codes back
      await this.storeBackupCodes(userId, storedCodes);

      return {
        success: true,
        message: 'Backup code verified',
        remainingCodes: storedCodes.length,
      };
    } catch (error) {
      console.error('[2FA] Failed to verify backup code:', error);
      return { success: false, message: 'Failed to verify backup code' };
    }
  }

  /**
   * Regenerate backup codes (requires TOTP verification)
   */
  static async regenerateBackupCodes(userId: string, token: string): Promise<{
    success: boolean;
    backupCodes?: string[];
    message: string;
  }> {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user || !user.twoFactorEnabled || !user.totpSecret) {
        return { success: false, message: '2FA is not enabled' };
      }

      // Require current TOTP to regenerate codes
      const isValid = this.verifyToken(token, user.totpSecret);
      if (!isValid) {
        return { success: false, message: 'Invalid verification code' };
      }

      const backupCodes = this.generateBackupCodes();
      const hashedCodes = backupCodes.map(c => this.hashBackupCode(c));

      await this.storeBackupCodes(userId, hashedCodes);

      return {
        success: true,
        backupCodes,
        message: 'New backup codes generated. Save them securely!',
      };
    } catch (error) {
      console.error('[2FA] Failed to regenerate backup codes:', error);
      return { success: false, message: 'Failed to regenerate backup codes' };
    }
  }
}
