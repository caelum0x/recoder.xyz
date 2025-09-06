// GitHub Webhooks handler API
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import crypto from 'crypto';

// GitHub webhook events we handle
const SUPPORTED_EVENTS = [
  'push',
  'pull_request',
  'issues',
  'issue_comment',
  'pull_request_review',
  'pull_request_review_comment',
  'repository',
  'fork',
  'star',
  'watch',
  'release',
  'deployment',
  'deployment_status',
  'check_run',
  'check_suite',
  'workflow_run',
  'workflow_job'
];

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-hub-signature-256');
    const event = request.headers.get('x-github-event');
    const delivery = request.headers.get('x-github-delivery');
    
    if (!signature || !event || !delivery) {
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      );
    }

    // Get raw body for signature verification
    const body = await request.text();
    const payload = JSON.parse(body);

    // Verify webhook signature
    const isValid = await verifyGitHubSignature(body, signature);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Check if we support this event
    if (!SUPPORTED_EVENTS.includes(event)) {
      console.log(`Unsupported GitHub event: ${event}`);
      return NextResponse.json(
        { message: 'Event not supported' },
        { status: 200 }
      );
    }

    // Find the integration based on repository information
    let integration = null;
    let repositoryId = null;
    
    if (payload.repository) {
      repositoryId = payload.repository.id;
      
      // Find integration by repository or installation
      integration = await findIntegrationForWebhook(payload);
    }

    if (!integration) {
      console.log('No matching integration found for webhook');
      return NextResponse.json(
        { message: 'No matching integration found' },
        { status: 200 }
      );
    }

    // Store webhook event
    const webhookEvent = await prisma.githubWebhookEvent.create({
      data: {
        userId: integration.userId,
        integrationId: integration.id,
        eventType: event,
        deliveryId: delivery,
        repositoryId: repositoryId?.toString(),
        repositoryName: payload.repository?.full_name,
        payload: payload,
        signature: signature,
        processed: false
      }
    });

    // Process the webhook event
    const result = await processWebhookEvent(event, payload, integration, webhookEvent);

    // Update webhook event as processed
    await prisma.githubWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: { 
        processed: true,
        processedAt: new Date(),
        processingResult: result
      }
    });

    // Log the webhook processing
    await prisma.auditLog.create({
      data: {
        userId: integration.userId,
        action: 'github_webhook_processed',
        platform: 'webhook',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'GitHub-Hookshot',
        success: true,
        metadata: {
          event,
          delivery,
          repositoryId,
          repositoryName: payload.repository?.full_name,
          webhookEventId: webhookEvent.id,
          result
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      eventId: webhookEvent.id
    });

  } catch (error) {
    console.error('GitHub webhook processing error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function verifyGitHubSignature(body: string, signature: string): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('GitHub webhook secret not configured');
    return false;
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

async function findIntegrationForWebhook(payload: any) {
  let integration = null;

  // Try to find by installation ID (GitHub App)
  if (payload.installation?.id) {
    integration = await prisma.userIntegration.findFirst({
      where: {
        provider: 'github',
        status: 'active',
        metadata: {
          path: ['installationId'],
          equals: payload.installation.id.toString()
        }
      }
    });
  }

  // Try to find by repository owner (OAuth App)
  if (!integration && payload.repository?.owner?.login) {
    integration = await prisma.userIntegration.findFirst({
      where: {
        provider: 'github',
        status: 'active',
        metadata: {
          path: ['login'],
          equals: payload.repository.owner.login
        }
      }
    });
  }

  return integration;
}

async function processWebhookEvent(
  event: string,
  payload: any,
  integration: any,
  webhookEvent: any
): Promise<any> {
  const result = {
    event,
    action: payload.action || 'unknown',
    processed: true,
    notifications: [],
    updates: []
  };

  try {
    switch (event) {
      case 'push':
        result.updates.push(await processPushEvent(payload, integration));
        break;
        
      case 'pull_request':
        result.updates.push(await processPullRequestEvent(payload, integration));
        break;
        
      case 'issues':
        result.updates.push(await processIssuesEvent(payload, integration));
        break;
        
      case 'repository':
        result.updates.push(await processRepositoryEvent(payload, integration));
        break;
        
      case 'release':
        result.updates.push(await processReleaseEvent(payload, integration));
        break;
        
      case 'workflow_run':
        result.updates.push(await processWorkflowRunEvent(payload, integration));
        break;
        
      case 'star':
      case 'watch':
      case 'fork':
        result.updates.push(await processEngagementEvent(event, payload, integration));
        break;
        
      default:
        result.updates.push({
          type: 'logged',
          message: `Event ${event} logged but not processed`
        });
    }

    // Create notifications for important events
    if (shouldCreateNotification(event, payload.action)) {
      const notification = await createEventNotification(event, payload, integration);
      if (notification) {
        result.notifications.push(notification);
      }
    }

  } catch (error) {
    console.error(`Error processing ${event} webhook:`, error);
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

async function processPushEvent(payload: any, integration: any) {
  const commits = payload.commits || [];
  const branch = payload.ref?.replace('refs/heads/', '');
  
  return {
    type: 'push',
    repository: payload.repository.full_name,
    branch,
    commits: commits.length,
    commitMessages: commits.map((c: any) => c.message).slice(0, 3),
    pusher: payload.pusher.name
  };
}

async function processPullRequestEvent(payload: any, integration: any) {
  const pr = payload.pull_request;
  
  return {
    type: 'pull_request',
    action: payload.action,
    repository: payload.repository.full_name,
    prNumber: pr.number,
    prTitle: pr.title,
    prState: pr.state,
    author: pr.user.login,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref
  };
}

async function processIssuesEvent(payload: any, integration: any) {
  const issue = payload.issue;
  
  return {
    type: 'issues',
    action: payload.action,
    repository: payload.repository.full_name,
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueState: issue.state,
    author: issue.user.login,
    assignees: issue.assignees?.map((a: any) => a.login) || []
  };
}

async function processRepositoryEvent(payload: any, integration: any) {
  return {
    type: 'repository',
    action: payload.action,
    repository: payload.repository.full_name,
    repositoryId: payload.repository.id,
    private: payload.repository.private,
    description: payload.repository.description
  };
}

async function processReleaseEvent(payload: any, integration: any) {
  const release = payload.release;
  
  return {
    type: 'release',
    action: payload.action,
    repository: payload.repository.full_name,
    releaseTag: release.tag_name,
    releaseName: release.name,
    prerelease: release.prerelease,
    draft: release.draft,
    author: release.author.login
  };
}

async function processWorkflowRunEvent(payload: any, integration: any) {
  const workflow = payload.workflow_run;
  
  return {
    type: 'workflow_run',
    action: payload.action,
    repository: payload.repository.full_name,
    workflowName: workflow.name,
    workflowStatus: workflow.status,
    conclusion: workflow.conclusion,
    branch: workflow.head_branch,
    runNumber: workflow.run_number
  };
}

async function processEngagementEvent(event: string, payload: any, integration: any) {
  return {
    type: 'engagement',
    event,
    action: payload.action,
    repository: payload.repository.full_name,
    user: payload.sender?.login,
    starCount: payload.repository.stargazers_count,
    forkCount: payload.repository.forks_count
  };
}

function shouldCreateNotification(event: string, action?: string): boolean {
  const notificationEvents = [
    'pull_request',
    'issues',
    'pull_request_review',
    'issue_comment',
    'release'
  ];

  const notificationActions = [
    'opened',
    'closed',
    'merged',
    'published',
    'submitted',
    'created'
  ];

  return notificationEvents.includes(event) && 
         (!action || notificationActions.includes(action));
}

async function createEventNotification(event: string, payload: any, integration: any) {
  try {
    let title = '';
    let content = '';
    let actionUrl = '';

    switch (event) {
      case 'pull_request':
        const pr = payload.pull_request;
        title = `Pull Request ${payload.action}: ${pr.title}`;
        content = `${pr.user.login} ${payload.action} pull request #${pr.number} in ${payload.repository.full_name}`;
        actionUrl = pr.html_url;
        break;
        
      case 'issues':
        const issue = payload.issue;
        title = `Issue ${payload.action}: ${issue.title}`;
        content = `${issue.user.login} ${payload.action} issue #${issue.number} in ${payload.repository.full_name}`;
        actionUrl = issue.html_url;
        break;
        
      case 'release':
        const release = payload.release;
        title = `Release ${payload.action}: ${release.name || release.tag_name}`;
        content = `${release.author.login} ${payload.action} release ${release.tag_name} in ${payload.repository.full_name}`;
        actionUrl = release.html_url;
        break;
        
      default:
        return null;
    }

    const notification = await prisma.notification.create({
      data: {
        userId: integration.userId,
        type: 'github_event',
        title,
        content,
        actionUrl,
        priority: 'medium',
        metadata: {
          event,
          action: payload.action,
          repository: payload.repository.full_name,
          sender: payload.sender?.login
        }
      }
    });

    return {
      id: notification.id,
      title,
      content,
      type: 'github_event'
    };

  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  // Health check endpoint for webhook
  return NextResponse.json({
    status: 'healthy',
    service: 'GitHub Webhooks Handler',
    timestamp: new Date().toISOString(),
    supportedEvents: SUPPORTED_EVENTS
  });
}