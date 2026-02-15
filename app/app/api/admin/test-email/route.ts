/**
 * Email Test API Route (Admin Only)
 * Tests email delivery with Resend API
 *
 * Usage:
 * POST /api/admin/test-email
 * Body: { email: "test@example.com", type: "verification" | "welcome" | "password-reset" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail, sendTemporaryPasswordEmail } from '@/lib/email';

const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.warn('[admin] ADMIN_SECRET not configured - admin endpoints disabled');
}

export async function POST(request: NextRequest) {
  try {
    // Check admin authorization
    const authHeader = request.headers.get('x-admin-secret');
    if (!ADMIN_SECRET || !authHeader || authHeader !== ADMIN_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Provide x-admin-secret header.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { email, type = 'verification', name = 'Test User' } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    console.log(`📧 [Test Email] Sending ${type} email to ${email}...`);

    let result;
    const testUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}/test-link?token=TEST_TOKEN_123`;

    switch (type) {
      case 'verification':
        result = await sendVerificationEmail(email, testUrl);
        break;
      case 'welcome':
        result = await sendWelcomeEmail(email, name);
        break;
      case 'password-reset':
        result = await sendPasswordResetEmail(email, testUrl);
        break;
      case 'temp-password':
        result = await sendTemporaryPasswordEmail(email, 'TEST1234');
        break;
      default:
        return NextResponse.json(
          { success: false, error: `Unknown email type: ${type}. Use: verification, welcome, password-reset, temp-password` },
          { status: 400 }
        );
    }

    if (result.success) {
      console.log(`✅ [Test Email] ${type} email sent to ${email}, messageId: ${result.messageId}`);
      return NextResponse.json({
        success: true,
        message: `Test ${type} email sent to ${email}`,
        messageId: result.messageId,
        provider: process.env.RESEND_API_KEY ? 'Resend' : (process.env.SMTP_USER ? 'SMTP' : 'Dev Mode'),
      });
    } else {
      console.error(`❌ [Test Email] Failed to send ${type} email:`, result.error);
      return NextResponse.json({
        success: false,
        error: result.error?.message || 'Failed to send email',
        provider: process.env.RESEND_API_KEY ? 'Resend' : (process.env.SMTP_USER ? 'SMTP' : 'Dev Mode'),
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Test email error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check email configuration
export async function GET(request: NextRequest) {
  // Check admin authorization
  const authHeader = request.headers.get('x-admin-secret');
  if (authHeader !== ADMIN_SECRET) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Provide x-admin-secret header.' },
      { status: 401 }
    );
  }

  const config = {
    resendConfigured: !!process.env.RESEND_API_KEY,
    smtpConfigured: !!process.env.SMTP_USER,
    fromEmail: process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@recoder.xyz',
    isDev: process.env.NODE_ENV === 'development',
    activeProvider: process.env.RESEND_API_KEY ? 'Resend' : (process.env.SMTP_USER ? 'SMTP' : 'None (Dev Mode)'),
  };

  return NextResponse.json({
    success: true,
    config,
    testEndpoint: 'POST /api/admin/test-email with { email, type }',
    availableTypes: ['verification', 'welcome', 'password-reset', 'temp-password'],
  });
}
