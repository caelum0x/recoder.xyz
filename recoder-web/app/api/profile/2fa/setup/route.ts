import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';

const setupSchema = z.object({
  action: z.enum(['generate', 'verify', 'disable']),
  token: z.string().length(6).optional(),
  backupCode: z.string().optional(),
  password: z.string().min(1)
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, token, backupCode, password } = setupSchema.parse(body);

    // Get user ID from session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        twoFactorEnabled: true,
        totpSecret: true,
        backupCodes: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const bcrypt = require('bcryptjs');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    const userId = user.id;

    switch (action) {
      case 'generate':
        return await generateTOTPSecret(userId, user);
      
      case 'verify':
        if (!token) {
          return NextResponse.json(
            { error: 'Token is required for verification' },
            { status: 400 }
          );
        }
        return await verifyAndEnableTOTP(userId, user, token, request);
      
      case 'disable':
        return await disableTwoFactor(userId, user, token, backupCode, request);
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('2FA setup error:', error);
    return NextResponse.json(
      { error: 'Failed to process 2FA request' },
      { status: 500 }
    );
  }
}

async function generateTOTPSecret(userId: string, user: any) {
  const secret = speakeasy.generateSecret({
    name: user.email,
    issuer: 'Recoder.xyz',
    length: 32
  });

  // Store the temporary secret (not yet enabled)
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecret: secret.base32 // Store temporarily
    }
  });

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

  return NextResponse.json({
    success: true,
    secret: secret.base32,
    qrCode: qrCodeUrl,
    manualEntryKey: secret.base32,
    backupUrl: secret.otpauth_url
  });
}

async function verifyAndEnableTOTP(userId: string, user: any, token: string, request: NextRequest) {
  if (!user.totpSecret) {
    return NextResponse.json(
      { error: 'No TOTP secret found. Please generate one first.' },
      { status: 400 }
    );
  }

  // Verify the TOTP token
  const verified = speakeasy.totp.verify({
    secret: user.totpSecret,
    encoding: 'base32',
    token,
    window: 2 // Allow for time drift
  });

  if (!verified) {
    return NextResponse.json(
      { error: 'Invalid verification code' },
      { status: 400 }
    );
  }

  // Generate backup codes
  const backupCodes = Array.from({ length: 10 }, () => 
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  // Hash backup codes before storing
  const bcrypt = require('bcryptjs');
  const hashedBackupCodes = await Promise.all(
    backupCodes.map(code => bcrypt.hash(code, 12))
  );

  // Enable 2FA
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      backupCodes: hashedBackupCodes
    },
    select: {
      id: true,
      twoFactorEnabled: true
    }
  });

  // Update security settings
  await prisma.securitySettings.upsert({
    where: { userId },
    update: {
      twoFactorEnabled: true,
      updatedAt: new Date()
    },
    create: {
      userId,
      twoFactorEnabled: true
    }
  });

  // Log security event
  await prisma.securityEvent.create({
    data: {
      userId,
      eventType: 'two_factor_enabled',
      severity: 'medium',
      description: '2FA has been enabled for user account',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      metadata: {
        method: 'TOTP',
        timestamp: new Date().toISOString()
      }
    }
  });

  // Log audit event
  await prisma.userAuditLog.create({
    data: {
      userId,
      action: 'TWO_FACTOR_ENABLED',
      details: {
        method: 'TOTP',
        backupCodesGenerated: backupCodes.length
      },
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown'
    }
  });

  return NextResponse.json({
    success: true,
    message: '2FA has been successfully enabled',
    backupCodes: backupCodes, // Return unhashed codes for user to save
    user: updatedUser
  });
}

async function disableTwoFactor(userId: string, user: any, token?: string, backupCode?: string, request?: NextRequest) {
  if (!user.twoFactorEnabled) {
    return NextResponse.json(
      { error: '2FA is not currently enabled' },
      { status: 400 }
    );
  }

  let verified = false;

  // Verify using TOTP token
  if (token && user.totpSecret) {
    verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token,
      window: 2
    });
  }

  // Verify using backup code
  if (!verified && backupCode && user.backupCodes) {
    const bcrypt = require('bcryptjs');
    for (const hashedCode of user.backupCodes) {
      if (await bcrypt.compare(backupCode.toUpperCase(), hashedCode)) {
        verified = true;
        break;
      }
    }
  }

  if (!verified) {
    return NextResponse.json(
      { error: 'Invalid verification code or backup code' },
      { status: 400 }
    );
  }

  // Disable 2FA
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      totpSecret: null,
      backupCodes: []
    },
    select: {
      id: true,
      twoFactorEnabled: true
    }
  });

  // Update security settings
  await prisma.securitySettings.upsert({
    where: { userId },
    update: {
      twoFactorEnabled: false,
      updatedAt: new Date()
    },
    create: {
      userId,
      twoFactorEnabled: false
    }
  });

  // Log security event
  await prisma.securityEvent.create({
    data: {
      userId,
      eventType: 'two_factor_disabled',
      severity: 'high',
      description: '2FA has been disabled for user account',
      ip: request?.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request?.headers.get('user-agent') || 'unknown',
      metadata: {
        disabledWith: token ? 'TOTP' : 'backup_code',
        timestamp: new Date().toISOString()
      }
    }
  });

  // Log audit event
  await prisma.userAuditLog.create({
    data: {
      userId,
      action: 'TWO_FACTOR_DISABLED',
      details: {
        disabledWith: token ? 'TOTP' : 'backup_code'
      },
      ipAddress: request?.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request?.headers.get('user-agent') || 'unknown'
    }
  });

  return NextResponse.json({
    success: true,
    message: '2FA has been successfully disabled',
    user: updatedUser
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        twoFactorEnabled: true,
        backupCodes: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const securitySettings = await prisma.securitySettings.findUnique({
      where: { userId: user.id },
      select: {
        twoFactorEnabled: true,
        sessionTimeout: true,
        loginNotifications: true,
        securityAlerts: true
        // Note: totpSecret, backupCodes, trustedDevices, suspiciousActivityAlerts fields don't exist in SecuritySettings model
      }
    });

    return NextResponse.json({
      twoFactorEnabled: user.twoFactorEnabled,
      hasBackupCodes: user.backupCodes && Array.isArray(user.backupCodes) && user.backupCodes.length > 0,
      backupCodesCount: Array.isArray(user.backupCodes) ? user.backupCodes.length : 0,
      securitySettings: securitySettings || {
        twoFactorEnabled: false,
        sessionTimeout: 86400,
        loginNotifications: true,
        securityAlerts: true
      }
    });

  } catch (error) {
    console.error('2FA status error:', error);
    return NextResponse.json(
      { error: 'Failed to get 2FA status' },
      { status: 500 }
    );
  }
}