// Individual API Key management endpoint
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for individual API key operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  active: z.boolean().optional(),
  restrictions: z.object({
    ipWhitelist: z.array(z.string()).optional(),
    rateLimit: z.object({
      requests: z.number().min(1).max(10000),
      period: z.enum(['minute', 'hour', 'day'])
    }).optional(),
    expiresInDays: z.number().min(0).max(365).optional(),
    allowedPlatforms: z.array(z.enum(['web', 'cli', 'extension', 'mobile', 'api'])).optional()
  }).optional()
});

// GET specific API key details
export async function GET(request: NextRequest, { params }: { params: { keyId: string } }) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'api-key-get');
    } catch {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keyId } = params;
    const userId = session.user.id;

    // Get API key details
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        keyId,
        userId
      },
      select: {
        id: true,
        keyId: true,
        name: true,
        scopes: true,
        restrictions: true,
        active: true,
        lastUsed: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!apiKey) {
      return Response.json(
        { error: 'API key not found or access denied' },
        { status: 404 }
      );
    }

    // Get usage statistics (mock for now - would be from usage tracking service)
    const usageStats = {
      totalRequests: Math.floor(Math.random() * 10000),
      requestsThisMonth: Math.floor(Math.random() * 1000),
      lastRequestAt: apiKey.lastUsed?.toISOString(),
      averageResponseTime: Math.floor(Math.random() * 500) + 50,
      topEndpoints: [
        { endpoint: '/api/projects', requests: Math.floor(Math.random() * 500) },
        { endpoint: '/api/ai/generate', requests: Math.floor(Math.random() * 300) },
        { endpoint: '/api/chats', requests: Math.floor(Math.random() * 200) }
      ],
      errorRate: (Math.random() * 5).toFixed(2) + '%'
    };

    return Response.json({
      apiKey: {
        id: apiKey.id,
        keyId: apiKey.keyId,
        name: apiKey.name,
        keyPrefix: `rcd_${apiKey.keyId.substring(0, 8)}...`,
        scopes: apiKey.scopes,
        restrictions: apiKey.restrictions,
        status: apiKey.active ? 'active' : 'inactive',
        lastUsed: apiKey.lastUsed?.toISOString(),
        createdAt: apiKey.createdAt.toISOString(),
        updatedAt: apiKey.updatedAt?.toISOString(),
        usage: usageStats
      }
    });

  } catch (error) {
    console.error('API key fetch error:', error);
    return Response.json({ error: 'Failed to fetch API key details' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { keyId: string } }) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'api-key-update');
    } catch {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keyId } = params;
    const userId = session.user.id;

    // Validate request body
    const body = await request.json();
    const updates = updateApiKeySchema.parse(body);

    // Verify the API key belongs to the user
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        keyId,
        userId
      }
    });

    if (!existingKey) {
      return Response.json(
        { error: 'API key not found or access denied' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.active !== undefined) updateData.active = updates.active;
    if (updates.restrictions !== undefined) {
      updateData.restrictions = {
        ...existingKey.restrictions,
        ...updates.restrictions,
        updatedAt: new Date().toISOString()
      };
    }

    // Update the API key
    const updatedKey = await prisma.apiKey.update({
      where: { id: existingKey.id },
      data: updateData,
      select: {
        id: true,
        keyId: true,
        name: true,
        scopes: true,
        restrictions: true,
        active: true,
        updatedAt: true
      }
    });

    // Log the update
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'api_key_updated',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          apiKeyId: updatedKey.id,
          keyId: updatedKey.keyId,
          updates: Object.keys(updateData)
        }
      }
    });

    return Response.json({
      success: true,
      apiKey: {
        id: updatedKey.id,
        keyId: updatedKey.keyId,
        name: updatedKey.name,
        keyPrefix: `rcd_${updatedKey.keyId.substring(0, 8)}...`,
        scopes: updatedKey.scopes,
        restrictions: updatedKey.restrictions,
        status: updatedKey.active ? 'active' : 'inactive',
        updatedAt: updatedKey.updatedAt?.toISOString()
      },
      message: 'API key updated successfully'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Invalid update data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('API key update error:', error);
    return Response.json({ error: 'Failed to update API key' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { keyId: string } }) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'api-key-delete');
    } catch {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keyId } = params;
    const userId = session.user.id;

    // Verify the API key belongs to the user
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        keyId,
        userId
      },
      select: {
        id: true,
        keyId: true,
        name: true
      }
    });

    if (!existingKey) {
      return Response.json(
        { error: 'API key not found or access denied' },
        { status: 404 }
      );
    }

    // Soft delete the API key (mark as inactive)
    await prisma.apiKey.update({
      where: { id: existingKey.id },
      data: {
        active: false,
        updatedAt: new Date()
      }
    });

    // Log the deletion
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'api_key_deleted',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          apiKeyId: existingKey.id,
          keyId: existingKey.keyId,
          name: existingKey.name
        }
      }
    });

    // Security event
    await prisma.securityEvent.create({
      data: {
        userId,
        eventType: 'api_key_deleted',
        severity: 'medium',
        description: `API key "${existingKey.name}" was deleted`,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          apiKeyId: existingKey.id,
          keyId: existingKey.keyId,
          name: existingKey.name
        }
      }
    });

    return Response.json({
      success: true,
      message: 'API key deleted successfully'
    });

  } catch (error) {
    console.error('API key deletion error:', error);
    return Response.json({ error: 'Failed to delete API key' }, { status: 500 });
  }
}