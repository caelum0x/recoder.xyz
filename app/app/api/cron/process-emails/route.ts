/**
 * Cron Endpoint: Process Scheduled Onboarding Emails
 *
 * Picks up scheduled_emails records that are due and sends them.
 * Protected by CRON_SECRET header check.
 *
 * Recommended: call via Vercel Cron or external scheduler every 15 minutes.
 *
 * Authorization: either
 *   - Header `x-cron-secret` matching process.env.CRON_SECRET
 *   - Header `authorization` with `Bearer <CRON_SECRET>`
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingEmailOperationsStatus, processScheduledEmails } from '@/lib/services/onboarding-email.service';
import { logger } from '@/lib/logger';

const CRON_SECRET = process.env.CRON_SECRET || '';

function isAuthorized(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    // If no secret is configured, reject in production
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    // Allow in development without a secret
    return true;
  }

  const cronHeader = request.headers.get('x-cron-secret');
  if (cronHeader === CRON_SECRET) {
    return true;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) {
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
    });
  }

  try {
    const startTime = Date.now();
    const result = await processScheduledEmails();
    const duration = Date.now() - startTime;

    logger.info('Cron: process-emails completed', {
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
    logger.error('Cron: process-emails failed', { error: errorMsg });

    return NextResponse.json(
      { success: false, error: 'Email processing failed', details: errorMsg },
      { status: 500 },
    );
  }
}

// Support POST for manual triggers or webhook-based cron services
export async function POST(request: NextRequest) {
  return GET(request);
}
