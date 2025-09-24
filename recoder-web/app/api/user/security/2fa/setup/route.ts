// Two-factor authentication setup API endpoint
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import { generateSecret } from 'speakeasy';
import QRCode from 'qrcode';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for 2FA setup - 5 requests per hour
const limiter = rateLimit({
  interval: 60 * 60 * 1000, // 1 hour
  uniqueTokenPerInterval: 100,
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, '2fa-setup');
    } catch {
      return Response.json(
        { error: 'Too many 2FA setup requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if 2FA is already enabled
    const profile = await userManager.getUserProfile(session.user.id);
    if ((profile as any)?.two_factor_enabled) {
      return Response.json(
        { error: '2FA is already enabled for this account' },
        { status: 409 }
      );
    }

    // Generate a secret for TOTP
    const secret = generateSecret({
      name: `Recoder.xyz (${session.user.email})`,
      issuer: 'Recoder.xyz',
      length: 32
    });

    // Generate QR code
    const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

    // Store the temp secret (in production, you'd use Redis or encrypted storage)
    // For now, we'll use a simple in-memory store with expiration
    tempSecretStore.set(session.user.id, {
      secret: secret.base32,
      expires: Date.now() + 15 * 60 * 1000 // 15 minutes
    });

    // Log the setup attempt
    console.log(`2FA setup initiated for user ${session.user.id}:`, {
      userId: session.user.id,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    return Response.json({
      qrCode: qrCodeDataURL,
      secret: secret.base32, // In production, don't return the secret directly
      backupUrl: secret.otpauth_url,
    });

  } catch (error) {
    console.error('2FA setup error:', error);
    return Response.json(
      { error: 'Failed to setup 2FA' },
      { status: 500 }
    );
  }
}

// Temporary storage for 2FA secrets during setup
// In production, use Redis or encrypted database storage
const tempSecretStore = new Map<string, { secret: string; expires: number }>();

// Cleanup expired secrets
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of tempSecretStore.entries()) {
    if (data.expires <= now) {
      tempSecretStore.delete(userId);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

// Helper function to verify TOTP code
export function verifyTOTP(secret: string, token: string, window = 1): boolean {
  const speakeasy = require('speakeasy');
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: window
  });
}

export { tempSecretStore };

export const runtime = "nodejs";