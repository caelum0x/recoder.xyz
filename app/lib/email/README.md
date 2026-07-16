# Marketing Email Campaigns

A comprehensive email marketing system for Recoder.xyz with newsletter subscriptions, product updates, feature announcements, and user milestone emails.

## Features

- **Newsletter System**: Subscribe/unsubscribe functionality with CAN-SPAM compliance
- **Product Update Emails**: Announce new features and improvements
- **Feature Announcements**: Detailed feature introductions with tutorials
- **User Milestone Emails**: Celebrate user achievements (first project, first deployment, etc.)
- **Campaign Manager**: Batch sending with rate limiting and analytics
- **Unsubscribe Links**: Automatic unsubscribe links in all marketing emails
- **CAN-SPAM Compliance**: Required footer information and opt-out mechanisms

## File Structure

```
app/lib/email/
├── marketing-templates.ts    # Email template generators
├── campaign-manager.ts       # Campaign scheduling and batch sending
└── README.md                 # This file

app/app/api/newsletter/
├── subscribe/route.ts        # Newsletter subscription endpoint
└── unsubscribe/route.ts      # Newsletter unsubscribe endpoint
```

## Email Templates

### 1. Newsletter Email

Send weekly or monthly newsletters with highlights and featured projects.

```typescript
import { generateNewsletterEmail } from '@/lib/email/marketing-templates';
import { sendEmail } from '@/lib/email';

const { subject, html } = generateNewsletterEmail({
  to: 'user@example.com',
  name: 'John Doe',
  edition: 'Week of January 15, 2025',
  highlights: [
    {
      title: 'New AI Model Support',
      description: 'We now support Claude 3.5 Sonnet for faster code generation',
      link: 'https://recoder.xyz/blog/claude-3-5'
    },
    {
      title: 'Performance Improvements',
      description: 'Container startup time reduced by 50%'
    }
  ],
  featuredProject: {
    name: 'AI Chat Application',
    description: 'A full-stack chat app built with Next.js and OpenAI',
    author: 'Jane Smith',
    link: 'https://recoder.xyz/projects/123'
  },
  unsubscribeToken: 'abc123...'
});

await sendEmail({ to: 'user@example.com', subject, html });
```

### 2. Product Update Email

Announce new features and product updates.

```typescript
import { generateProductUpdateEmail } from '@/lib/email/marketing-templates';

const { subject, html } = generateProductUpdateEmail({
  to: 'user@example.com',
  name: 'John Doe',
  updateTitle: 'Introducing Real-Time Collaboration',
  updateDescription: 'Work together with your team in real-time, right in the browser',
  features: [
    {
      icon: '👥',
      title: 'Live Cursors',
      description: 'See where your teammates are working in real-time'
    },
    {
      icon: '💬',
      title: 'Inline Comments',
      description: 'Discuss code changes directly in the editor'
    },
    {
      icon: '🔄',
      title: 'Auto-sync',
      description: 'Changes are automatically synchronized across all team members'
    }
  ],
  ctaText: 'Try Collaboration Now',
  ctaLink: 'https://recoder.xyz/dashboard',
  unsubscribeToken: 'abc123...'
});

await sendEmail({ to: 'user@example.com', subject, html });
```

### 3. Feature Announcement Email

Detailed feature introduction with step-by-step usage instructions.

```typescript
import { generateFeatureAnnouncementEmail } from '@/lib/email/marketing-templates';

const { subject, html } = generateFeatureAnnouncementEmail({
  to: 'user@example.com',
  name: 'John Doe',
  featureName: 'One-Click Deployment',
  featureDescription: 'Deploy your projects to Vercel, Netlify, or Railway with a single click',
  benefits: [
    'Deploy in seconds, not hours',
    'Automatic SSL certificates',
    'Custom domain support',
    'Zero configuration required'
  ],
  howToUse: [
    {
      step: 1,
      instruction: 'Open your project in the dashboard'
    },
    {
      step: 2,
      instruction: 'Click the "Deploy" button in the top right'
    },
    {
      step: 3,
      instruction: 'Select your preferred platform (Vercel, Netlify, or Railway)'
    },
    {
      step: 4,
      instruction: 'Your app is now live! Share the URL with anyone'
    }
  ],
  videoUrl: 'https://youtube.com/watch?v=...',
  docsUrl: 'https://recoder.xyz/docs/deployment',
  unsubscribeToken: 'abc123...'
});

await sendEmail({ to: 'user@example.com', subject, html });
```

### 4. User Milestone Emails

#### First Project

```typescript
import { generateFirstProjectEmail } from '@/lib/email/marketing-templates';

const { subject, html } = generateFirstProjectEmail({
  to: 'user@example.com',
  name: 'John Doe',
  projectName: 'My Awesome App',
  unsubscribeToken: 'abc123...'
});

await sendEmail({ to: 'user@example.com', subject, html });
```

