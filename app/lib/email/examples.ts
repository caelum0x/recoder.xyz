/**
 * Marketing Email Campaign Examples
 *
 * This file contains example usage of the marketing email system.
 * Run these examples from a server-side context (API routes, cron jobs, etc.)
 */

import { sendEmail } from '../email';
import {
  generateNewsletterEmail,
  generateProductUpdateEmail,
  generateFeatureAnnouncementEmail,
  generateFirstProjectEmail,
  generateFirstDeploymentEmail,
  generateMilestoneEmail,
} from './marketing-templates';
import {
  sendNewsletterCampaign,
  sendProductUpdateCampaign,
  sendFeatureAnnouncementCampaign,
  sendMilestoneEmail,
  scheduleCampaign,
} from './campaign-manager';

/**
 * Example 1: Send a weekly newsletter to all active users
 */
export async function exampleWeeklyNewsletter() {
  // In production, fetch from database
  const subscribers = [
    { email: 'user1@example.com', name: 'Alice Johnson', unsubscribeToken: 'token1' },
    { email: 'user2@example.com', name: 'Bob Smith', unsubscribeToken: 'token2' },
  ];

  const result = await sendNewsletterCampaign(
    subscribers,
    'Week of January 15, 2025',
    [
      {
        title: 'Claude 3.5 Sonnet Now Available',
        description: 'Experience faster and more accurate code generation with the latest AI model from Anthropic.',
        link: 'https://recoder.xyz/blog/claude-3-5-sonnet',
      },
      {
        title: 'New Git Integration Features',
        description: 'Push to GitHub, create pull requests, and manage branches directly from Recoder.',
      },
      {
        title: 'Community Spotlight',
        description: 'Check out the amazing projects our users have built this week.',
        link: 'https://recoder.xyz/community/spotlight',
      },
    ],
    {
      name: 'E-Commerce Platform with AI Chat',
      description: 'A full-stack e-commerce site with AI-powered customer support built entirely with Recoder.xyz',
      author: 'Sarah Chen',
      link: 'https://recoder.xyz/projects/featured-123',
    }
  );

  console.log(`Newsletter sent to ${result.sent} users, ${result.failed} failed`);
  return result;
}

/**
 * Example 2: Announce a new product update
 */
export async function exampleProductUpdate() {
  const subscribers = [
    { email: 'user1@example.com', name: 'Alice Johnson', unsubscribeToken: 'token1' },
  ];

  const result = await sendProductUpdateCampaign(
    subscribers,
    'Real-Time Collaboration is Here!',
    'Work together with your team in real-time, right in your browser. See live cursors, share feedback, and build faster together.',
    [
      {
        icon: '👥',
        title: 'Live Presence',
        description: 'See who\'s online and what they\'re working on with live cursor tracking.',
      },
      {
        icon: '💬',
        title: 'Inline Comments',
        description: 'Discuss code changes directly in the editor with threaded comments.',
      },
      {
        icon: '🔄',
        title: 'Auto-Sync',
        description: 'All changes are automatically synchronized across all team members.',
      },
      {
        icon: '🔒',
        title: 'Secure Sharing',
        description: 'Control who can view and edit your projects with granular permissions.',
      },
    ],
    'Try Collaboration Now',
    'https://recoder.xyz/dashboard?feature=collaboration'
  );

  console.log(`Product update sent to ${result.sent} users`);
  return result;
}

/**
 * Example 3: Feature announcement with tutorial
 */
export async function exampleFeatureAnnouncement() {
  const subscribers = [
    { email: 'user1@example.com', name: 'Alice Johnson', unsubscribeToken: 'token1' },
  ];

  const result = await sendFeatureAnnouncementCampaign(
    subscribers,
    'One-Click Deployment',
    'Deploy your projects to production in seconds. We\'ve integrated with Vercel, Netlify, and Railway to make deployment as simple as clicking a button.',
    [
      'Deploy in seconds, not hours',
      'Automatic SSL certificates for secure HTTPS',
      'Custom domain support included',
      'Zero configuration required - it just works',
      'Automatic builds on every git push',
    ],
    [
      {
        step: 1,
        instruction: 'Open your project in the Recoder.xyz dashboard',
      },
      {
        step: 2,
        instruction: 'Click the "Deploy" button in the top right corner',
      },
      {
        step: 3,
        instruction: 'Choose your preferred platform: Vercel, Netlify, or Railway',
      },
      {
        step: 4,
        instruction: 'Authorize the connection and select your deployment settings',
      },
      {
        step: 5,
        instruction: 'Your app is now live! Share the URL with anyone',
      },
    ],
    'https://youtube.com/watch?v=deployment-tutorial',
    'https://recoder.xyz/docs/deployment'
  );

  console.log(`Feature announcement sent to ${result.sent} users`);
  return result;
}

