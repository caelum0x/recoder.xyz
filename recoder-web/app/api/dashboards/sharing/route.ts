// Dashboard Sharing and Collaboration API
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import crypto from 'crypto';

const shareSchema = z.object({
  action: z.enum(['create', 'update', 'revoke', 'list']),
  shareType: z.enum(['public', 'private', 'team', 'link']).optional(),
  permissions: z.object({
    canView: z.boolean().default(true),
    canEdit: z.boolean().default(false),
    canComment: z.boolean().default(false),
    canShare: z.boolean().default(false),
    canExport: z.boolean().default(false)
  }).optional(),
  recipients: z.array(z.object({
    type: z.enum(['user', 'team', 'email']),
    identifier: z.string(), // userId, teamId, or email
    permissions: z.object({
      canView: z.boolean().default(true),
      canEdit: z.boolean().default(false),
      canComment: z.boolean().default(false),
      canShare: z.boolean().default(false),
      canExport: z.boolean().default(false)
    }).optional()
  })).optional(),
  linkOptions: z.object({
    expiresAt: z.string().datetime().optional(),
    password: z.string().min(6).optional(),
    allowDownload: z.boolean().default(false),
    trackViews: z.boolean().default(true),
    maxViews: z.number().min(1).optional()
  }).optional(),
  message: z.string().max(500).optional()
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const dashboardId = searchParams.get('dashboardId');
    const shareType = searchParams.get('shareType');

    if (!dashboardId) {
      return NextResponse.json(
        { error: 'Dashboard ID is required' },
        { status: 400 }
      );
    }

    // Verify user has access to dashboard
    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        userId
      }
    });

    if (!dashboard) {
      return NextResponse.json(
        { error: 'Dashboard not found or access denied' },
        { status: 404 }
      );
    }

    // Get dashboard shares
    const shares = await prisma.dashboardShare.findMany({
      where: {
        dashboardId,
        ...(shareType && { shareType })
      },
      include: {
        sharedByUser: {
          select: { id: true, name: true, email: true }
        },
        sharedWithUser: {
          select: { id: true, name: true, email: true }
        },
        team: {
          select: { id: true, name: true, slug: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform shares data
    const transformedShares = shares.map(share => ({
      id: share.id,
      shareType: share.shareType,
      token: share.token,
      permissions: share.permissions,
      linkOptions: share.linkOptions,
      recipientType: share.recipientType,
      recipientIdentifier: share.recipientIdentifier,
      isActive: share.isActive,
      expiresAt: share.expiresAt?.toISOString(),
      createdAt: share.createdAt.toISOString(),
      lastAccessedAt: share.lastAccessedAt?.toISOString(),
      accessCount: share.accessCount,
      
      // Related data
      sharedBy: share.sharedByUser,
      sharedWith: share.sharedWithUser,
      team: share.team,
      
      // Generate share URL
      shareUrl: share.token ? 
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/shared/${share.token}` : 
        null
    }));

    // Get sharing statistics
    const stats = {
      total: shares.length,
      active: shares.filter(s => s.isActive).length,
      expired: shares.filter(s => s.expiresAt && s.expiresAt < new Date()).length,
      byType: shares.reduce((acc, share) => {
        acc[share.shareType] = (acc[share.shareType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalViews: shares.reduce((sum, share) => sum + share.accessCount, 0)
    };

    return NextResponse.json({
      shares: transformedShares,
      stats,
      dashboard: {
        id: dashboard.id,
        name: dashboard.name,
        isPublic: (dashboard.settings as any)?.isPublic || false
      }
    });

  } catch (error) {
    console.error('Dashboard shares fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard shares' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const dashboardId = searchParams.get('dashboardId');

    if (!dashboardId) {
      return NextResponse.json(
        { error: 'Dashboard ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, shareType, permissions, recipients, linkOptions, message } = shareSchema.parse(body);

    // Verify user owns the dashboard
    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        userId
      }
    });

    if (!dashboard) {
      return NextResponse.json(
        { error: 'Dashboard not found or access denied' },
        { status: 404 }
      );
    }

    switch (action) {
      case 'create':
        return await createDashboardShare(dashboardId, userId, shareType!, permissions, recipients, linkOptions, message, request);
      
      case 'list':
        // This is handled by GET method
        return NextResponse.json({ message: 'Use GET method to list shares' }, { status: 400 });
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid sharing data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Dashboard sharing error:', error);
    return NextResponse.json(
      { error: 'Failed to process sharing request' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get('shareId');

    if (!shareId) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates = body;

    // Verify user owns the shared dashboard
    const share = await prisma.dashboardShare.findFirst({
      where: {
        id: shareId,
        dashboard: { userId }
      }
    });

    if (!share) {
      return NextResponse.json(
        { error: 'Share not found or access denied' },
        { status: 404 }
      );
    }

    // Update share
    const updatedShare = await prisma.dashboardShare.update({
      where: { id: shareId },
      data: {
        ...updates,
        updatedAt: new Date()
      }
    });

    // Log share update
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'dashboard_share_updated',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          shareId,
          dashboardId: share.dashboardId,
          shareType: share.shareType,
          updatedFields: Object.keys(updates)
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Share updated successfully',
      share: {
        id: updatedShare.id,
        shareType: updatedShare.shareType,
        permissions: updatedShare.permissions,
        isActive: updatedShare.isActive,
        updatedAt: updatedShare.updatedAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Share update error:', error);
    return NextResponse.json(
      { error: 'Failed to update share' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get('shareId');

    if (!shareId) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      );
    }

    // Verify user owns the shared dashboard
    const share = await prisma.dashboardShare.findFirst({
      where: {
        id: shareId,
        dashboard: { userId }
      }
    });

    if (!share) {
      return NextResponse.json(
        { error: 'Share not found or access denied' },
        { status: 404 }
      );
    }

    // Delete share
    await prisma.dashboardShare.delete({
      where: { id: shareId }
    });

    // Log share deletion
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'dashboard_share_revoked',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          shareId,
          dashboardId: share.dashboardId,
          shareType: share.shareType,
          recipientType: share.recipientType,
          recipientIdentifier: share.recipientIdentifier
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Share revoked successfully'
    });

  } catch (error) {
    console.error('Share deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke share' },
      { status: 500 }
    );
  }
}

async function createDashboardShare(
  dashboardId: string,
  userId: string,
  shareType: string,
  permissions: any = {},
  recipients: any[] = [],
  linkOptions: any = {},
  message?: string,
  request?: NextRequest
) {
  const shares = [];

  try {
    if (shareType === 'link') {
      // Create shareable link
      const token = crypto.randomBytes(32).toString('hex');
      let expiresAt = null;
      
      if (linkOptions.expiresAt) {
        expiresAt = new Date(linkOptions.expiresAt);
      }

      const linkShare = await prisma.dashboardShare.create({
        data: {
          dashboardId,
          sharedBy: userId,
          shareType: 'link',
          token,
          permissions: {
            canView: true,
            canEdit: false,
            canComment: permissions.canComment || false,
            canShare: false,
            canExport: permissions.canExport || false,
            ...permissions
          },
          linkOptions: {
            password: linkOptions.password || null,
            allowDownload: linkOptions.allowDownload || false,
            trackViews: linkOptions.trackViews !== false,
            maxViews: linkOptions.maxViews || null,
            ...linkOptions
          },
          expiresAt,
          isActive: true,
          recipientType: 'public',
          recipientIdentifier: 'link'
        }
      });

      shares.push({
        ...linkShare,
        shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/shared/${token}`
      });

    } else if (recipients && recipients.length > 0) {
      // Create individual shares for recipients
      for (const recipient of recipients) {
        let recipientData: any = {
          dashboardId,
          sharedBy: userId,
          shareType,
          permissions: {
            canView: true,
            canEdit: false,
            canComment: false,
            canShare: false,
            canExport: false,
            ...permissions,
            ...recipient.permissions
          },
          isActive: true,
          recipientType: recipient.type,
          recipientIdentifier: recipient.identifier
        };

        // Set recipient relationships
        if (recipient.type === 'user') {
          const user = await prisma.user.findUnique({
            where: { id: recipient.identifier }
          });
          if (user) {
            recipientData.sharedWith = user.id;
          }
        } else if (recipient.type === 'team') {
          const team = await prisma.team.findUnique({
            where: { id: recipient.identifier }
          });
          if (team) {
            recipientData.teamId = team.id;
          }
        } else if (recipient.type === 'email') {
          // Generate invite token for email recipients
          recipientData.token = crypto.randomBytes(32).toString('hex');
        }

        const share = await prisma.dashboardShare.create({
          data: recipientData
        });

        shares.push(share);

        // Send notification to recipient
        if (recipient.type === 'user') {
          await prisma.notification.create({
            data: {
              userId: recipient.identifier,
              type: 'dashboard_shared',
              title: 'Dashboard Shared With You',
              content: `A dashboard has been shared with you${message ? `: ${message}` : ''}`,
              actionUrl: `/dashboard/${dashboardId}`,
              metadata: {
                dashboardId,
                sharedBy: userId,
                permissions: recipientData.permissions
              }
            }
          });
        }
      }
    } else {
      // Create public share
      const publicShare = await prisma.dashboardShare.create({
        data: {
          dashboardId,
          sharedBy: userId,
          shareType: 'public',
          permissions: {
            canView: true,
            canEdit: false,
            canComment: permissions.canComment || false,
            canShare: false,
            canExport: permissions.canExport || false,
            ...permissions
          },
          isActive: true,
          recipientType: 'public',
          recipientIdentifier: 'all'
        }
      });

      shares.push(publicShare);
    }

    // Log sharing activity
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'dashboard_shared',
        platform: 'web',
        ip: request?.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request?.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId,
          shareType,
          recipientCount: recipients.length,
          permissions,
          sharesCreated: shares.length
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Dashboard shared successfully (${shares.length} share${shares.length > 1 ? 's' : ''} created)`,
      shares: shares.map(share => ({
        id: share.id,
        shareType: share.shareType,
        token: share.token,
        permissions: share.permissions,
        recipientType: share.recipientType,
        recipientIdentifier: share.recipientIdentifier,
        shareUrl: share.token ? 
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/shared/${share.token}` : 
          null,
        createdAt: share.createdAt.toISOString()
      }))
    }, { status: 201 });

  } catch (error) {
    console.error('Create dashboard share error:', error);
    return NextResponse.json(
      { error: 'Failed to create dashboard share' },
      { status: 500 }
    );
  }
}