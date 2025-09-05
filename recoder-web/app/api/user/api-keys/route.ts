// API Keys management endpoint for user settings
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import { randomBytes, createHash } from 'crypto';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  permissions: string[];
  scopes: string[];
  status: "active" | "inactive" | "expired" | "revoked";
  lastUsed?: string;
  usageCount: number;
  rateLimit: {
    requests: number;
    period: "minute" | "hour" | "day";
    remaining: number;
  };
  expiresAt?: string;
  createdAt: string;
  createdBy: string;
  environment: "development" | "production" | "staging";
  ipRestrictions?: string[];
}

interface CreateApiKeyRequest {
  name: string;
  permissions: string[];
  scopes: string[];
  expiresIn: number; // days, 0 = never
  environment: "development" | "production" | "staging";
  rateLimit: {
    requests: number;
    period: "minute" | "hour" | "day";
  };
  ipRestrictions: string[];
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For now, return mock data - in production, this would fetch from database
    const mockApiKeys: ApiKey[] = [
      {
        id: '1',
        name: 'Production API',
        key: 'rcd_prod_abcd1234567890abcdef1234567890abcdef12345678',
        keyPrefix: 'rcd_prod_abcd',
        permissions: ['projects:read', 'projects:write', 'deployments:read'],
        scopes: ['private'],
        status: 'active',
        lastUsed: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        usageCount: 1247,
        rateLimit: {
          requests: 5000,
          period: 'hour',
          remaining: 4832,
        },
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        createdBy: session.user.id,
        environment: 'production',
        ipRestrictions: ['203.0.113.0/24'],
      },
      {
        id: '2',
        name: 'Development Testing',
        key: 'rcd_dev_xyz9876543210xyz9876543210xyz98765432',
        keyPrefix: 'rcd_dev_xyz9',
        permissions: ['projects:read', 'analytics:read'],
        scopes: ['public', 'private'],
        status: 'active',
        lastUsed: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        usageCount: 45,
        rateLimit: {
          requests: 1000,
          period: 'hour',
          remaining: 987,
        },
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        createdBy: session.user.id,
        environment: 'development',
      },
      {
        id: '3',
        name: 'Legacy Integration',
        key: 'rcd_prod_legacy123456789legacy123456789legacy12',
        keyPrefix: 'rcd_prod_lega',
        permissions: ['projects:read'],
        scopes: ['public'],
        status: 'inactive',
        lastUsed: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        usageCount: 892,
        rateLimit: {
          requests: 2000,
          period: 'day',
          remaining: 2000,
        },
        createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 180 days ago
        createdBy: session.user.id,
        environment: 'production',
      }
    ];

    return Response.json({ apiKeys: mockApiKeys });
  } catch (error) {
    console.error('API keys fetch error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data: CreateApiKeyRequest = await request.json();

    // Validate required fields
    if (!data.name || data.permissions.length === 0) {
      return Response.json({ error: 'Name and at least one permission are required' }, { status: 400 });
    }

    // Generate secure API key
    const keyId = generateKeyId();
    const apiKey = generateApiKey(data.environment);
    const keyPrefix = apiKey.substring(0, 12);

    // Calculate expiration date
    const expiresAt = data.expiresIn > 0 
      ? new Date(Date.now() + data.expiresIn * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const newApiKey: ApiKey = {
      id: keyId,
      name: data.name,
      key: apiKey,
      keyPrefix,
      permissions: data.permissions,
      scopes: data.scopes,
      status: 'active',
      usageCount: 0,
      rateLimit: {
        ...data.rateLimit,
        remaining: data.rateLimit.requests,
      },
      expiresAt,
      createdAt: new Date().toISOString(),
      createdBy: session.user.id,
      environment: data.environment,
      ipRestrictions: data.ipRestrictions.length > 0 ? data.ipRestrictions : undefined,
    };

    // In a real implementation, you would:
    // 1. Hash and store the key securely in the database
    // 2. Only store the key prefix for display
    // 3. Never store the full key in plain text

    // For now, simulate database storage
    console.log('Creating API key:', { ...newApiKey, key: '[REDACTED]' });

    // Log the creation for audit purposes
    await logApiKeyEvent(session.user.id, 'API_KEY_CREATED', {
      apiKeyId: keyId,
      name: data.name,
      permissions: data.permissions,
      environment: data.environment,
    });

    return Response.json({ 
      apiKey: newApiKey,
      message: 'API key created successfully' 
    });
  } catch (error) {
    console.error('API key creation error:', error);
    return Response.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const keyId = url.searchParams.get('id') || url.pathname.split('/').pop();
    
    if (!keyId) {
      return Response.json({ error: 'API key ID is required' }, { status: 400 });
    }

    const updates = await request.json();

    // Validate allowed updates
    const allowedFields = ['name', 'status', 'permissions', 'rateLimit', 'ipRestrictions'];
    const validUpdates: any = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        validUpdates[key] = value;
      }
    }

    // In a real implementation, you would:
    // 1. Verify the API key belongs to the user
    // 2. Update the database record
    // 3. Return the updated key info

    console.log(`Updating API key ${keyId}:`, validUpdates);

    await logApiKeyEvent(session.user.id, 'API_KEY_UPDATED', {
      apiKeyId: keyId,
      updates: validUpdates,
    });

    return Response.json({ 
      success: true,
      message: 'API key updated successfully' 
    });
  } catch (error) {
    console.error('API key update error:', error);
    return Response.json({ error: 'Failed to update API key' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const keyId = url.searchParams.get('id') || url.pathname.split('/').pop();
    
    if (!keyId) {
      return Response.json({ error: 'API key ID is required' }, { status: 400 });
    }

    // In a real implementation, you would:
    // 1. Verify the API key belongs to the user
    // 2. Soft delete or hard delete the key from database
    // 3. Add to revocation list for immediate invalidation

    console.log(`Deleting API key ${keyId} for user ${session.user.id}`);

    await logApiKeyEvent(session.user.id, 'API_KEY_DELETED', {
      apiKeyId: keyId,
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

// Special endpoint for revoking keys
export async function revokeApiKey(request: NextRequest, keyId: string) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In a real implementation, you would:
    // 1. Mark the key as revoked
    // 2. Add to revocation blacklist
    // 3. Immediately invalidate all active sessions using this key

    console.log(`Revoking API key ${keyId} for user ${session.user.id}`);

    await logApiKeyEvent(session.user.id, 'API_KEY_REVOKED', {
      apiKeyId: keyId,
    });

    return Response.json({ 
      success: true,
      message: 'API key revoked successfully' 
    });
  } catch (error) {
    console.error('API key revocation error:', error);
    return Response.json({ error: 'Failed to revoke API key' }, { status: 500 });
  }
}

function generateKeyId(): string {
  return randomBytes(8).toString('hex');
}

function generateApiKey(environment: string): string {
  const prefix = environment === 'production' ? 'rcd_prod_' : 
                 environment === 'staging' ? 'rcd_stag_' : 'rcd_dev_';
  const randomPart = randomBytes(20).toString('hex');
  return `${prefix}${randomPart}`;
}

async function logApiKeyEvent(userId: string, action: string, details: any): Promise<void> {
  try {
    // In a real implementation, this would write to an audit log
    console.log('API Key Event:', {
      userId,
      action,
      details,
      timestamp: new Date().toISOString(),
    });

    // Could also call userManager to log to database
    // await userManager.logSecurityEvent(userId, action, details);
  } catch (error) {
    console.error('Failed to log API key event:', error);
    // Don't throw here as it shouldn't break the main operation
  }
}