/**
 * Email Automation Cron Endpoint (legacy)
 *
 * Now delegates to the scheduled_emails table via processScheduledEmails().
 * Kept for backward compatibility with existing cron configurations.
 *
 * Preferred endpoint: /api/cron/process-emails
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingEmailOperationsStatus, processScheduledEmails } from '@/lib/services/onboarding-email.service';
import { logger } from '@/lib/logger';

const CRON_SECRET = (process.env.CRON_SECRET || '').trim();

function isAuthorized(request: NextRequest): boolean {
  if (!CRON_SECRET || CRON_SECRET.length < 8) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('CRON_SECRET is missing or too short for production');
      return false;
    }
    // Allow unauthenticated access in development
    return true;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) {
    return true;
  }

  const cronHeader = request.headers.get('x-cron-secret');
  if (cronHeader === CRON_SECRET) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get('mode') === 'status') {
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      pipeline: await getOnboardingEmailOperationsStatus(),
      preferredEndpoint: '/api/cron/process-emails',
    });
  }

  try {
    const startTime = Date.now();
    const result = await processScheduledEmails();
    const duration = Date.now() - startTime;

    logger.info('Cron: email-automation completed', {
      ...result,
      durationMs: duration,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      durationMs: duration,
      ...result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Cron: email-automation failed', { error: errorMsg });

    return NextResponse.json(
      { error: 'Email automation failed', details: errorMsg },
      { status: 500 },
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
