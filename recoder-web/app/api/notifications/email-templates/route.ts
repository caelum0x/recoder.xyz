// Email notification templates and sending service
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for email operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

const sendEmailSchema = z.object({
  templateId: z.string().min(1),
  recipient: z.string().email(),
  variables: z.record(z.any()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  scheduledAt: z.string().datetime().optional(),
});

const templateSchema = z.object({
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(200),
  htmlContent: z.string().min(1),
  textContent: z.string().min(1),
  category: z.enum([
    'system',
    'security',
    'deployment',
    'ai_completion',
    'team_invite',
    'project_update',
    'billing',
    'maintenance',
    'marketing'
  ]),
  variables: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

// Email templates with variables
const EMAIL_TEMPLATES = {
  welcome: {
    name: 'Welcome to Recoder.xyz',
    subject: 'Welcome to Recoder.xyz - Your AI-Powered Development Platform',
    htmlContent: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Recoder.xyz</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px 20px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; }
          .features { margin: 20px 0; }
          .feature { margin: 15px 0; padding: 15px; background: white; border-radius: 5px; border-left: 4px solid #667eea; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Welcome to Recoder.xyz!</h1>
            <p>Your AI-Powered Development Platform</p>
          </div>
          <div class="content">
            <h2>Hi {{name}},</h2>
            <p>Welcome to Recoder.xyz! We're thrilled to have you join our community of developers who are building the future with AI-powered tools.</p>
            
            <div class="features">
              <div class="feature">
                <h3>🤖 AI Code Generation</h3>
                <p>Generate production-ready code in 15+ programming languages with our advanced AI models.</p>
              </div>
              <div class="feature">
                <h3>🎬 Media Processing</h3>
                <p>Professional video and audio processing with FFmpeg integration for all your content needs.</p>
              </div>
              <div class="feature">
                <h3>👥 Team Collaboration</h3>
                <p>Real-time collaboration tools with live coding, voice chat, and project management.</p>
              </div>
              <div class="feature">
                <h3>📱 Progressive Web Apps</h3>
                <p>Build modern PWAs with offline support, push notifications, and native app features.</p>
              </div>
            </div>
            
            <p>Ready to get started? Click the button below to explore your dashboard:</p>
            <a href="{{dashboardUrl}}" class="button">Explore Dashboard</a>
            
            <p>If you have any questions, our support team is here to help. Just reply to this email or visit our help center.</p>
            
            <p>Happy coding!<br>The Recoder.xyz Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Recoder.xyz. All rights reserved.</p>
            <p><a href="{{unsubscribeUrl}}" style="color: #ccc;">Unsubscribe</a> | <a href="{{supportUrl}}" style="color: #ccc;">Support</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: `
      Welcome to Recoder.xyz!
      
      Hi {{name}},
      
      Welcome to Recoder.xyz! We're thrilled to have you join our community of developers.
      
      Here's what you can do with Recoder.xyz:
      
      🤖 AI Code Generation - Generate production-ready code in 15+ languages
      🎬 Media Processing - Professional video and audio processing
      👥 Team Collaboration - Real-time collaboration tools
      📱 Progressive Web Apps - Build modern PWAs with offline support
      
      Get started: {{dashboardUrl}}
      
      Need help? Just reply to this email or visit {{supportUrl}}
      
      Happy coding!
      The Recoder.xyz Team
      
      Unsubscribe: {{unsubscribeUrl}}
    `,
    category: 'system',
    variables: ['name', 'dashboardUrl', 'unsubscribeUrl', 'supportUrl'],
  },
  
  security_alert: {
    name: 'Security Alert',
    subject: '🔒 Security Alert: {{alertType}} - Recoder.xyz',
    htmlContent: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Security Alert</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px 20px; }
          .alert { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .button { display: inline-block; background: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Security Alert</h1>
            <p>Important Security Notice</p>
          </div>
          <div class="content">
            <h2>Security Alert: {{alertType}}</h2>
            
            <div class="alert">
              <strong>Action Required:</strong> {{alertMessage}}
            </div>
            
            <p><strong>Event Details:</strong></p>
            <ul>
              <li><strong>Time:</strong> {{timestamp}}</li>
              <li><strong>IP Address:</strong> {{ipAddress}}</li>
              <li><strong>Location:</strong> {{location}}</li>
              <li><strong>Device:</strong> {{device}}</li>
            </ul>
            
            <p>If this was you, no action is needed. If you don't recognize this activity:</p>
            <ol>
              <li>Change your password immediately</li>
              <li>Enable two-factor authentication</li>
              <li>Review your account activity</li>
              <li>Contact our security team</li>
            </ol>
            
            <a href="{{securityUrl}}" class="button">Review Security Settings</a>
            
            <p>If you need assistance, contact our security team immediately at security@recoder.xyz</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Recoder.xyz Security Team</p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: `
      🔒 SECURITY ALERT: {{alertType}}
      
      Action Required: {{alertMessage}}
      
      Event Details:
      - Time: {{timestamp}}
      - IP Address: {{ipAddress}}
      - Location: {{location}}
      - Device: {{device}}
      
      If this wasn't you:
      1. Change your password immediately
      2. Enable two-factor authentication
      3. Review your account activity
      4. Contact security@recoder.xyz
      
      Review Security Settings: {{securityUrl}}
      
      Recoder.xyz Security Team
    `,
    category: 'security',
    variables: ['alertType', 'alertMessage', 'timestamp', 'ipAddress', 'location', 'device', 'securityUrl'],
  },
  
  team_invite: {
    name: 'Team Invitation',
    subject: '👥 You\'re invited to join {{teamName}} on Recoder.xyz',
    htmlContent: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Team Invitation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px 20px; }
          .button { display: inline-block; background: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; }
          .team-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>👥 Team Invitation</h1>
            <p>Join {{teamName}} on Recoder.xyz</p>
          </div>
          <div class="content">
            <h2>You've been invited to join a team!</h2>
            
            <p>{{inviterName}} has invited you to join <strong>{{teamName}}</strong> on Recoder.xyz.</p>
            
            <div class="team-info">
              <h3>Team: {{teamName}}</h3>
              <p><strong>Invited by:</strong> {{inviterName}} ({{inviterEmail}})</p>
              <p><strong>Role:</strong> {{role}}</p>
              {{#if message}}<p><strong>Message:</strong> "{{message}}"</p>{{/if}}
              <p><strong>Team Description:</strong> {{teamDescription}}</p>
            </div>
            
            <p>As a {{role}}, you'll be able to:</p>
            <ul>
              <li>Collaborate on team projects</li>
              <li>Access shared resources and templates</li>
              <li>Participate in real-time coding sessions</li>
              <li>Use team-wide integrations and workflows</li>
            </ul>
            
            <a href="{{inviteUrl}}" class="button">Accept Invitation</a>
            
            <p>This invitation expires on {{expiresAt}}. If you don't want to join this team, you can safely ignore this email.</p>
            
            <p>Questions about this invitation? Contact {{inviterName}} at {{inviterEmail}} or our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Recoder.xyz. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: `
      👥 Team Invitation - Join {{teamName}} on Recoder.xyz
      
      {{inviterName}} has invited you to join {{teamName}} on Recoder.xyz.
      
      Team Details:
      - Name: {{teamName}}
      - Invited by: {{inviterName}} ({{inviterEmail}})
      - Your Role: {{role}}
      {{#if message}}- Message: "{{message}}"{{/if}}
      - Description: {{teamDescription}}
      
      Accept Invitation: {{inviteUrl}}
      
      This invitation expires on {{expiresAt}}.
      
      Questions? Contact {{inviterEmail}} or support@recoder.xyz
      
      Recoder.xyz Team
    `,
    category: 'team_invite',
    variables: ['teamName', 'inviterName', 'inviterEmail', 'role', 'message', 'teamDescription', 'inviteUrl', 'expiresAt'],
  },
  
  deployment_complete: {
    name: 'Deployment Complete',
    subject: '🚀 Deployment Complete: {{projectName}} - {{status}}',
    htmlContent: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Deployment Complete</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px 20px; }
          .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; }
          .deployment-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Deployment {{status}}</h1>
            <p>{{projectName}}</p>
          </div>
          <div class="content">
            {{#if success}}
            <div class="success">
              <strong>✅ Deployment Successful!</strong> Your project is now live.
            </div>
            {{else}}
            <div class="error">
              <strong>❌ Deployment Failed!</strong> There were issues during deployment.
            </div>
            {{/if}}
            
            <div class="deployment-info">
              <h3>Deployment Details</h3>
              <p><strong>Project:</strong> {{projectName}}</p>
              <p><strong>Environment:</strong> {{environment}}</p>
              <p><strong>Version:</strong> {{version}}</p>
              <p><strong>Started:</strong> {{startTime}}</p>
              <p><strong>Completed:</strong> {{endTime}}</p>
              <p><strong>Duration:</strong> {{duration}}</p>
              {{#if url}}<p><strong>Live URL:</strong> <a href="{{url}}">{{url}}</a></p>{{/if}}
            </div>
            
            {{#if success}}
            <p>🎉 Congratulations! Your deployment was successful. Your application is now live and accessible to users.</p>
            {{#if url}}<a href="{{url}}" class="button">View Live Site</a>{{/if}}
            {{else}}
            <p>😞 Your deployment encountered issues. Please review the error logs and try again.</p>
            <p><strong>Error:</strong> {{errorMessage}}</p>
            {{/if}}
            
            <a href="{{dashboardUrl}}" class="button">View Dashboard</a>
            
            {{#if logs}}<p>View detailed logs in your project dashboard.</p>{{/if}}
          </div>
          <div class="footer">
            <p>&copy; 2024 Recoder.xyz. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: `
      🚀 Deployment {{status}}: {{projectName}}
      
      {{#if success}}✅ Deployment Successful!{{else}}❌ Deployment Failed!{{/if}}
      
      Deployment Details:
      - Project: {{projectName}}
      - Environment: {{environment}}
      - Version: {{version}}
      - Started: {{startTime}}
      - Completed: {{endTime}}
      - Duration: {{duration}}
      {{#if url}}- Live URL: {{url}}{{/if}}
      
      {{#if success}}
      🎉 Your application is now live!
      {{#if url}}View: {{url}}{{/if}}
      {{else}}
      😞 Deployment failed: {{errorMessage}}
      {{/if}}
      
      Dashboard: {{dashboardUrl}}
      
      Recoder.xyz Team
    `,
    category: 'deployment',
    variables: ['projectName', 'status', 'success', 'environment', 'version', 'startTime', 'endTime', 'duration', 'url', 'errorMessage', 'dashboardUrl'],
  },
};

// GET - Get email templates
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 20, 'email-templates');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let templates = Object.entries(EMAIL_TEMPLATES);
    
    if (category) {
      templates = templates.filter(([_, template]) => template.category === category);
    }

    return NextResponse.json({
      templates: templates.map(([id, template]) => ({
        id,
        ...template,
      })),
      categories: ['system', 'security', 'deployment', 'ai_completion', 'team_invite', 'project_update', 'billing', 'maintenance', 'marketing'],
    });

  } catch (error) {
    console.error('Get email templates error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Send email notification
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'send-email');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { templateId, recipient, variables, priority, scheduledAt } = sendEmailSchema.parse(body);

    // Get template
    const template = EMAIL_TEMPLATES[templateId as keyof typeof EMAIL_TEMPLATES];
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Replace variables in template
    const replacedSubject = replaceVariables(template.subject, variables || {});
    const replacedHtmlContent = replaceVariables(template.htmlContent, variables || {});
    const replacedTextContent = replaceVariables(template.textContent, variables || {});

    // In a real implementation, you would integrate with an email service like:
    // - SendGrid
    // - Mailgun
    // - AWS SES
    // - Resend
    // For now, we'll simulate sending
    
    const emailData = {
      templateId,
      recipient,
      subject: replacedSubject,
      htmlContent: replacedHtmlContent,
      textContent: replacedTextContent,
      priority,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      sentAt: scheduledAt ? null : new Date(),
      status: scheduledAt ? 'scheduled' : 'sent',
    };

    // Log the email sending attempt
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'email_sent',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          templateId,
          recipient,
          priority,
          scheduledAt,
        },
      },
    });

    // In production, this would actually send the email
    console.log('Email would be sent:', emailData);

    return NextResponse.json({
      message: scheduledAt ? 'Email scheduled successfully' : 'Email sent successfully',
      emailId: `email_${Date.now()}`,
      status: emailData.status,
    });

  } catch (error) {
    console.error('Send email error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to replace variables in template strings
function replaceVariables(template: string, variables: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
    return variables[variable] !== undefined ? String(variables[variable]) : match;
  });
}

export const runtime = "edge";
