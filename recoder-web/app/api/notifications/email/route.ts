// Email notification templates and sending service
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for email operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50,
});

const emailTemplateSchema = z.object({
  templateName: z.enum([
    'welcome',
    'security_alert',
    'deployment_success',
    'deployment_failed',
    'project_invitation',
    'password_reset',
    'email_verification',
    'account_deactivated',
    'weekly_digest',
    'collaboration_request'
  ]),
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  data: z.record(z.any()).optional(),
  scheduledFor: z.string().datetime().optional(),
});

const sendEmailSchema = z.object({
  to: z.array(z.string().email()),
  subject: z.string().min(1).max(200),
  htmlContent: z.string().min(1),
  textContent: z.string().optional(),
  templateData: z.record(z.any()).optional(),
  category: z.enum(['security', 'deployment', 'collaboration', 'marketing', 'updates']).default('updates'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});

// Email templates
const emailTemplates = {
  welcome: {
    subject: 'Welcome to Recoder.xyz! 🚀',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Welcome to Recoder.xyz!</h1>
        <p>Hi {{name}},</p>
        <p>Welcome to Recoder.xyz, your all-in-one platform for building, deploying, and managing modern applications!</p>
        <p>Here's what you can do next:</p>
        <ul>
          <li>Create your first project</li>
          <li>Explore our AI-powered code generation</li>
          <li>Set up deployment pipelines</li>
          <li>Connect with team members</li>
        </ul>
        <a href="{{dashboardUrl}}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">Get Started</a>
        <p>If you have any questions, feel free to reach out to our support team.</p>
        <p>Happy coding!</p>
        <p>The Recoder.xyz Team</p>
      </div>
    `,
  },
  security_alert: {
    subject: '🔒 Security Alert - {{alertType}}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 24px;">
          <h1 style="color: #dc2626; margin: 0;">Security Alert</h1>
        </div>
        <p>Hi {{name}},</p>
        <p>We detected {{alertType}} on your account:</p>
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <strong>Details:</strong><br>
          Time: {{timestamp}}<br>
          IP Address: {{ipAddress}}<br>
          Location: {{location}}<br>
          Device: {{device}}
        </div>
        <p>If this was you, no action is needed. If you don't recognize this activity, please:</p>
        <ol>
          <li>Change your password immediately</li>
          <li>Review your recent activity</li>
          <li>Enable two-factor authentication</li>
        </ol>
        <a href="{{securityUrl}}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">Review Security Settings</a>
        <p>Stay safe,<br>The Recoder.xyz Security Team</p>
      </div>
    `,
  },
  deployment_success: {
    subject: '✅ Deployment Successful - {{projectName}}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-bottom: 24px;">
          <h1 style="color: #16a34a; margin: 0;">Deployment Successful</h1>
        </div>
        <p>Hi {{name}},</p>
        <p>Great news! Your project <strong>{{projectName}}</strong> has been successfully deployed.</p>
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <strong>Deployment Details:</strong><br>
          Project: {{projectName}}<br>
          Environment: {{environment}}<br>
          Version: {{version}}<br>
          Duration: {{duration}}<br>
          URL: <a href="{{deploymentUrl}}">{{deploymentUrl}}</a>
        </div>
        <a href="{{projectUrl}}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">View Project</a>
        <p>Happy deploying!<br>The Recoder.xyz Team</p>
      </div>
    `,
  },
  deployment_failed: {
    subject: '❌ Deployment Failed - {{projectName}}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 24px;">
          <h1 style="color: #dc2626; margin: 0;">Deployment Failed</h1>
        </div>
        <p>Hi {{name}},</p>
        <p>Unfortunately, the deployment of <strong>{{projectName}}</strong> has failed.</p>
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <strong>Error Details:</strong><br>
          Project: {{projectName}}<br>
          Environment: {{environment}}<br>
          Error: {{errorMessage}}<br>
          Build Log: <a href="{{logUrl}}">View Logs</a>
        </div>
        <a href="{{projectUrl}}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">Debug Deployment</a>
        <p>Need help? Check our <a href="{{docsUrl}}">deployment troubleshooting guide</a> or contact support.</p>
        <p>The Recoder.xyz Team</p>
      </div>
    `,
  },
  project_invitation: {
    subject: '👥 You\'ve been invited to join {{projectName}}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Project Invitation</h1>
        <p>Hi {{name}},</p>
        <p><strong>{{inviterName}}</strong> has invited you to collaborate on the project <strong>{{projectName}}</strong>.</p>
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <strong>Project Details:</strong><br>
          Name: {{projectName}}<br>
          Description: {{projectDescription}}<br>
          Role: {{role}}<br>
          Invited by: {{inviterName}}
        </div>
        <a href="{{acceptUrl}}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 8px 8px 8px 0;">Accept Invitation</a>
        <a href="{{declineUrl}}" style="background-color: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 8px 0;">Decline</a>
        <p>This invitation will expire in 7 days.</p>
        <p>The Recoder.xyz Team</p>
      </div>
    `,
  },
};

// GET - Get available email templates
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'email-templates-list');
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
    const templateName = searchParams.get('template');

    if (templateName) {
      // Return specific template
      const template = emailTemplates[templateName as keyof typeof emailTemplates];
      if (!template) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        name: templateName,
        template,
      });
    }

    // Return all available templates
    const templateList = Object.keys(emailTemplates).map(name => ({
      name,
      subject: emailTemplates[name as keyof typeof emailTemplates].subject,
    }));

    return NextResponse.json({
      templates: templateList,
      total: templateList.length,
    });

  } catch (error) {
    console.error('Get email templates error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Send email using template or custom content
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, 'send-email');
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
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'template'; // template or custom

    if (mode === 'template') {
      // Send using template
      const templateData = emailTemplateSchema.parse(body);
      
      const template = emailTemplates[templateData.templateName];
      if (!template) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 }
        );
      }

      // Replace template variables
      let htmlContent = template.html;
      let subject = template.subject;
      
      if (templateData.data) {
        Object.entries(templateData.data).forEach(([key, value]) => {
          const placeholder = `{{${key}}}`;
          htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), String(value));
          subject = subject.replace(new RegExp(placeholder, 'g'), String(value));
        });
      }

      // In production, integrate with email service (SendGrid, AWS SES, etc.)
      console.log('Sending template email:', {
        to: templateData.recipientEmail,
        subject,
        template: templateData.templateName,
        scheduledFor: templateData.scheduledFor,
      });

      // Log email sending
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'email_sent',
          platform: 'web',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            templateName: templateData.templateName,
            recipientEmail: templateData.recipientEmail,
            scheduledFor: templateData.scheduledFor,
          },
        },
      });

      return NextResponse.json({
        message: 'Email sent successfully',
        emailId: `email_${Date.now()}`,
        template: templateData.templateName,
        recipient: templateData.recipientEmail,
        scheduledFor: templateData.scheduledFor,
      });

    } else {
      // Send custom email
      const emailData = sendEmailSchema.parse(body);

      // Check user's email preferences for each recipient
      const recipientPreferences = await Promise.all(
        emailData.to.map(async (email) => {
          const user = await prisma.user.findUnique({
            where: { email },
            include: {
              notificationSettings: {
                select: { preferences: true }
              }
            }
          });

          if (!user) return null;

          const preferences = user.notificationSettings?.preferences as any || {};
          const emailPrefs = preferences.email || {};
          
          return {
            email,
            canSend: emailPrefs.enabled !== false && 
                    (emailPrefs.categories?.[emailData.category] !== false),
            preferences: emailPrefs
          };
        })
      );

      const allowedRecipients = recipientPreferences
        .filter(pref => pref?.canSend)
        .map(pref => pref!.email);

      if (allowedRecipients.length === 0) {
        return NextResponse.json(
          { error: 'No recipients allow emails in this category' },
          { status: 400 }
        );
      }

      // In production, send emails to allowed recipients
      console.log('Sending custom email:', {
        to: allowedRecipients,
        subject: emailData.subject,
        category: emailData.category,
        priority: emailData.priority,
      });

      // Log email sending
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'custom_email_sent',
          platform: 'web',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            subject: emailData.subject,
            category: emailData.category,
            priority: emailData.priority,
            recipientCount: allowedRecipients.length,
            blockedCount: emailData.to.length - allowedRecipients.length,
          },
        },
      });

      return NextResponse.json({
        message: 'Email sent successfully',
        emailId: `email_${Date.now()}`,
        sent: allowedRecipients.length,
        blocked: emailData.to.length - allowedRecipients.length,
        recipients: allowedRecipients,
      });
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid email data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Send email error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const runtime = "edge";
