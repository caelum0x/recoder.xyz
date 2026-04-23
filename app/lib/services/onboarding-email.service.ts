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
  sendWelcomeEmail,
  sendGettingStartedEmail,
  sendFeatureDeepDiveEmail,
  sendEngagementEmail,
} from '@/lib/email';
import { logger } from '@/lib/logger';

const MAX_ATTEMPTS = 3;
let scheduledEmailsTableAvailable: boolean | null = null;

const ONBOARDING_EMAIL_TEMPLATES = [
  { type: 'welcome', label: 'Welcome', timing: 'signup', description: 'Immediate welcome email sent during account creation.' },
  { type: 'getting_started', label: 'Getting Started', timing: 'day_1', description: 'First-run tips and setup guidance.' },
  { type: 'feature_deep_dive', label: 'Feature Deep Dive', timing: 'day_3', description: 'Product tour and high-value workflow examples.' },
  { type: 'engagement', label: 'Engagement', timing: 'day_7', description: 'Re-engagement and activation follow-up.' },
] as const;

export interface OnboardingEmailOperationsStatus {
  tableAvailable: boolean;
  cronSecretConfigured: boolean;
  maxAttempts: number;
  counts: {
    pending: number;
    dueNow: number;
    sent: number;
    failed: number;
  };
  nextScheduledAt: Date | null;
  oldestPendingAt: Date | null;
  recentFailures: Array<{
    id: string;
    email: string;
    type: string;
    attempts: number;
    error: string | null;
    scheduledAt: Date;
  }>;
  templates: typeof ONBOARDING_EMAIL_TEMPLATES;
}

export function getOnboardingEmailTemplateCatalog() {
  return ONBOARDING_EMAIL_TEMPLATES;
}

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

export async function getOnboardingEmailOperationsStatus(): Promise<OnboardingEmailOperationsStatus> {
  const baseStatus: OnboardingEmailOperationsStatus = {
    tableAvailable: false,
    cronSecretConfigured: Boolean((process.env.CRON_SECRET || '').trim()),
    maxAttempts: MAX_ATTEMPTS,
    counts: {
      pending: 0,
      dueNow: 0,
      sent: 0,
      failed: 0,
    },
    nextScheduledAt: null,
    oldestPendingAt: null,
    recentFailures: [],
    templates: ONBOARDING_EMAIL_TEMPLATES,
  };

  const canSchedule = await hasScheduledEmailsTable();
  if (!canSchedule) {
    return baseStatus;
  }

  const now = new Date();
  const [pending, dueNow, sent, failed, nextScheduled, oldestPending, recentFailures] = await prisma.$transaction([
    prisma.scheduled_emails.count({ where: { status: 'pending' } }),
    prisma.scheduled_emails.count({ where: { status: 'pending', scheduledAt: { lte: now } } }),
    prisma.scheduled_emails.count({ where: { status: 'sent' } }),
    prisma.scheduled_emails.count({ where: { status: 'failed' } }),
    prisma.scheduled_emails.findFirst({
      where: { status: 'pending', scheduledAt: { gt: now } },
      orderBy: { scheduledAt: 'asc' },
      select: { scheduledAt: true },
    }),
    prisma.scheduled_emails.findFirst({
      where: { status: 'pending' },
      orderBy: { scheduledAt: 'asc' },
      select: { scheduledAt: true },
    }),
    prisma.scheduled_emails.findMany({
      where: { status: 'failed' },
      orderBy: { scheduledAt: 'desc' },
      take: 5,
      select: {
        id: true,
        email: true,
        type: true,
        attempts: true,
        error: true,
        scheduledAt: true,
      },
    }),
  ]);

  return {
    ...baseStatus,
    tableAvailable: true,
    counts: { pending, dueNow, sent, failed },
    nextScheduledAt: nextScheduled?.scheduledAt ?? null,
    oldestPendingAt: oldestPending?.scheduledAt ?? null,
    recentFailures,
  };
}

/** Email type to sender function mapping */
const EMAIL_SENDERS: Record<string, (email: string, name: string) => Promise<{ success: boolean; error?: unknown }>> = {
  getting_started: sendGettingStartedEmail,
  feature_deep_dive: sendFeatureDeepDiveEmail,
  engagement: sendEngagementEmail,
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