#### First Deployment

```typescript
import { generateFirstDeploymentEmail } from '@/lib/email/marketing-templates';

const { subject, html } = generateFirstDeploymentEmail({
  to: 'user@example.com',
  name: 'John Doe',
  projectName: 'My Awesome App',
  deployUrl: 'https://my-awesome-app.vercel.app',
  platform: 'Vercel',
  unsubscribeToken: 'abc123...'
});

await sendEmail({ to: 'user@example.com', subject, html });
```

#### Achievement Milestone

```typescript
import { generateMilestoneEmail } from '@/lib/email/marketing-templates';

const { subject, html } = generateMilestoneEmail({
  to: 'user@example.com',
  name: 'John Doe',
  milestone: 10,
  milestoneType: 'projects', // or 'deployments' or 'ai_requests'
  unsubscribeToken: 'abc123...'
});

await sendEmail({ to: 'user@example.com', subject, html });
```

## Campaign Manager

Send emails to multiple recipients with rate limiting and batch processing.

### Newsletter Campaign

```typescript
import { sendNewsletterCampaign } from '@/lib/email/campaign-manager';

const recipients = [
  { email: 'user1@example.com', name: 'John Doe', unsubscribeToken: 'token1' },
  { email: 'user2@example.com', name: 'Jane Smith', unsubscribeToken: 'token2' },
  // ... more recipients
];

const result = await sendNewsletterCampaign(
  recipients,
  'Week of January 15, 2025',
  [
    {
      title: 'New Feature Launch',
      description: 'Check out our latest features',
      link: 'https://recoder.xyz/blog'
    }
  ],
  {
    name: 'Featured Project',
    description: 'Amazing project by our community',
    author: 'Community Member',
    link: 'https://recoder.xyz/projects/123'
  }
);

console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
```

### Product Update Campaign

```typescript
import { sendProductUpdateCampaign } from '@/lib/email/campaign-manager';

const result = await sendProductUpdateCampaign(
  recipients,
  'New UI Update',
  'We have redesigned our dashboard for better user experience',
  [
    {
      icon: '🎨',
      title: 'Modern Design',
      description: 'Clean and intuitive interface'
    }
  ],
  'Check it out',
  'https://recoder.xyz/dashboard'
);
```

### Milestone Email (Single Recipient)

```typescript
import { sendMilestoneEmail } from '@/lib/email/campaign-manager';

await sendMilestoneEmail(
  {
    email: 'user@example.com',
    name: 'John Doe',
    unsubscribeToken: 'abc123...'
  },
  'first_project',
  {
    projectName: 'My First Project'
  }
);

await sendMilestoneEmail(
  {
    email: 'user@example.com',
    name: 'John Doe',
    unsubscribeToken: 'abc123...'
  },
  'first_deployment',
  {
    projectName: 'My App',
    deployUrl: 'https://my-app.vercel.app',
    platform: 'Vercel'
  }
);

await sendMilestoneEmail(
  {
    email: 'user@example.com',
    name: 'John Doe',
    unsubscribeToken: 'abc123...'
  },
  'milestone',
  {
    milestone: 100,
    milestoneCategory: 'projects'
  }
);
```

### Scheduled Campaigns

```typescript
import { scheduleCampaign, processScheduledCampaigns } from '@/lib/email/campaign-manager';

// Schedule a campaign for future delivery
const campaignId = scheduleCampaign(
  'newsletter',
  new Date('2025-01-20T10:00:00Z'),
  recipients,
  {
    edition: 'Week of January 20, 2025',
    highlights: [...],
    featuredProject: {...}
  }
);

console.log(`Campaign scheduled: ${campaignId}`);

// Process scheduled campaigns (run this from a cron job)
await processScheduledCampaigns();
```

## Newsletter API Endpoints

### Subscribe to Newsletter

**POST** `/api/newsletter/subscribe`

```bash
curl -X POST https://recoder.xyz/api/newsletter/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "name": "John Doe", "source": "website"}'
```

Response:
```json
{
  "success": true,
  "message": "Successfully subscribed to newsletter!",
  "email": "user@example.com",
  "subscriber": {
    "id": "...",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Check Subscription Status

**GET** `/api/newsletter/subscribe?email=user@example.com`

Response:
```json
{
  "success": true,
  "subscribed": true,
  "email": "user@example.com",
  "name": "John Doe",
  "subscribedSince": "2025-01-15T10:00:00Z"
}
```

### Unsubscribe from Newsletter

**POST** `/api/newsletter/unsubscribe`

```bash
curl -X POST https://recoder.xyz/api/newsletter/unsubscribe \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

Or with token:
```bash
curl -X POST https://recoder.xyz/api/newsletter/unsubscribe \
  -H "Content-Type: application/json" \
  -d '{"token": "abc123..."}'
```

