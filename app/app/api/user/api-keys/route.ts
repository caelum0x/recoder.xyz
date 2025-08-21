/**
 * API Keys Management API
 * Handles creation, listing, and management of CLI API keys
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../../../../lib/database';
import crypto from 'crypto';

const createAPIKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).default(['cli:full']),
  expires_in_days: z.number().optional().default(365)
});

const updateAPIKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  is_active: z.boolean().optional()
});

/**
 * GET - List user's API keys
 */
export async function GET(request: NextRequest) {
  try {
    // For demo, we'll use a fixed user ID
    // In production, extract from authenticated session
    const userId = 'demo_user_1';
    
    const user = await db.getUserById(userId);
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'user_not_found'
      }, { status: 404 });
    }

    // Get all API keys for the user (excluding the actual key hash)
    const apiKeys = [];
    
    // This is a simplified approach - in production you'd have a proper query
    // For now, we'll return the demo key data
    const demoKey = await db.getAPIKey('rck_demo_key_12345678');
    if (demoKey && demoKey.user_id === userId) {
      apiKeys.push({
        id: demoKey.id,
        name: demoKey.name,
        key_prefix: demoKey.key_prefix,
        permissions: demoKey.permissions,
        last_used: demoKey.last_used,
        created_at: demoKey.created_at,
        expires_at: demoKey.expires_at,
        is_active: demoKey.is_active,
        usage_count: demoKey.usage_count
      });
    }

    return NextResponse.json({
      success: true,
      api_keys: apiKeys,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_plan: user.subscription_plan
      }
    });

  } catch (error: any) {
    console.error('API keys list error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}

/**
 * POST - Create new API key
 */
export async function POST(request: NextRequest) {
  try {
    // For demo, we'll use a fixed user ID
    // In production, extract from authenticated session
    const userId = 'demo_user_1';
    
    const user = await db.getUserById(userId);
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'user_not_found'
      }, { status: 404 });
    }

    const body = await request.json();
    const validation = createAPIKeySchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'invalid_request',
        details: validation.error.errors
      }, { status: 400 });
    }

    const { name, permissions, expires_in_days } = validation.data;

    // Generate API key
    const keyId = nanoid(32);
    const apiKey = `rck_${keyId}`;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyPrefix = `rck_${keyId.substring(0, 8)}`;

    // Calculate expiration
    const expiresAt = expires_in_days ? 
      new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000) : 
      undefined;

    // Create API key in database
    const createdKey = await db.createAPIKey({
      user_id: userId,
      key_hash: apiKey, // Store the full key for demo (in production, store hash)
      key_prefix: keyPrefix,
      name: name,
      permissions: permissions,
      expires_at: expiresAt,
      is_active: true,
      usage_count: 0
    });

    // Record API key creation event
    await db.recordBillingEvent({
      user_id: userId,
      subscription_id: 'sub_demo_1', // Get from user's subscription
      event_type: 'subscription_created', // Custom event for API key creation
      metadata: {
        api_key_id: createdKey.id,
        api_key_name: name,
        permissions: permissions
      }
    });

    return NextResponse.json({
      success: true,
      api_key: {
        id: createdKey.id,
        key: apiKey, // Only return the key once during creation
        name: createdKey.name,
        key_prefix: keyPrefix,
        permissions: createdKey.permissions,
        expires_at: createdKey.expires_at,
        created_at: createdKey.created_at,
        usage_count: 0
      },
      warning: 'Save this API key securely. You won\'t be able to see it again.'
    });

  } catch (error: any) {
    console.error('API key creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}

/**
 * PATCH - Update API key
 */
export async function PATCH(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const keyId = searchParams.get('id');
    
    if (!keyId) {
      return NextResponse.json({
        success: false,
        error: 'missing_key_id'
      }, { status: 400 });
    }

    const body = await request.json();
    const validation = updateAPIKeySchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'invalid_request',
        details: validation.error.errors
      }, { status: 400 });
    }

    // For demo purposes, we'll update the demo key if the ID matches
    if (keyId === 'api_key_demo_1') {
      const demoKey = await db.getAPIKey('rck_demo_key_12345678');
      if (demoKey) {
        const updatedKey = await db.updateAPIKey('rck_demo_key_12345678', validation.data);
        
        return NextResponse.json({
          success: true,
          api_key: {
            id: updatedKey?.id,
            name: updatedKey?.name,
            key_prefix: updatedKey?.key_prefix,
            permissions: updatedKey?.permissions,
            is_active: updatedKey?.is_active,
            last_used: updatedKey?.last_used,
            usage_count: updatedKey?.usage_count
          }
        });
      }
    }

    return NextResponse.json({
      success: false,
      error: 'api_key_not_found'
    }, { status: 404 });

  } catch (error: any) {
    console.error('API key update error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}

/**
 * DELETE - Revoke API key
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const keyId = searchParams.get('id');
    
    if (!keyId) {
      return NextResponse.json({
        success: false,
        error: 'missing_key_id'
      }, { status: 400 });
    }

    // For demo purposes, deactivate the key instead of deleting
    if (keyId === 'api_key_demo_1') {
      const updatedKey = await db.updateAPIKey('rck_demo_key_12345678', { 
        is_active: false 
      });
      
      if (updatedKey) {
        return NextResponse.json({
          success: true,
          message: 'API key revoked successfully'
        });
      }
    }

    return NextResponse.json({
      success: false,
      error: 'api_key_not_found'
    }, { status: 404 });

  } catch (error: any) {
    console.error('API key deletion error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}