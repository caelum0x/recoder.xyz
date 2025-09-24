// User data export API endpoint for GDPR compliance
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
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

    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Get related data separately
    const [projects, apiKeys, integrations, notifications, subscriptions] = await Promise.all([
      prisma.project.findMany({
        where: { userId: user.id },
        select: { id: true, name: true, description: true, createdAt: true, updatedAt: true }
      }),
      prisma.apiKey.findMany({
        where: { userId: user.id },
        select: { id: true, name: true, keyPrefix: true, permissions: true, createdAt: true, lastUsedAt: true, isActive: true }
      }),
      prisma.userIntegration.findMany({
        where: { userId: user.id },
        select: { id: true, name: true, type: true, provider: true, isEnabled: true, isConnected: true, createdAt: true, lastSyncAt: true }
      }),
      prisma.notification.findMany({
        where: { userId: user.id },
        select: { id: true, title: true, message: true, type: true, isRead: true, createdAt: true }
      }),
      prisma.subscription.findMany({
        where: { userId: user.id },
        select: { id: true, plan: true, status: true, amount: true, billingCycle: true, createdAt: true }
      })
    ]);

    // Collect all user data
    const exportData = {
      exportInfo: {
        exportDate: new Date().toISOString(),
        exportVersion: '1.0',
        description: 'Complete user data export from Recoder.xyz',
        format: 'JSON',
      },
      personalInformation: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        emailVerified: user.emailVerified?.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString(),
        acquisitionChannel: user.acquisitionChannel,
        companySize: user.companySize,
        industry: user.industry,
        country: user.country,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      accountSettings: {
        twoFactorEnabled: user.twoFactorEnabled || false,
      },
      // Projects data
      projects: projects.map(project => ({
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString()
      })),
      
      // API keys data (without sensitive values)
      apiKeys: apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        permissions: key.permissions,
        isActive: key.isActive,
        createdAt: key.createdAt.toISOString(),
        lastUsedAt: key.lastUsedAt?.toISOString()
      })),
      
      // Integrations data  
      integrations: integrations.map(integration => ({
        id: integration.id,
        name: integration.name,
        type: integration.type,
        provider: integration.provider,
        isEnabled: integration.isEnabled,
        isConnected: integration.isConnected,
        createdAt: integration.createdAt.toISOString(),
        lastSyncAt: integration.lastSyncAt?.toISOString()
      })),
      
      // Notifications data
      notifications: notifications.map(notif => ({
        id: notif.id,
        title: notif.title,
        message: notif.message,
        type: notif.type,
        read: notif.isRead,
        createdAt: notif.createdAt.toISOString()
      })),
      
      // Usage analytics (basic stats)
      usageStats: {
        totalProjects: projects.length,
        totalApiKeys: apiKeys.length,
        totalIntegrations: integrations.length,
        totalNotifications: notifications.length,
      },
      
      // Billing data
      billingInfo: {
        subscriptions: subscriptions.map(sub => ({
          id: sub.id,
          plan: sub.plan,
          status: sub.status,
          amount: sub.amount,
          billingCycle: sub.billingCycle,
          createdAt: sub.createdAt.toISOString()
        }))
      },
      
      dataProcessingConsent: {
        dataRetentionPeriod: '7 years',
        dataProcessingPurpose: 'Service provision, analytics, and customer support',
      }
    };

    // Log the export for compliance
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'user_data_exported',
        resource: 'user',
        resourceId: user.id,
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          exportFormat: 'JSON',
          dataTypes: ['profile', 'projects', 'apiKeys', 'integrations', 'notifications', 'billing']
        }
      }
    });

    // Return as downloadable JSON file
    const jsonString = JSON.stringify(exportData, null, 2);
    
    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="recoder-data-export-${new Date().toISOString().split('T')[0]}.json"`,
        'Content-Length': new TextEncoder().encode(jsonString).length.toString(),
      },
    });

  } catch (error) {
    console.error('Data export error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";