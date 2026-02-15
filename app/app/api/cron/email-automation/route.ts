/**
 * Email Automation Cron Endpoint
 * Triggered by cron job daily at 9:00 AM UTC
 *
 * Email Timeline:
 * - Day 1: Getting Started email
 * - Day 3: Feature Deep Dive email
 * - Day 7: Engagement/Re-engagement email
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  sendGettingStartedEmail,
  sendFeatureDeepDiveEmail,
  sendEngagementEmail,
} from '@/lib/email';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET || 'recoder-cron-2026';

export async function GET(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    day1: { sent: 0, errors: 0 },
    day3: { sent: 0, errors: 0 },
    day7: { sent: 0, errors: 0 },
  };

  try {
    const now = new Date();

    // Day 1: Getting Started (users who signed up 24-48 hours ago)
    const day1Users = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
          lte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
        emailVerified: true,
      },
      select: { id: true, email: true, name: true },
    });

    for (const user of day1Users) {
      try {
        await sendGettingStartedEmail(user.email, user.name || 'there');
        results.day1.sent++;
        console.log(`[Email] Day 1 sent to ${user.email}`);
      } catch (error) {
        console.error(`[Email] Failed Day 1 to ${user.email}:`, error);
        results.day1.errors++;
      }
    }

    // Day 3: Feature Deep Dive (users who signed up 3-4 days ago)
    const day3Users = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
          lte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        },
        emailVerified: true,
      },
      select: { id: true, email: true, name: true },
    });

    for (const user of day3Users) {
      try {
        await sendFeatureDeepDiveEmail(user.email, user.name || 'there');
        results.day3.sent++;
        console.log(`[Email] Day 3 sent to ${user.email}`);
      } catch (error) {
        console.error(`[Email] Failed Day 3 to ${user.email}:`, error);
        results.day3.errors++;
      }
    }

    // Day 7: Engagement (users who signed up 7-8 days ago)
    const day7Users = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
          lte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        },
        emailVerified: true,
      },
      select: { id: true, email: true, name: true },
    });

    for (const user of day7Users) {
      try {
        await sendEngagementEmail(user.email, user.name || 'there');
        results.day7.sent++;
        console.log(`[Email] Day 7 sent to ${user.email}`);
      } catch (error) {
        console.error(`[Email] Failed Day 7 to ${user.email}:`, error);
        results.day7.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
      summary: {
        totalSent: results.day1.sent + results.day3.sent + results.day7.sent,
        totalErrors: results.day1.errors + results.day3.errors + results.day7.errors,
      },
    });
  } catch (error) {
    console.error('[Email Automation] Error:', error);
    return NextResponse.json(
      { error: 'Email automation failed' },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
