/**
 * Health Check API Route
 * Used by CLI to verify backend availability
 */

import { NextRequest, NextResponse } from 'next/server';
import { traceRequest } from '@/lib/tracing-middleware';
import { detectBillingHealth } from '@/lib/billing-health';
import { getEmailProviderStatus } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { getOnboardingEmailOperationsStatus } from '@/lib/services/onboarding-email.service';

function sanitizeErrorMessage(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(request: NextRequest) {
  const { traceId, applyTraceId } = traceRequest(request);

  const emailProvider = getEmailProviderStatus();
  const billing = detectBillingHealth(process.env);
  const onboardingEmailStatus = await getOnboardingEmailOperationsStatus();
  let dbConnected = false;
  let dbError: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch (error) {
    dbConnected = false;
    dbError = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
  }

  const status = dbConnected ? 'healthy' : 'degraded';

  return applyTraceId(
    NextResponse.json({
      status,
      service: 'recoder-api',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      traceId,
      endpoints: {
        ai: '/api/ai/chat',
        auth: '/api/auth/login',
        health: '/api/health',
      },
      email: {
        configured: emailProvider.provider !== 'none',
        provider: emailProvider.provider,
        smtpConfigured: emailProvider.hasSmtp,
        resendConfigured: emailProvider.hasResend,
        fromEmail: emailProvider.fromEmail,
        onboardingAutomation: {
          tableAvailable: onboardingEmailStatus.tableAvailable,
          cronSecretConfigured: onboardingEmailStatus.cronSecretConfigured,
          pending: onboardingEmailStatus.counts.pending,
          dueNow: onboardingEmailStatus.counts.dueNow,
          failed: onboardingEmailStatus.counts.failed,
          nextScheduledAt: onboardingEmailStatus.nextScheduledAt,
        },
      },
      database: {
        connected: dbConnected,
        error: dbError,
      },
      billing,
    })
  );
}