/**
 * Example 4: Send first project milestone email
 */
export async function exampleFirstProject(userEmail: string, userName: string, projectName: string) {
  const result = await sendMilestoneEmail(
    {
      email: userEmail,
      name: userName,
      unsubscribeToken: 'generated-token-here',
    },
    'first_project',
    {
      projectName,
    }
  );

  console.log(`First project email sent to ${userEmail}: ${result.success ? 'success' : 'failed'}`);
  return result;
}

/**
 * Example 5: Send first deployment milestone email
 */
export async function exampleFirstDeployment(
  userEmail: string,
  userName: string,
  projectName: string,
  deployUrl: string,
  platform: string
) {
  const result = await sendMilestoneEmail(
    {
      email: userEmail,
      name: userName,
      unsubscribeToken: 'generated-token-here',
    },
    'first_deployment',
    {
      projectName,
      deployUrl,
      platform,
    }
  );

  console.log(`First deployment email sent to ${userEmail}: ${result.success ? 'success' : 'failed'}`);
  return result;
}

/**
 * Example 6: Send project count milestone email
 */
export async function exampleProjectMilestone(
  userEmail: string,
  userName: string,
  projectCount: number
) {
  const result = await sendMilestoneEmail(
    {
      email: userEmail,
      name: userName,
      unsubscribeToken: 'generated-token-here',
    },
    'milestone',
    {
      milestone: projectCount,
      milestoneCategory: 'projects',
    }
  );

  console.log(`Milestone email sent to ${userEmail}: ${projectCount} projects`);
  return result;
}

/**
 * Example 7: Schedule a newsletter for future delivery
 */
export async function exampleScheduledNewsletter() {
  const subscribers = [
    { email: 'user1@example.com', name: 'Alice Johnson', unsubscribeToken: 'token1' },
  ];

  // Schedule for next Monday at 10 AM
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7));
  nextMonday.setHours(10, 0, 0, 0);

  const campaignId = scheduleCampaign(
    'newsletter',
    nextMonday,
    subscribers,
    {
      edition: `Week of ${nextMonday.toLocaleDateString()}`,
      highlights: [
        {
          title: 'Scheduled Feature',
          description: 'This is a scheduled newsletter',
        },
      ],
    }
  );

  console.log(`Newsletter scheduled for ${nextMonday.toISOString()}, Campaign ID: ${campaignId}`);
  return campaignId;
}

/**
 * Example 8: Send a single newsletter to one user
 */
export async function exampleSingleNewsletter(
  userEmail: string,
  userName: string,
  unsubscribeToken: string
) {
  const { subject, html } = generateNewsletterEmail({
    to: userEmail,
    name: userName,
    edition: 'Week of January 15, 2025',
    highlights: [
      {
        title: 'New Features This Week',
        description: 'Check out what we shipped this week',
        link: 'https://recoder.xyz/changelog',
      },
    ],
    unsubscribeToken,
  });

  const result = await sendEmail({
    to: userEmail,
    subject,
    html,
  });

  console.log(`Newsletter sent to ${userEmail}: ${result.success ? 'success' : 'failed'}`);
  return result;
}

/**
 * Example 9: Check campaign status
 */
export async function exampleCheckCampaignStatus(campaignId: string) {
  const { getCampaignStatus } = await import('./campaign-manager');

  const campaign = getCampaignStatus(campaignId);

  if (campaign) {
    console.log(`Campaign ${campaignId}:`);
    console.log(`- Type: ${campaign.type}`);
    console.log(`- Status: ${campaign.status}`);
    console.log(`- Scheduled for: ${campaign.scheduledFor.toISOString()}`);
    console.log(`- Recipients: ${campaign.recipients.length}`);

    if (campaign.result) {
      console.log(`- Sent: ${campaign.result.sent}`);
      console.log(`- Failed: ${campaign.result.failed}`);
    }
  } else {
    console.log(`Campaign ${campaignId} not found`);
  }

  return campaign;
}

// Export all examples
export default {
  exampleWeeklyNewsletter,
  exampleProductUpdate,
  exampleFeatureAnnouncement,
  exampleFirstProject,
  exampleFirstDeployment,
  exampleProjectMilestone,
  exampleScheduledNewsletter,
  exampleSingleNewsletter,
};
