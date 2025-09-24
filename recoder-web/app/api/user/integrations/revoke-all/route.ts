// Revoke all integrations endpoint for account deletion workflow
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all user's active integrations
    const integrations = await prisma.userIntegration.findMany({
      where: { 
        userId: session.user.id,
        isEnabled: true 
      }
    });

    if (integrations.length === 0) {
      return Response.json({ 
        success: true,
        message: 'No active integrations to revoke',
        revokedCount: 0,
        revokedIntegrations: []
      });
    }

    // Disable all integrations
    const updateResult = await prisma.userIntegration.updateMany({
      where: { 
        userId: session.user.id,
        isEnabled: true
      },
      data: {
        isEnabled: false,
        isConnected: false,
        updatedAt: new Date()
      }
    });

    // Also revoke all webhooks
    await prisma.webhook.updateMany({
      where: { userId: session.user.id },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    // Log the revocation for audit trail
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'INTEGRATIONS_REVOKED_ALL',
          resource: 'system',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          integrationsRevoked: updateResult.count,
          integrationNames: integrations.map(i => i.name),
          timestamp: new Date().toISOString(),
          reason: 'Account deletion preparation'
        }
      }
    });

    const revokedIntegrations = integrations.map(integration => ({
      type: integration.type,
      name: integration.name
    }));

    console.log(`Revoked ${updateResult.count} integrations for user ${session.user.id}`);

    return Response.json({
      success: true,
      message: 'All integrations revoked successfully',
      revokedCount: updateResult.count,
      revokedIntegrations,
    });
  } catch (error) {
    console.error('Revoke all integrations error:', error);
    return Response.json({ error: 'Failed to revoke integrations' }, { status: 500 });
  }
}