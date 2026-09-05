/**
 * Onboarding Email Service
 * Manages the automated onboarding email sequence for new users.
 *
 * Sequence:
 *   Day 0 - Welcome email (sent immediately at signup)
 *   Day 1 - Getting Started tips
 *   Day 3 - Feature Deep Dive
 *   Day 7 - Engagement / re-engagement
 *
 * The welcome email fires synchronously during signup.
 * Days 1/3/7 are stored as scheduled_emails rows and processed
 * by the /api/cron/process-emails endpoint.
 */

import { prisma } from '@/lib/prisma';
import {
  sendEmail,
  sendWelcomeEmail,
  sendGettingStartedEmail,
  sendFeatureDeepDiveEmail,
  sendEngagementEmail,
} from '@/lib/email';
import { generateWinbackEmail } from '@/lib/email/marketing-templates';
import { logger } from '@/lib/logger';

const MAX_ATTEMPTS = 3;
/** Users with no login for this many days are considered dormant. */
const WINBACK_INACTIVE_DAYS = 14;
/** Cap per pass — the cron runs every 15 min, so backlog drains quickly. */
const WINBACK_BATCH_LIMIT = 200;
let scheduledEmailsTableAvailable: boolean | null = null;

async function hasScheduledEmailsTable(): Promise<boolean> {
  if (scheduledEmailsTableAvailable !== null) {
    return scheduledEmailsTableAvailable;
  }

  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.scheduled_emails') IS NOT NULL AS exists
    `;
    const exists = !!result?.[0]?.exists;
    scheduledEmailsTableAvailable = exists;
    return exists;
  } catch {
    scheduledEmailsTableAvailable = false;
    return false;
  }
}

/** One-time win-back email for dormant users (see scheduleWinbackEmails). */
async function sendWinbackEmail(
  email: string,
  name: string,
): Promise<{ success: boolean; error?: unknown }> {
  const { subject, html } = generateWinbackEmail({ to: email, name });
  return sendEmail({ to: email, subject, html });
}

/** Email type to sender function mapping */
const EMAIL_SENDERS: Record<string, (email: string, name: string) => Promise<{ success: boolean; error?: unknown }>> = {
  getting_started: sendGettingStartedEmail,
  feature_deep_dive: sendFeatureDeepDiveEmail,
  engagement: sendEngagementEmail,
  winback: sendWinbackEmail,
};

/**
 * Schedule the full onboarding email sequence for a newly registered user.
 *
 * - Sends the welcome email immediately (day 0).
 * - Creates scheduled_emails records for day 1, 3, and 7.
 */
export async function scheduleOnboardingEmails(
  userId: string,
  email: string,
  name: string,
): Promise<void> {
  try {
    // Day 0: send welcome email right away
    const welcomeResult = await sendWelcomeEmail(email, name);
    if (!welcomeResult.success) {
      logger.warn('Welcome email failed, but continuing with schedule', {
        email,
        error: String(welcomeResult.error),
      });
    }

    // Build the scheduled records for days 1, 3, and 7
    const now = new Date();

    const scheduledItems = [
      {
        type: 'getting_started',
        daysFromNow: 1,
      },
      {
        type: 'feature_deep_dive',
        daysFromNow: 3,
      },
      {
        type: 'engagement',
        daysFromNow: 7,
      },
    ];

    const records = scheduledItems.map((item) => {
      const scheduledAt = new Date(now);
      scheduledAt.setDate(scheduledAt.getDate() + item.daysFromNow);
      // Send at 9:00 AM UTC on the target day
      scheduledAt.setUTCHours(9, 0, 0, 0);

      return {
        userId,
        email,
        name: name || '',
        type: item.type,
        scheduledAt,
        status: 'pending' as const,
        attempts: 0,
      };
    });

    const canSchedule = await hasScheduledEmailsTable();
    if (!canSchedule) {
      logger.warn('scheduled_emails table unavailable; skipping onboarding schedule persistence', {
        userId,
        email,
      });
      return;
    }

    await prisma.scheduled_emails.createMany({ data: records });

    logger.info('Onboarding email sequence scheduled', {
      userId,
      email,
      emailCount: records.length,
    });
  } catch (error) {
    // Never let email scheduling break the signup flow
    logger.error('Failed to schedule onboarding emails', {
      userId,
      email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Process all pending scheduled emails that are due.
 *
 * Called by the /api/cron/process-emails endpoint.
 * Returns a summary of what was processed.
 */
export async function processScheduledEmails(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
}> {
  const summary = { processed: 0, sent: 0, failed: 0, errors: [] as string[] };

  try {
    const canSchedule = await hasScheduledEmailsTable();
    if (!canSchedule) {
      logger.warn('scheduled_emails table unavailable; skipping scheduled email processor run');
      return summary;
    }

    // Fetch emails that are due and haven't exceeded max attempts
    const pendingEmails = await prisma.scheduled_emails.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: new Date() },
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 100, // Process in batches to avoid timeouts
    });

    if (pendingEmails.length === 0) {
      logger.info('No pending scheduled emails to process');
      return summary;
    }

    logger.info(`Processing ${pendingEmails.length} scheduled emails`);

    for (const record of pendingEmails) {
      summary.processed++;

      const sender = EMAIL_SENDERS[record.type];
      if (!sender) {
        const errorMsg = `Unknown email type: ${record.type}`;
        logger.error(errorMsg, { id: record.id });
        await prisma.scheduled_emails.update({
          where: { id: record.id },
          data: {
            status: 'failed',
            error: errorMsg,
            attempts: record.attempts + 1,
          },
        });
        summary.failed++;
        summary.errors.push(`${record.id}: ${errorMsg}`);
        continue;
      }

      try {
        const result = await sender(record.email, record.name || 'there');

        if (result.success) {
          await prisma.scheduled_emails.update({
            where: { id: record.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
              attempts: record.attempts + 1,
            },
          });
          summary.sent++;
          logger.info('Scheduled email sent', {
            id: record.id,
            type: record.type,
            email: record.email,
          });
        } else {
          const newAttempts = record.attempts + 1;
          const errorMsg = result.error instanceof Error
            ? result.error.message
            : String(result.error || 'Unknown send error');

          await prisma.scheduled_emails.update({
            where: { id: record.id },
            data: {
              status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
              error: errorMsg,
              attempts: newAttempts,
            },
          });

          if (newAttempts >= MAX_ATTEMPTS) {
            summary.failed++;
            summary.errors.push(`${record.id}: Max attempts reached - ${errorMsg}`);
          }

          logger.warn('Scheduled email send failed, will retry', {
            id: record.id,
            type: record.type,
            email: record.email,
            attempt: newAttempts,
            maxAttempts: MAX_ATTEMPTS,
            error: errorMsg,
          });
        }
      } catch (error) {
        const newAttempts = record.attempts + 1;
        const errorMsg = error instanceof Error ? error.message : String(error);

        await prisma.scheduled_emails.update({
          where: { id: record.id },
          data: {
            status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            error: errorMsg,
            attempts: newAttempts,
          },
        });

        if (newAttempts >= MAX_ATTEMPTS) {
          summary.failed++;
        }
        summary.errors.push(`${record.id}: ${errorMsg}`);

        logger.error('Scheduled email threw exception', {
          id: record.id,
          type: record.type,
          email: record.email,
          attempt: newAttempts,
          error: errorMsg,
        });
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('processScheduledEmails fatal error', { error: errorMsg });
    summary.errors.push(`Fatal: ${errorMsg}`);
  }

  return summary;
}

/**
 * Schedule a ONE-TIME win-back email for every dormant user.
 *
 * Dormant = active + email-verified users whose last login (or signup, if they
 * never logged in) is older than WINBACK_INACTIVE_DAYS. Users who already have
 * a winback record — pending, sent, or failed — are skipped, so each user can
 * ever receive at most one.
 *
 * Called from the /api/cron/process-emails route; idempotent and never throws.
 */
export async function scheduleWinbackEmails(): Promise<{ scheduled: number }> {
  const summary = { scheduled: 0 };

  try {
    const canSchedule = await hasScheduledEmailsTable();
    if (!canSchedule) {
      logger.warn('scheduled_emails table unavailable; skipping winback scheduling');
      return summary;
    }

    const cutoff = new Date(Date.now() - WINBACK_INACTIVE_DAYS * 24 * 60 * 60 * 1000);

    const dormantUsers = await prisma.users.findMany({
      where: {
        isActive: true,
        emailVerified: true,
        // Dedupe: at most one winback ever, regardless of status.
        scheduled_emails: { none: { type: 'winback' } },
        OR: [
          { lastLoginAt: { lt: cutoff } },
          { lastLoginAt: null, createdAt: { lt: cutoff } },
        ],
      },
      select: { id: true, email: true, name: true },
      take: WINBACK_BATCH_LIMIT,
    });

    if (dormantUsers.length === 0) {
      return summary;
    }

    // Send at the next 9:00 UTC (today if still ahead, otherwise tomorrow).
    const scheduledAt = new Date();
    if (scheduledAt.getUTCHours() >= 9) {
      scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 1);
    }
    scheduledAt.setUTCHours(9, 0, 0, 0);

    await prisma.scheduled_emails.createMany({
      data: dormantUsers.map((user) => ({
        userId: user.id,
        email: user.email,
        name: user.name || '',
        type: 'winback',
        scheduledAt,
        status: 'pending' as const,
        attempts: 0,
      })),
    });

    summary.scheduled = dormantUsers.length;
    logger.info('Winback emails scheduled', {
      count: dormantUsers.length,
      scheduledAt: scheduledAt.toISOString(),
    });
  } catch (error) {
    // Never let winback scheduling break the cron pass
    logger.error('Failed to schedule winback emails', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return summary;
}

/**
 * Cancel all pending onboarding emails for a user.
 * Useful when a user deletes their account or unsubscribes.
 */
export async function cancelOnboardingEmails(userId: string): Promise<number> {
  try {
    const canSchedule = await hasScheduledEmailsTable();
    if (!canSchedule) {
      return 0;
    }

    const result = await prisma.scheduled_emails.updateMany({
      where: {
        userId,
        status: 'pending',
      },
      data: {
        status: 'failed',
        error: 'Cancelled',
      },
    });
    logger.info('Cancelled onboarding emails', { userId, count: result.count });
    return result.count;
  } catch (error) {
    logger.error('Failed to cancel onboarding emails', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
