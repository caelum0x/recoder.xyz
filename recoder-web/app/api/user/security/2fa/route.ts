// Two-factor authentication API endpoint for security settings
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { randomBytes } from 'crypto';

interface TwoFactorSetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
  manualEntryKey: string;
}

interface TwoFactorStatusResponse {
  enabled: boolean;
  backupCodesRemaining?: number;
  setupDate?: string;
}

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mock 2FA status - in production, these fields would be added to UserProfile
    const status: TwoFactorStatusResponse = {
      enabled: false, // Mock value
      backupCodesRemaining: undefined,
      setupDate: undefined,
    };

    return Response.json(status);
  } catch (error) {
    console.error('2FA status error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, token, backupCode } = await request.json();

    switch (action) {
      case 'setup':
        return await setupTwoFactor(session.user.id);
      
      case 'verify':
        if (!token) {
          return Response.json({ error: 'Token is required' }, { status: 400 });
        }
        return await verifyAndEnableTwoFactor(session.user.id, token);
      
      case 'disable':
        if (!token && !backupCode) {
          return Response.json({ error: 'Token or backup code is required' }, { status: 400 });
        }
        return await disableTwoFactor(session.user.id, token, backupCode);
      
      case 'regenerate-backup-codes':
        if (!token && !backupCode) {
          return Response.json({ error: 'Token or backup code is required' }, { status: 400 });
        }
        return await regenerateBackupCodes(session.user.id, token, backupCode);
      
      case 'verify-login':
        if (!token && !backupCode) {
          return Response.json({ error: 'Token or backup code is required' }, { status: 400 });
        }
        return await verifyTwoFactorLogin(session.user.id, token, backupCode);
      
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('2FA API error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function setupTwoFactor(userId: string): Promise<Response> {
  try {
    // Generate a new secret
    const secret = speakeasy.generateSecret({
      name: `Recoder.xyz (${userId})`,
      issuer: 'Recoder.xyz',
      length: 32,
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = generateBackupCodes();

    // In production, you would store these in a separate 2FA table or extend UserProfile
    console.log(`2FA setup for user ${userId}`, { secret: '[REDACTED]', backupCodes: '[REDACTED]' });

    const response: TwoFactorSetupResponse = {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes,
      manualEntryKey: secret.base32,
    };

    return Response.json(response);
  } catch (error) {
    console.error('2FA setup error:', error);
    return Response.json({ error: 'Failed to setup 2FA' }, { status: 500 });
  }
}

async function verifyAndEnableTwoFactor(userId: string, token: string): Promise<Response> {
  try {
    // Mock verification - in production, you would retrieve the stored secret
    // For demo purposes, assume verification succeeds if token has 6 digits
    const verified = /^\d{6}$/.test(token.replace(/\s/g, ''));

    if (!verified) {
      return Response.json({ error: 'Invalid token' }, { status: 400 });
    }

    // Mock enabling 2FA
    console.log(`2FA enabled for user ${userId}`);

    const mockBackupCodes = generateBackupCodes();

    return Response.json({ 
      success: true, 
      message: '2FA enabled successfully',
      backupCodes: mockBackupCodes 
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    return Response.json({ error: 'Failed to verify 2FA' }, { status: 500 });
  }
}

async function disableTwoFactor(userId: string, token?: string, backupCode?: string): Promise<Response> {
  try {
    // Mock verification - in production, check against stored data
    let verified = false;

    if (token) {
      // Verify with TOTP token (mock)
      verified = /^\d{6}$/.test(token.replace(/\s/g, ''));
    } else if (backupCode) {
      // Verify with backup code (mock)
      verified = /^[A-F0-9]{4}-[A-F0-9]{4}$/.test(backupCode.trim());
    }

    if (!verified) {
      return Response.json({ error: 'Invalid token or backup code' }, { status: 400 });
    }

    // Mock disabling 2FA
    console.log(`2FA disabled for user ${userId}`);

    return Response.json({ 
      success: true, 
      message: '2FA disabled successfully' 
    });
  } catch (error) {
    console.error('2FA disable error:', error);
    return Response.json({ error: 'Failed to disable 2FA' }, { status: 500 });
  }
}

async function regenerateBackupCodes(userId: string, token?: string, backupCode?: string): Promise<Response> {
  try {
    // Mock verification
    let verified = false;

    if (token) {
      verified = /^\d{6}$/.test(token.replace(/\s/g, ''));
    } else if (backupCode) {
      verified = /^[A-F0-9]{4}-[A-F0-9]{4}$/.test(backupCode.trim());
    }

    if (!verified) {
      return Response.json({ error: 'Invalid token or backup code' }, { status: 400 });
    }

    // Generate new backup codes
    const newBackupCodes = generateBackupCodes();

    console.log(`Backup codes regenerated for user ${userId}`);

    return Response.json({ 
      success: true, 
      message: 'Backup codes regenerated successfully',
      backupCodes: newBackupCodes 
    });
  } catch (error) {
    console.error('Backup codes regeneration error:', error);
    return Response.json({ error: 'Failed to regenerate backup codes' }, { status: 500 });
  }
}

async function verifyTwoFactorLogin(userId: string, token?: string, backupCode?: string): Promise<Response> {
  try {
    // Mock verification for login
    let verified = false;

    if (token) {
      verified = /^\d{6}$/.test(token.replace(/\s/g, ''));
    } else if (backupCode) {
      verified = /^[A-F0-9]{4}-[A-F0-9]{4}$/.test(backupCode.trim());
    }

    if (!verified) {
      return Response.json({ 
        success: false, 
        error: 'Invalid token or backup code' 
      }, { status: 400 });
    }

    console.log(`2FA login verified for user ${userId}`);

    return Response.json({ 
      success: true, 
      message: '2FA verification successful',
      backupCodesRemaining: backupCode ? 9 : 10 // Mock remaining codes
    });
  } catch (error) {
    console.error('2FA login verification error:', error);
    return Response.json({ error: 'Failed to verify 2FA' }, { status: 500 });
  }
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = randomBytes(4).toString('hex').toUpperCase();
    const formattedCode = code.slice(0, 4) + '-' + code.slice(4, 8);
    codes.push(formattedCode);
  }
  return codes;
}