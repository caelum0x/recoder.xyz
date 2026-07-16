/**
 * Email Campaign Manager
 *
 * Handles scheduling, sending, and tracking marketing email campaigns
 * Includes rate limiting, batch sending, and analytics
 */

import crypto from 'crypto';
import { sendEmail } from '../email';
import { logger } from '@/lib/logger';
import {
  generateNewsletterEmail,
  generateProductUpdateEmail,
  generateFeatureAnnouncementEmail,
  generateFirstProjectEmail,
  generateFirstDeploymentEmail,
  generateMilestoneEmail,
} from './marketing-templates';

interface CampaignRecipient {
  email: string;
  name: string;
  unsubscribeToken?: string;
  metadata?: Record<string, any>;
}

interface CampaignResult {
  total: number;
  sent: number;
  failed: number;
  errors: Array<{
    email: string;
    error: string;
  }>;
}

/**
 * Send emails in batches to avoid rate limits
 */
async function sendBatchEmails(
  recipients: CampaignRecipient[],
  emailGenerator: (recipient: CampaignRecipient) => { subject: string; html: string },
  batchSize: number = 10,
  delayMs: number = 1000
): Promise<CampaignResult> {
  const result: CampaignResult = {
    total: recipients.length,
    sent: 0,
    failed: 0,
    errors: [],
  };

  // Process in batches
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);

    // Send batch concurrently
    const batchResults = await Promise.allSettled(
      batch.map(async (recipient) => {
        try {
          const { subject, html } = emailGenerator(recipient);
          const emailResult = await sendEmail({
            to: recipient.email,
            subject,
            html,
          });

          if (!emailResult.success) {
            throw new Error(emailResult.error?.message || 'Failed to send email');
          }

          return { success: true, email: recipient.email };
        } catch (error) {
          return {
            success: false,
            email: recipient.email,
            error: error.message,
          };
        }
      })
    );

    // Process results
    batchResults.forEach((batchResult, index) => {
      if (batchResult.status === 'fulfilled' && batchResult.value.success) {
        result.sent++;
      } else {
        result.failed++;
        const email = batch[index].email;
        const error =
          batchResult.status === 'rejected'
            ? batchResult.reason
            : (batchResult.value as any).error;
        result.errors.push({ email, error });
      }
    });

    // Delay between batches to respect rate limits
    if (i + batchSize < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return result;
}

/**
 * Send newsletter campaign to subscribers
 */
export async function sendNewsletterCampaign(
  recipients: CampaignRecipient[],
  edition: string,
  highlights: Array<{
    title: string;
    description: string;
    link?: string;
  }>,
  featuredProject?: {
    name: string;
    description: string;
    author: string;
    link: string;
  }
): Promise<CampaignResult> {
  logger.info('Starting newsletter campaign', { edition, recipientCount: String(recipients.length) });

  const result = await sendBatchEmails(recipients, (recipient) =>
    generateNewsletterEmail({
      to: recipient.email,
      name: recipient.name,
      edition,
      highlights,
      featuredProject,
      unsubscribeToken: recipient.unsubscribeToken,
    })
  );

  logger.info('Newsletter campaign completed', { sent: String(result.sent), failed: String(result.failed) });

  return result;
}

/**
 * Send product update campaign
 */
export async function sendProductUpdateCampaign(
  recipients: CampaignRecipient[],
  updateTitle: string,
  updateDescription: string,
  features: Array<{
    icon: string;
    title: string;
    description: string;
  }>,
  ctaText?: string,
  ctaLink?: string
): Promise<CampaignResult> {
  logger.info('Starting product update campaign', { updateTitle, recipientCount: String(recipients.length) });

  const result = await sendBatchEmails(recipients, (recipient) =>
    generateProductUpdateEmail({
      to: recipient.email,
      name: recipient.name,
      updateTitle,
      updateDescription,
      features,
      ctaText,
      ctaLink,
      unsubscribeToken: recipient.unsubscribeToken,
    })
  );

  logger.info('Product update campaign completed', { sent: String(result.sent), failed: String(result.failed) });

  return result;
}

/**
 * Send feature announcement campaign
 */
export async function sendFeatureAnnouncementCampaign(
  recipients: CampaignRecipient[],
  featureName: string,
  featureDescription: string,
  benefits: string[],
  howToUse: Array<{
    step: number;
    instruction: string;
  }>,
  videoUrl?: string,
  docsUrl?: string
): Promise<CampaignResult> {
  logger.info('Starting feature announcement campaign', { featureName, recipientCount: String(recipients.length) });

  const result = await sendBatchEmails(recipients, (recipient) =>
    generateFeatureAnnouncementEmail({
      to: recipient.email,
      name: recipient.name,
      featureName,
      featureDescription,
      benefits,
      howToUse,
      videoUrl,
      docsUrl,
      unsubscribeToken: recipient.unsubscribeToken,
    })
  );

  logger.info('Feature announcement campaign completed', { sent: String(result.sent), failed: String(result.failed) });

  return result;
}

/**
 * Send milestone email (triggered by user actions)
 */
