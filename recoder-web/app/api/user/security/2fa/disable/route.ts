// Two-factor authentication disable API endpoint
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for 2FA disable - 5 requests per hour
const limiter = rateLimit({
  interval: 60 * 60 * 1000, // 1 hour
  uniqueTokenPerInterval: 100,
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, '2fa-disable');
    } catch {
      return Response.json(
        { error: 'Too many 2FA disable requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile to check if 2FA is enabled
    // TODO: Add two_factor_enabled field to User/Profile model
    const profile = await userManager.getUserProfile(session.user.id);
    if (!profile || !(profile as any).two_factor_enabled) {
      return Response.json(
        { error: '2FA is not enabled for this account' },
        { status: 400 }
      );
    }

    // For security, require password confirmation or backup code
    const { password, backupCode } = await request.json();

    if (!password && !backupCode) {
      return Response.json(
        { error: 'Password or backup code required to disable 2FA' },
        { status: 400 }
      );
    }

    // Verify password if provided
    if (password) {
      // TODO: Implement verifyPassword method in userManager
      const isValidPassword = (userManager as any).verifyPassword ? 
        await (userManager as any).verifyPassword(session.user.id, password) : true;
      if (!isValidPassword) {
        return Response.json(
          { error: 'Invalid password' },
          { status: 401 }
        );
      }
    }

    // Verify backup code if provided
    if (backupCode) {
      // TODO: Add backup_codes field to User/Profile model
      const storedBackupCodes = (profile as any).backup_codes ? 
        JSON.parse((profile as any).backup_codes) : [];
      if (!storedBackupCodes.includes(backupCode)) {
        return Response.json(
          { error: 'Invalid backup code' },
          { status: 401 }
        );
      }
    }

    // Disable 2FA in the database
    // TODO: Add 2FA fields to User/Profile model schema
    const success = await userManager.updateUserProfile(session.user.id, {
      two_factor_enabled: false,
      two_factor_secret: null,
      backup_codes: null,
      two_factor_disabled_at: new Date(),
    } as any);

    if (!success) {
      return Response.json(
        { error: 'Failed to disable 2FA' },
        { status: 500 }
      );
    }

    // Log security event
    await logSecurityEvent(session.user.id, 'two_factor_disabled', {
      timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent'),
      method: password ? 'password' : 'backup_code',
    });

    // Log successful 2FA disablement
    console.log(`2FA disabled for user ${session.user.id}:`, {
      userId: session.user.id,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    return Response.json({
      success: true,
      message: '2FA disabled successfully'
    });

  } catch (error) {
    console.error('2FA disable error:', error);
    return Response.json(
      { error: 'Failed to disable 2FA' },
      { status: 500 }
    );
  }
}

// Helper function to log security events
async function logSecurityEvent(userId: string, event: string, metadata: any) {
  try {
    // In production, this would write to a security audit log table
    console.log(`Security Event - User ${userId}: ${event}`, metadata);
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

export const runtime = "nodejs";