/**
 * Email Test API Route (Admin Only)
 * Tests transactional and onboarding email delivery using the configured provider.
 *
 * Usage:
 * POST /api/admin/test-email
 * Body: { email: "test@example.com", type: "verification" | "welcome" | "password-reset" | "temp-password" | "getting-started" | "feature-deep-dive" | "engagement" }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getEmailProviderStatus,
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendTemporaryPasswordEmail,
  sendGettingStartedEmail,
  sendFeatureDeepDiveEmail,
  sendEngagementEmail,
} from '@/lib/email';
import { getOnboardingEmailOperationsStatus, getOnboardingEmailTemplateCatalog } from '@/lib/services/onboarding-email.service';

const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.warn('[admin] ADMIN_SECRET not configured - admin endpoints disabled');
}

function getProviderLabel() {
  const provider = getEmailProviderStatus().provider;
  switch (provider) {
    case 'smtp':
      return 'SMTP';
    case 'resend':
      return 'Resend';
    case 'dev':
      return 'Dev Mode';
    default:
      return 'None';
  }
}

const AVAILABLE_TYPES = [
  'verification',
  'welcome',
  'password-reset',
  'temp-password',
  'getting-started',
  'feature-deep-dive',
  'engagement',
] as const;

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
      case 'getting-started':
        result = await sendGettingStartedEmail(email, name);
        break;
      case 'feature-deep-dive':
        result = await sendFeatureDeepDiveEmail(email, name);
        break;
      case 'engagement':
        result = await sendEngagementEmail(email, name);
        break;
      default:
        return NextResponse.json(
          { success: false, error: `Unknown email type: ${type}. Use: ${AVAILABLE_TYPES.join(', ')}` },
          { status: 400 }
        );
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Test ${type} email sent to ${email}`,
        messageId: result.messageId,
        provider: getProviderLabel(),
      });
    } else {
      console.error(`❌ [Test Email] Failed to send ${type} email:`, result.error);
      return NextResponse.json({
        success: false,
        error: result.error?.message || 'Failed to send email',
        provider: getProviderLabel(),
      }, { status: 500 });
    }

  } catch (error) {
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

  const providerStatus = getEmailProviderStatus();
  const pipeline = await getOnboardingEmailOperationsStatus();
  const config = {
    resendConfigured: providerStatus.hasResend,
    smtpConfigured: providerStatus.hasSmtp,
    fromEmail: providerStatus.fromEmail,
    isDev: process.env.NODE_ENV === 'development',
    activeProvider: getProviderLabel(),
    emailProvider: providerStatus.provider,
    cronSecretConfigured: pipeline.cronSecretConfigured,
    adminSecretConfigured: Boolean(ADMIN_SECRET),
  };

  return NextResponse.json({
    success: true,
    config,
    pipeline,
    templates: {
      onboarding: getOnboardingEmailTemplateCatalog(),
      testableTypes: AVAILABLE_TYPES,
    },
    endpoints: {
      test: 'POST /api/admin/test-email',
      cronStatus: 'GET /api/cron/process-emails?mode=status',
      cronRun: 'POST /api/cron/process-emails',
    },
    rollout: [
      'Set EMAIL_PROVIDER=smtp and configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD.',
      'Use a transactional sender like Postal or docker-mailserver for noreply@recoder.xyz.',
      'Set ADMIN_SECRET and CRON_SECRET in production.',
      'Run GET /api/admin/test-email and GET /api/cron/process-emails?mode=status before enabling cron.',
      'Schedule /api/cron/process-emails every 15 minutes with x-cron-secret or Bearer authorization.',
    ],
    testEndpoint: 'POST /api/admin/test-email with { email, type }',
    availableTypes: AVAILABLE_TYPES,
  });
}
