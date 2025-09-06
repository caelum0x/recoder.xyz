// Two-factor authentication verification API endpoint
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import { tempSecretStore, verifyTOTP } from '../setup/route';
import { generateBackupCodes } from '@/lib/security-utils';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for 2FA verification - 10 attempts per 15 minutes
const limiter = rateLimit({
  interval: 15 * 60 * 1000, // 15 minutes
  uniqueTokenPerInterval: 100,
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, '2fa-verify');
    } catch {
      return Response.json(
        { error: 'Too many verification attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await request.json();

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return Response.json(
        { error: 'Invalid verification code format' },
        { status: 400 }
      );
    }

    // Get the temporary secret
    const tempSecret = tempSecretStore.get(session.user.id);
    if (!tempSecret) {
      return Response.json(
        { error: 'No setup session found. Please restart 2FA setup.' },
        { status: 400 }
      );
    }

    if (tempSecret.expires <= Date.now()) {
      tempSecretStore.delete(session.user.id);
      return Response.json(
        { error: 'Setup session expired. Please restart 2FA setup.' },
        { status: 400 }
      );
    }

    // Verify the TOTP code
    const isValid = verifyTOTP(tempSecret.secret, code);
    
    if (!isValid) {
      return Response.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes();

    // Enable 2FA in the database
    const success = await userManager.updateUserProfile(session.user.id, {
      two_factor_enabled: true,
      two_factor_secret: tempSecret.secret,
      backup_codes: JSON.stringify(backupCodes),
      two_factor_enabled_at: new Date(),
    });

    if (!success) {
      return Response.json(
        { error: 'Failed to enable 2FA' },
        { status: 500 }
      );
    }

    // Clean up the temporary secret
    tempSecretStore.delete(session.user.id);

    // Log successful 2FA enablement
    console.log(`2FA enabled for user ${session.user.id}:`, {
      userId: session.user.id,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    // Log security event
    await logSecurityEvent(session.user.id, 'two_factor_enabled', {
      timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent'),
    });

    return Response.json({
      success: true,
      backupCodes: backupCodes,
      message: '2FA enabled successfully'
    });

  } catch (error) {
    console.error('2FA verification error:', error);
    return Response.json(
      { error: 'Failed to verify 2FA code' },
      { status: 500 }
    );
  }
}

// Helper function to log security events (to be implemented with proper storage)
async function logSecurityEvent(userId: string, event: string, metadata: any) {
  try {
    // In production, this would write to a security audit log table
    console.log(`Security Event - User ${userId}: ${event}`, metadata);
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

export const runtime = "edge";