export async function sendMilestoneEmail(
  recipient: {
    email: string;
    name: string;
    unsubscribeToken?: string;
  },
  milestoneType: 'first_project' | 'first_deployment' | 'milestone',
  milestoneData: {
    projectName?: string;
    deployUrl?: string;
    platform?: string;
    milestone?: number;
    milestoneCategory?: 'projects' | 'deployments' | 'ai_requests';
  }
): Promise<{ success: boolean; error?: any }> {
  try {
    let emailContent: { subject: string; html: string };

    switch (milestoneType) {
      case 'first_project':
        if (!milestoneData.projectName) {
          throw new Error('projectName is required for first_project milestone');
        }
        emailContent = generateFirstProjectEmail({
          to: recipient.email,
          name: recipient.name,
          projectName: milestoneData.projectName,
          unsubscribeToken: recipient.unsubscribeToken,
        });
        break;

      case 'first_deployment':
        if (!milestoneData.projectName || !milestoneData.deployUrl || !milestoneData.platform) {
          throw new Error('projectName, deployUrl, and platform are required for first_deployment milestone');
        }
        emailContent = generateFirstDeploymentEmail({
          to: recipient.email,
          name: recipient.name,
          projectName: milestoneData.projectName,
          deployUrl: milestoneData.deployUrl,
          platform: milestoneData.platform,
          unsubscribeToken: recipient.unsubscribeToken,
        });
        break;

      case 'milestone':
        if (!milestoneData.milestone || !milestoneData.milestoneCategory) {
          throw new Error('milestone and milestoneCategory are required for milestone type');
        }
        emailContent = generateMilestoneEmail({
          to: recipient.email,
          name: recipient.name,
          milestone: milestoneData.milestone,
          milestoneType: milestoneData.milestoneCategory,
          unsubscribeToken: recipient.unsubscribeToken,
        });
        break;

      default:
        throw new Error(`Unknown milestone type: ${milestoneType}`);
    }

    const result = await sendEmail({
      to: recipient.email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to send milestone email');
    }

    logger.info('Milestone email sent', { email: recipient.email, milestoneType });

    return { success: true };
  } catch (error) {
    logger.error('Failed to send milestone email', { email: recipient.email, error: error.message });
    return { success: false, error };
  }
}

/**
 * Schedule a campaign (basic implementation - can be extended with job queue)
 */
export interface ScheduledCampaign {
  id: string;
  type: 'newsletter' | 'product_update' | 'feature_announcement';
  scheduledFor: Date;
  recipients: CampaignRecipient[];
  data: any;
  status: 'scheduled' | 'running' | 'completed' | 'failed';
  result?: CampaignResult;
}

// In-memory storage (replace with database in production)
const scheduledCampaigns: Map<string, ScheduledCampaign> = new Map();

export function scheduleCampaign(
  type: 'newsletter' | 'product_update' | 'feature_announcement',
  scheduledFor: Date,
  recipients: CampaignRecipient[],
  data: any
): string {
  const id = `campaign_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`;

  const campaign: ScheduledCampaign = {
    id,
    type,
    scheduledFor,
    recipients,
    data,
    status: 'scheduled',
  };

  scheduledCampaigns.set(id, campaign);

  logger.info('Campaign scheduled', { campaignId: id, scheduledFor: scheduledFor.toISOString() });

  return id;
}

/**
 * Process scheduled campaigns (call this from a cron job)
 */
export async function processScheduledCampaigns(): Promise<void> {
  const now = new Date();

  for (const [id, campaign] of scheduledCampaigns.entries()) {
    if (campaign.status === 'scheduled' && campaign.scheduledFor <= now) {
      logger.info('Processing scheduled campaign', { campaignId: id });

      campaign.status = 'running';

      try {
        let result: CampaignResult;

        switch (campaign.type) {
          case 'newsletter':
            result = await sendNewsletterCampaign(
              campaign.recipients,
              campaign.data.edition,
              campaign.data.highlights,
              campaign.data.featuredProject
            );
            break;

          case 'product_update':
            result = await sendProductUpdateCampaign(
              campaign.recipients,
              campaign.data.updateTitle,
              campaign.data.updateDescription,
              campaign.data.features,
              campaign.data.ctaText,
              campaign.data.ctaLink
            );
            break;

          case 'feature_announcement':
            result = await sendFeatureAnnouncementCampaign(
              campaign.recipients,
              campaign.data.featureName,
              campaign.data.featureDescription,
              campaign.data.benefits,
              campaign.data.howToUse,
              campaign.data.videoUrl,
              campaign.data.docsUrl
            );
            break;

          default:
            throw new Error(`Unknown campaign type: ${campaign.type}`);
        }

        campaign.result = result;
        campaign.status = 'completed';

        logger.info('Campaign completed', { campaignId: id });
      } catch (error) {
        logger.error('Campaign failed', { campaignId: id, error: error.message });
        campaign.status = 'failed';
      }
    }
  }
}

/**
 * Get campaign status
 */
export function getCampaignStatus(campaignId: string): ScheduledCampaign | undefined {
  return scheduledCampaigns.get(campaignId);
}

/**
 * Cancel a scheduled campaign
 */
export function cancelCampaign(campaignId: string): boolean {
  const campaign = scheduledCampaigns.get(campaignId);

  if (campaign && campaign.status === 'scheduled') {
    scheduledCampaigns.delete(campaignId);
    logger.info('Campaign cancelled', { campaignId });
    return true;
  }

  return false;
}

export default {
  sendNewsletterCampaign,
  sendProductUpdateCampaign,
  sendFeatureAnnouncementCampaign,
  sendMilestoneEmail,
  scheduleCampaign,
  processScheduledCampaigns,
  getCampaignStatus,
  cancelCampaign,
};
