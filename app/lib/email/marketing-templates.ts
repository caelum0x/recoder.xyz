/**
 * Marketing Email Templates
 *
 * Newsletter, product updates, feature announcements, and milestone emails
 * All templates include proper unsubscribe links and CAN-SPAM compliance
 */

const BASE_URL = process.env.NEXTAUTH_URL || 'https://recoder.xyz';

// Common email styles for marketing emails
const MARKETING_STYLES = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #ffffff;
    background: #000000;
    margin: 0;
    padding: 0;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  }
  .header {
    background: linear-gradient(135deg, #f97316 0%, #9333ea 100%);
    color: white;
    padding: 40px 30px;
    text-align: center;
    border-radius: 16px 16px 0 0;
  }
  .header h1 {
    margin: 0;
    font-size: 32px;
    font-weight: 700;
  }
  .content {
    background: #111111;
    padding: 40px 30px;
    border-radius: 0 0 16px 16px;
    border: 1px solid #333;
    border-top: none;
  }
  .section {
    background: #1a1a1a;
    padding: 24px;
    border-radius: 12px;
    margin: 20px 0;
    border: 1px solid #333;
  }
  .section h2 {
    color: #ffffff;
    margin-top: 0;
    font-size: 20px;
  }
  .section h3 {
    color: #f97316;
    margin-top: 0;
    font-size: 18px;
  }
  .button {
    display: inline-block;
    padding: 16px 40px;
    background: linear-gradient(135deg, #f97316 0%, #9333ea 100%);
    color: white !important;
    text-decoration: none;
    border-radius: 8px;
    margin: 24px 0;
    font-weight: 600;
    font-size: 16px;
    text-align: center;
  }
  .footer {
    text-align: center;
    padding: 30px 20px;
    color: #666;
    font-size: 12px;
    border-top: 1px solid #222;
    margin-top: 20px;
  }
  .footer a {
    color: #999;
    text-decoration: underline;
  }
  p {
    color: #cccccc;
    margin: 16px 0;
    line-height: 1.7;
  }
  ul {
    color: #cccccc;
    margin: 16px 0;
    padding-left: 20px;
  }
  li {
    margin: 8px 0;
  }
  .highlight {
    color: #f97316;
    font-weight: 600;
  }
  .badge {
    display: inline-block;
    background: rgba(249, 115, 22, 0.2);
    color: #f97316;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }
  .divider {
    border-top: 1px solid #333;
    margin: 32px 0;
  }
`;

interface MarketingEmailOptions {
  to: string;
  name: string;
  unsubscribeToken?: string;
}

/**
 * Generate unsubscribe footer with CAN-SPAM compliance
 */
function getUnsubscribeFooter(email: string, unsubscribeToken?: string): string {
  const unsubscribeUrl = unsubscribeToken
    ? `${BASE_URL}/api/newsletter/unsubscribe?token=${unsubscribeToken}`
    : `${BASE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}`;

  return `
    <div class="footer">
      <p style="margin-bottom: 16px;">
        <strong>Recoder.xyz</strong> - AI-Powered Development Platform
      </p>
      <p style="color: #888; margin-bottom: 8px;">
        You're receiving this email because you signed up for Recoder.xyz updates.
      </p>
      <p style="margin-bottom: 16px;">
        <a href="${unsubscribeUrl}" style="color: #f97316;">Unsubscribe from marketing emails</a> |
        <a href="${BASE_URL}/settings/notifications" style="color: #999;">Manage email preferences</a>
      </p>
      <p style="color: #666; font-size: 11px; margin-bottom: 8px;">
        Recoder.xyz, Inc.<br>
        San Francisco, CA 94102, USA
      </p>
      <p style="color: #666; font-size: 11px;">
        © ${new Date().getFullYear()} Recoder.xyz. All rights reserved.
      </p>
    </div>
  `;
}

/**
 * Newsletter Template - Weekly/Monthly Newsletter
 */
export function generateNewsletterEmail(options: {
  to: string;
  name: string;
  edition: string; // e.g., "Week of January 15, 2025"
  highlights: Array<{
    title: string;
    description: string;
    link?: string;
  }>;
  featuredProject?: {
    name: string;
    description: string;
    author: string;
    link: string;
  };
  unsubscribeToken?: string;
}): { subject: string; html: string } {
  const { to, name, edition, highlights, featuredProject, unsubscribeToken } = options;

  const subject = `Recoder.xyz Newsletter - ${edition}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>${MARKETING_STYLES}</style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>🚀 Recoder Newsletter</h1>
            <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">${edition}</p>
          </div>
          <div class="content">
            <h2 style="color: #fff;">Hi ${name}! 👋</h2>
            <p>Welcome to your weekly dose of AI-powered development news, tips, and updates from Recoder.xyz.</p>

            <div class="divider"></div>

            <h2 style="color: #fff; margin-top: 32px;">This Week's Highlights</h2>
            ${highlights.map((item, index) => `
              <div class="section">
                <h3>${index + 1}. ${item.title}</h3>
                <p>${item.description}</p>
                ${item.link ? `<a href="${item.link}" style="color: #f97316; text-decoration: none;">Learn more →</a>` : ''}
              </div>
            `).join('')}

            ${featuredProject ? `
              <div class="divider"></div>

              <h2 style="color: #fff; margin-top: 32px;">
                <span class="badge">Featured Project</span>
              </h2>
              <div class="section" style="background: linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%); border: 1px solid #f97316;">
                <h3 style="font-size: 22px; margin-bottom: 12px;">${featuredProject.name}</h3>
                <p style="font-size: 15px; margin-bottom: 16px;">${featuredProject.description}</p>
                <p style="color: #888; font-size: 14px; margin-bottom: 16px;">
                  Created by <strong style="color: #f97316;">${featuredProject.author}</strong>
                </p>
                <a href="${featuredProject.link}" class="button" style="margin: 0;">View Project</a>
              </div>
            ` : ''}

            <div class="divider"></div>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${BASE_URL}/dashboard" class="button">Open Dashboard</a>
            </div>

            <p style="text-align: center; color: #888; font-size: 14px;">
              Have feedback or questions? Just reply to this email - we read every message!
            </p>
          </div>
          ${getUnsubscribeFooter(to, unsubscribeToken)}
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

/**
 * Product Update Email Template
 */
export function generateProductUpdateEmail(options: {
  to: string;
  name: string;
  updateTitle: string;
  updateDescription: string;
  features: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
  ctaText?: string;
  ctaLink?: string;
  unsubscribeToken?: string;
}): { subject: string; html: string } {
  const { to, name, updateTitle, updateDescription, features, ctaText, ctaLink, unsubscribeToken } = options;

  const subject = `New Update: ${updateTitle}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>${MARKETING_STYLES}</style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
            <h1>${updateTitle}</h1>
          </div>
          <div class="content">
            <h2 style="color: #fff;">Hi ${name}!</h2>
            <p style="font-size: 16px;">${updateDescription}</p>

            <div class="divider"></div>

            <h2 style="color: #fff; margin-top: 32px;">What's New</h2>
            ${features.map(feature => `
              <div class="section">
                <div style="font-size: 32px; margin-bottom: 12px;">${feature.icon}</div>
                <h3>${feature.title}</h3>
                <p>${feature.description}</p>
              </div>
            `).join('')}

            ${ctaText && ctaLink ? `
              <div style="text-align: center; margin: 32px 0;">
                <a href="${ctaLink}" class="button">${ctaText}</a>
              </div>
            ` : ''}

            <div class="divider"></div>

            <p style="color: #888; font-size: 14px; text-align: center;">
              We're constantly working to improve Recoder.xyz. Have suggestions? Reply to this email!
            </p>
          </div>
          ${getUnsubscribeFooter(to, unsubscribeToken)}
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

/**
 * Feature Announcement Email Template
 */
export function generateFeatureAnnouncementEmail(options: {
  to: string;
  name: string;
  featureName: string;
  featureDescription: string;
  benefits: string[];
  howToUse: Array<{
    step: number;
    instruction: string;
  }>;
  videoUrl?: string;
  docsUrl?: string;
  unsubscribeToken?: string;
}): { subject: string; html: string } {
  const { to, name, featureName, featureDescription, benefits, howToUse, videoUrl, docsUrl, unsubscribeToken } = options;

  const subject = `Introducing: ${featureName}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          ${MARKETING_STYLES}
          .step-number {
            display: inline-block;
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, #f97316, #9333ea);
            color: white;
            border-radius: 50%;
            text-align: center;
            line-height: 32px;
            font-weight: bold;
            margin-right: 12px;
            font-size: 16px;
          }
          .benefit-item {
            background: #1a1a1a;
            padding: 16px 20px;
            border-radius: 8px;
            margin: 12px 0;
            border-left: 4px solid #f97316;
          }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);">
            <div style="font-size: 48px; margin-bottom: 16px;">✨</div>
            <h1>Introducing ${featureName}</h1>
          </div>
          <div class="content">
            <h2 style="color: #fff;">Hi ${name}!</h2>
            <p style="font-size: 16px;">${featureDescription}</p>

            <div class="divider"></div>

            <h2 style="color: #fff;">Why You'll Love It</h2>
            ${benefits.map(benefit => `
              <div class="benefit-item">
                <p style="margin: 0; color: #fff;">✓ ${benefit}</p>
              </div>
            `).join('')}

            <div class="divider"></div>

            <h2 style="color: #fff;">How to Use ${featureName}</h2>
            ${howToUse.map(step => `
              <div style="margin: 20px 0; display: flex; align-items: start;">
                <span class="step-number">${step.step}</span>
                <p style="flex: 1; margin: 4px 0;">${step.instruction}</p>
              </div>
            `).join('')}

            ${videoUrl || docsUrl ? `
              <div class="section" style="text-align: center; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(59, 130, 246, 0.1)); border: 1px solid #3b82f6;">
                <h3 style="color: #3b82f6; margin-top: 0;">Learn More</h3>
                ${videoUrl ? `<p><a href="${videoUrl}" style="color: #3b82f6; text-decoration: none;">📹 Watch Video Tutorial →</a></p>` : ''}
                ${docsUrl ? `<p><a href="${docsUrl}" style="color: #3b82f6; text-decoration: none;">📚 Read Documentation →</a></p>` : ''}
              </div>
            ` : ''}

            <div style="text-align: center; margin: 32px 0;">
              <a href="${BASE_URL}/dashboard" class="button" style="background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);">Try ${featureName} Now</a>
            </div>
          </div>
          ${getUnsubscribeFooter(to, unsubscribeToken)}
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

/**
 * User Milestone Email - First Project
 */
export function generateFirstProjectEmail(options: {
  to: string;
  name: string;
  projectName: string;
  unsubscribeToken?: string;
}): { subject: string; html: string } {
  const { to, name, projectName, unsubscribeToken } = options;

  const subject = `Congrats on your first project! 🎉`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>${MARKETING_STYLES}</style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            <div style="font-size: 64px; margin-bottom: 16px;">🎉</div>
            <h1>Congratulations!</h1>
          </div>
          <div class="content">
            <h2 style="color: #fff;">Amazing work, ${name}!</h2>
            <p style="font-size: 16px;">You just created your first project on Recoder.xyz: <strong style="color: #10b981;">${projectName}</strong></p>

            <p>This is just the beginning of your AI-powered development journey. Here's what you can do next:</p>

            <div class="section">
              <h3>🚀 Deploy Your Project</h3>
              <p>Make your project live with one-click deployment to Vercel, Netlify, or Railway. Share it with the world!</p>
            </div>

            <div class="section">
              <h3>🎨 Customize & Enhance</h3>
              <p>Ask the AI to add features, improve styling, or refactor your code. The possibilities are endless.</p>
            </div>

            <div class="section">
              <h3>🔄 Push to GitHub</h3>
              <p>Connect your GitHub account and push your project to version control. Keep your code safe and trackable.</p>
            </div>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${BASE_URL}/dashboard" class="button" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">Continue Building</a>
            </div>

            <div class="divider"></div>

            <p style="text-align: center; color: #888; font-size: 14px;">
              Want to learn more tips and tricks? Check out our <a href="${BASE_URL}/docs" style="color: #10b981;">documentation</a>.
            </p>
          </div>
          ${getUnsubscribeFooter(to, unsubscribeToken)}
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

/**
 * User Milestone Email - First Deployment
 */
export function generateFirstDeploymentEmail(options: {
  to: string;
  name: string;
  projectName: string;
  deployUrl: string;
  platform: string;
  unsubscribeToken?: string;
}): { subject: string; html: string } {
  const { to, name, projectName, deployUrl, platform, unsubscribeToken } = options;

  const subject = `Your project is live! 🚀`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>${MARKETING_STYLES}</style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
            <div style="font-size: 64px; margin-bottom: 16px;">🚀</div>
            <h1>Your Project is Live!</h1>
          </div>
          <div class="content">
            <h2 style="color: #fff;">Incredible, ${name}!</h2>
            <p style="font-size: 16px;">You just deployed <strong style="color: #8b5cf6;">${projectName}</strong> to ${platform}. Your project is now live on the internet!</p>

            <div class="section" style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2)); border: 2px solid #8b5cf6; text-align: center;">
              <h3 style="color: #8b5cf6; margin-bottom: 16px;">Your Live URL</h3>
              <a href="${deployUrl}" style="color: #fff; font-size: 18px; word-break: break-all; text-decoration: none; background: rgba(139, 92, 246, 0.3); padding: 12px 20px; border-radius: 8px; display: inline-block;">
                ${deployUrl}
              </a>
            </div>

            <p>Share your project with friends, add it to your portfolio, or continue building on it. The sky's the limit!</p>

            <div class="section">
              <h3>💡 Pro Tips</h3>
              <ul style="margin: 12px 0; padding-left: 20px;">
                <li>Add a custom domain in your ${platform} dashboard</li>
                <li>Set up automatic deployments from GitHub</li>
                <li>Monitor your site's performance and analytics</li>
                <li>Share your project on social media</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${deployUrl}" class="button" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); margin-right: 12px;">Visit Your Site</a>
              <a href="${BASE_URL}/dashboard" class="button" style="background: #333;">Create Another Project</a>
            </div>
          </div>
          ${getUnsubscribeFooter(to, unsubscribeToken)}
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

/**
 * User Milestone Email - 10 Projects Created
 */
export function generateMilestoneEmail(options: {
  to: string;
  name: string;
  milestone: number;
  milestoneType: 'projects' | 'deployments' | 'ai_requests';
  unsubscribeToken?: string;
}): { subject: string; html: string } {
  const { to, name, milestone, milestoneType, unsubscribeToken } = options;

  const milestoneLabels = {
    projects: 'projects created',
    deployments: 'successful deployments',
    ai_requests: 'AI requests'
  };

  const milestoneIcons = {
    projects: '🎯',
    deployments: '🚀',
    ai_requests: '🤖'
  };

  const subject = `You hit ${milestone} ${milestoneLabels[milestoneType]}! ${milestoneIcons[milestoneType]}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>${MARKETING_STYLES}</style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
            <div style="font-size: 64px; margin-bottom: 16px;">${milestoneIcons[milestoneType]}</div>
            <h1>Milestone Unlocked!</h1>
          </div>
          <div class="content">
            <h2 style="color: #fff;">Wow, ${name}!</h2>
            <p style="font-size: 18px; text-align: center;">
              You've reached <strong style="color: #f59e0b; font-size: 24px;">${milestone} ${milestoneLabels[milestoneType]}</strong>
            </p>

            <div class="section" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.2)); border: 2px solid #f59e0b; text-align: center;">
              <h3 style="color: #f59e0b;">You're on fire! 🔥</h3>
              <p>You're in the top tier of Recoder.xyz users. Keep up the amazing work!</p>
            </div>

            <div class="section">
              <h3>What's Next?</h3>
              <ul style="margin: 12px 0; padding-left: 20px;">
                <li>Try building with a new framework or language</li>
                <li>Experiment with advanced AI features</li>
                <li>Share your projects with the community</li>
                <li>Contribute to open source using Recoder</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${BASE_URL}/dashboard" class="button" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">Keep Building</a>
            </div>

            <p style="text-align: center; color: #888; font-size: 14px;">
              Thanks for being an amazing part of the Recoder.xyz community!
            </p>
          </div>
          ${getUnsubscribeFooter(to, unsubscribeToken)}
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

export default {
  generateNewsletterEmail,
  generateProductUpdateEmail,
  generateFeatureAnnouncementEmail,
  generateFirstProjectEmail,
  generateFirstDeploymentEmail,
  generateMilestoneEmail,
};
