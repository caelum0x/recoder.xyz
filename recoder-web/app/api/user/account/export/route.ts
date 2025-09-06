// User data export API endpoint for GDPR compliance
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for data exports - 5 requests per hour
const limiter = rateLimit({
  interval: 60 * 60 * 1000, // 1 hour
  uniqueTokenPerInterval: 100,
});

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, 'data-export');
    } catch {
      return Response.json(
        { error: 'Too many export requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get comprehensive user data
    const profile = await userManager.getUserProfile(session.user.id);
    
    if (!profile) {
      return Response.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Collect all user data
    const exportData = {
      exportInfo: {
        exportDate: new Date().toISOString(),
        exportVersion: '1.0',
        description: 'Complete user data export from Recoder.xyz',
        format: 'JSON',
      },
      personalInformation: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        username: profile.username,
        bio: profile.bio,
        phone: profile.phone,
        location: profile.location,
        website: profile.website,
        company: profile.company,
        jobTitle: profile.job_title,
        timezone: profile.timezone,
        language: profile.language,
        avatarUrl: profile.avatar_url,
        emailVerified: profile.email_verified,
        phoneVerified: profile.phone_verified,
        createdAt: profile.created_at.toISOString(),
        lastLoginAt: profile.last_login_at?.toISOString(),
        updatedAt: profile.updated_at.toISOString(),
      },
      accountSettings: {
        twoFactorEnabled: profile.two_factor_enabled || false,
        emailNotifications: profile.email_notifications !== false,
        marketingEmails: profile.marketing_emails !== false,
        publicProfile: profile.public_profile !== false,
        showEmail: profile.show_email || false,
        showLocation: profile.show_location !== false,
      },
      // Projects data (if available)
      projects: await getUserProjects(profile.id),
      
      // API keys data (without sensitive values)
      apiKeys: await getUserApiKeys(profile.id),
      
      // Sessions data (without sensitive tokens)
      sessions: await getUserSessions(profile.id),
      
      // Notifications data
      notifications: await getUserNotifications(profile.id),
      
      // Usage analytics (anonymized)
      usageStats: await getUserUsageStats(profile.id),
      
      // Billing data (if available)
      billingInfo: await getUserBillingInfo(profile.id),
      
      dataProcessingConsent: {
        consentGiven: profile.gdpr_consent || false,
        consentDate: profile.gdpr_consent_date?.toISOString(),
        dataRetentionPeriod: '7 years',
        dataProcessingPurpose: 'Service provision, analytics, and customer support',
      }
    };

    // Log the export for compliance
    console.log(`Data export requested by user ${session.user.id}:`, {
      userId: session.user.id,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    // Return as downloadable JSON file
    const jsonString = JSON.stringify(exportData, null, 2);
    
    return new Response(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="recoder-data-export-${new Date().toISOString().split('T')[0]}.json"`,
        'Content-Length': new TextEncoder().encode(jsonString).length.toString(),
      },
    });

  } catch (error) {
    console.error('Data export error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper functions to get user data from different services
async function getUserProjects(userId: string) {
  try {
    // This would integrate with the project service
    // For now, return empty array
    return [];
  } catch (error) {
    console.error('Error fetching user projects:', error);
    return [];
  }
}

async function getUserApiKeys(userId: string) {
  try {
    // This would fetch API keys without sensitive data
    // Return only metadata: created date, name, last used, etc.
    return [];
  } catch (error) {
    console.error('Error fetching user API keys:', error);
    return [];
  }
}

async function getUserSessions(userId: string) {
  try {
    // This would fetch session data without tokens
    // Return only metadata: IP, user agent, created date, last active
    return [];
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    return [];
  }
}

async function getUserNotifications(userId: string) {
  try {
    // This would fetch user notifications
    return [];
  } catch (error) {
    console.error('Error fetching user notifications:', error);
    return [];
  }
}

async function getUserUsageStats(userId: string) {
  try {
    // This would fetch anonymized usage statistics
    return {
      totalProjects: 0,
      totalApiCalls: 0,
      totalTokensUsed: 0,
      averageSessionDuration: 0,
      favoriteFeatures: [],
    };
  } catch (error) {
    console.error('Error fetching user usage stats:', error);
    return {};
  }
}

async function getUserBillingInfo(userId: string) {
  try {
    // This would fetch billing information
    // Include subscription status, payment history (without sensitive card data)
    return {
      subscriptionStatus: 'free',
      subscriptionPlan: 'free',
      billingCycle: null,
      nextBillingDate: null,
      paymentHistory: [], // Dates and amounts only, no card info
    };
  } catch (error) {
    console.error('Error fetching user billing info:', error);
    return {};
  }
}

export const runtime = "edge";