Response:
```json
{
  "success": true,
  "message": "Successfully unsubscribed from newsletter",
  "email": "user@example.com"
}
```

### Get Unsubscribe Page Data

**GET** `/api/newsletter/unsubscribe?token=abc123...`

Response:
```json
{
  "success": true,
  "email": "user@example.com",
  "name": "John Doe",
  "isNewsletterOnly": true
}
```

## Triggering Milestone Emails

You can trigger milestone emails from your application code when users achieve certain milestones:

### Example: First Project Created

```typescript
// In your project creation handler
import { sendMilestoneEmail } from '@/lib/email/campaign-manager';

async function onProjectCreated(userId: string, projectName: string) {
  // Check if this is user's first project
  const projectCount = await prisma.projects.count({
    where: { userId }
  });

  if (projectCount === 1) {
    const user = await prisma.users.findUnique({
      where: { id: userId }
    });

    if (user) {
      await sendMilestoneEmail(
        {
          email: user.email,
          name: user.name,
          unsubscribeToken: generateUnsubscribeToken(user.id)
        },
        'first_project',
        { projectName }
      );
    }
  }
}
```

### Example: First Deployment

```typescript
// In your deployment handler
async function onDeploymentSuccess(userId: string, projectName: string, deployUrl: string, platform: string) {
  const deploymentCount = await prisma.deployments.count({
    where: { userId }
  });

  if (deploymentCount === 1) {
    const user = await prisma.users.findUnique({
      where: { id: userId }
    });

    if (user) {
      await sendMilestoneEmail(
        {
          email: user.email,
          name: user.name,
          unsubscribeToken: generateUnsubscribeToken(user.id)
        },
        'first_deployment',
        { projectName, deployUrl, platform }
      );
    }
  }
}
```

### Example: Project Milestone (10, 25, 50, 100 projects)

```typescript
async function checkProjectMilestone(userId: string) {
  const projectCount = await prisma.projects.count({
    where: { userId }
  });

  const milestones = [10, 25, 50, 100];

  if (milestones.includes(projectCount)) {
    const user = await prisma.users.findUnique({
      where: { id: userId }
    });

    if (user) {
      await sendMilestoneEmail(
        {
          email: user.email,
          name: user.name,
          unsubscribeToken: generateUnsubscribeToken(user.id)
        },
        'milestone',
        {
          milestone: projectCount,
          milestoneCategory: 'projects'
        }
      );
    }
  }
}
```

## CAN-SPAM Compliance

All marketing email templates include:

1. **Unsubscribe Link**: Every email includes a clear unsubscribe link
2. **Physical Address**: Company address in footer
3. **Honest Subject Lines**: Subject lines accurately reflect email content
4. **Clear Sender**: From address clearly identifies Recoder.xyz
5. **Opt-out Processing**: Unsubscribe requests honored within 10 business days

## Rate Limiting

The campaign manager includes built-in rate limiting:

- **Batch Size**: 10 emails per batch (configurable)
- **Delay Between Batches**: 1 second (configurable)
- **Concurrent Sending**: Emails within a batch are sent concurrently

Adjust these settings when calling `sendBatchEmails`:

```typescript
const result = await sendBatchEmails(
  recipients,
  emailGenerator,
  20,  // batch size
  2000 // delay in ms (2 seconds)
);
```

## Analytics

Campaign results include detailed analytics:

```typescript
{
  total: 100,      // Total recipients
  sent: 98,        // Successfully sent
  failed: 2,       // Failed to send
  errors: [        // Error details
    {
      email: 'bounce@example.com',
      error: 'Email address does not exist'
    }
  ]
}
```

## Future Enhancements

1. **Database Schema Updates**:
   - Add `marketingEmailsEnabled` field to users table
   - Create dedicated `newsletter_subscribers` table
   - Add `newsletterUnsubscribeToken` field to users table

2. **Advanced Features**:
   - A/B testing for email campaigns
   - Email open tracking (with privacy-respecting pixels)
   - Click tracking for links
   - Template versioning
   - Personalization based on user behavior
   - Automated drip campaigns

3. **UI Components**:
   - Admin dashboard for creating campaigns
   - Email preview before sending
   - Campaign analytics dashboard
   - Subscriber management interface

## Best Practices

1. **Always Include Unsubscribe Links**: Use the `unsubscribeToken` parameter
2. **Respect User Preferences**: Check if user has opted out before sending
3. **Test Before Sending**: Send test emails to yourself first
4. **Monitor Bounce Rates**: Remove invalid email addresses
5. **Segment Your Audience**: Send relevant emails to relevant users
6. **Time Your Campaigns**: Consider time zones and optimal send times
7. **Mobile-Friendly**: All templates are responsive and mobile-optimized

## Support

For questions or issues, contact the Recoder.xyz development team.
