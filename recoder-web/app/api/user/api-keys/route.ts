// API Keys management endpoint with full CRUD operations
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1),
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

// Available scopes for API keys
const AVAILABLE_SCOPES = [
  'projects:read',
  'projects:write',
  'projects:delete',
  'chats:read',
  'chats:write',
  'analytics:read',
  'deployments:read',
  'deployments:write',
  'ai:generate',
  'media:read',
  'media:write',
  'admin:read' // Only for admin users
];

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

    // Get user's API keys from database
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyId: true,
        name: true,
        scopes: true,
        restrictions: true,
        lastUsed: true,
        active: true,
        createdAt: true
      }
    });

    // Transform for response (hide sensitive data)
    const transformedKeys = apiKeys.map(key => ({
      id: key.id,
      keyId: key.keyId,
      name: key.name,
      keyPrefix: `rcd_${key.keyId.substring(0, 8)}...`,
      scopes: key.scopes,
      restrictions: key.restrictions,
      status: key.active ? 'active' : 'inactive',
      lastUsed: key.lastUsed?.toISOString(),
      createdAt: key.createdAt.toISOString(),
      // Calculate usage stats (would be from a separate usage table in production)
      usageCount: Math.floor(Math.random() * 1000), // Mock for now
      rateLimit: {
        requests: (key.restrictions as any)?.rateLimit?.requests || 1000,
        period: (key.restrictions as any)?.rateLimit?.period || 'hour',
        remaining: Math.floor(Math.random() * 1000) // Mock remaining
      }
    }));

    return NextResponse.json({
      apiKeys: transformedKeys,
      availableScopes: AVAILABLE_SCOPES,
      total: transformedKeys.length
    });

  } catch (error) {
    console.error('API keys fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
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

    const body = await request.json();
    const { name, scopes, restrictions } = createApiKeySchema.parse(body);
    const userId = session.user.id;

    // Check if user already has maximum number of API keys (limit to 10)
    const existingKeysCount = await prisma.apiKey.count({
      where: { userId, active: true }
    });

    if (existingKeysCount >= 10) {
      return NextResponse.json(
        { error: 'Maximum number of API keys reached (10)' },
        { status: 400 }
      );
    }

    // Validate scopes
    const invalidScopes = scopes.filter(scope => !AVAILABLE_SCOPES.includes(scope));
    if (invalidScopes.length > 0) {
      return NextResponse.json(
        { error: `Invalid scopes: ${invalidScopes.join(', ')}` },
        { status: 400 }
      );
    }

    // Generate secure API key
    const keyId = randomBytes(16).toString('hex');
    const apiKeySecret = randomBytes(32).toString('hex');
    const apiKeyFull = `rcd_${keyId}_${apiKeySecret}`;
    
    // Hash the full key for storage
    const hashedKey = await bcrypt.hash(apiKeyFull, 12);

    // Prepare restrictions
    const keyRestrictions = {
      ...restrictions,
      createdAt: new Date().toISOString(),
      version: '1.0'
    };

    // Create API key in database
    const newApiKey = await prisma.apiKey.create({
      data: {
        keyId,
        userId,
        name,
        hashedKey,
        scopes,
        restrictions: keyRestrictions,
        active: true
      },
      select: {
        id: true,
        keyId: true,
        name: true,
        scopes: true,
        restrictions: true,
        createdAt: true,
        active: true
      }
    });

    // Log the API key creation
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'api_key_created',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          apiKeyId: newApiKey.id,
          keyId: newApiKey.keyId,
          name: newApiKey.name,
          scopes: newApiKey.scopes
        }
      }
    });

    // Security event
    await prisma.securityEvent.create({
      data: {
        userId,
        eventType: 'api_key_created',
        severity: 'medium',
        description: `API key "${name}" created with scopes: ${scopes.join(', ')}`,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          apiKeyId: newApiKey.id,
          scopes,
          restrictions: keyRestrictions
        }
      }
    });

    return NextResponse.json({
      success: true,
      apiKey: {
        id: newApiKey.id,
        keyId: newApiKey.keyId,
        name: newApiKey.name,
        key: apiKeyFull, // Return full key only on creation
        keyPrefix: `rcd_${keyId.substring(0, 8)}...`,
        scopes: newApiKey.scopes,
        restrictions: newApiKey.restrictions,
        status: 'active',
        createdAt: newApiKey.createdAt.toISOString()
      },
      warning: 'This key will only be shown once. Store it securely.',
      message: 'API key created successfully'
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('API key creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create API key' },
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

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('keyId');

    if (!keyId) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates = updateApiKeySchema.parse(body);
    const userId = session.user.id;

    // Verify the API key belongs to the user
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        keyId,
        userId
      }
    });

    if (!existingKey) {
      return NextResponse.json(
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

    return NextResponse.json({
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
      return NextResponse.json(
        { error: 'Invalid update data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('API key update error:', error);
    return NextResponse.json(
      { error: 'Failed to update API key' },
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

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('keyId');

    if (!keyId) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      );
    }

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
      return NextResponse.json(
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

    return NextResponse.json({
      success: true,
      message: 'API key deleted successfully'
    });

  } catch (error) {
    console.error('API key deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}