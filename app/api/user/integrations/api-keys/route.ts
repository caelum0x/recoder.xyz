import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';

// API Key schema for validation
const apiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.enum(['read', 'write', 'admin'])).min(1),
  expiresAt: z.string().datetime().optional(),
});

// GET - Fetch user's API keys
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const apiKeys = await prisma.api_keys.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
        keyPrefix: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ apiKeys });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}

// POST - Create new API key
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = apiKeySchema.parse(body);

    // Generate a secure API key
    const apiKey = generateApiKey();
    const keyPrefix = apiKey.substring(0, 10);

    // Hash the API key for storage
    const hashedKey = hashApiKey(apiKey);

    // Create the API key record
    const newApiKey = await prisma.api_keys.create({
      data: {
        id: nanoid(),
        userId: session.user.id,
        name: validatedData.name,
        keyHash: hashedKey,
        keyPrefix: keyPrefix,
        permissions: validatedData.permissions,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
        isActive: true,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        permissions: true,
        keyPrefix: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Create audit log entry
    await prisma.audit_logs.create({
      data: {
        id: nanoid(),
        userId: session.user.id,
        action: 'API_KEY_CREATED',
        resource: 'api_key',
        resourceId: newApiKey.id,
        metadata: {
          apiKeyName: newApiKey.name,
          permissions: newApiKey.permissions,
        },
      },
    });

    // Return the actual key only on creation (user won't see it again)
    return NextResponse.json(
      { 
        apiKey: { ...newApiKey, key: apiKey },
        message: 'API key created successfully. Make sure to copy it now - you won\'t be able to see it again!'
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating API key:', error);
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}

// PUT - Update API key (permissions, name, etc.)
export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'API Key ID is required' },
        { status: 400 }
      );
    }

    // Verify the API key belongs to the user
    const existingApiKey = await prisma.api_keys.findFirst({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!existingApiKey) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    // Update the API key
    const updatedApiKey = await prisma.api_keys.update({
      where: { id: id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        permissions: true,
        keyPrefix: true,
        expiresAt: true,
        isActive: true,
        updatedAt: true,
      },
    });

    // Create audit log entry
    await prisma.audit_logs.create({
      data: {
        id: nanoid(),
        userId: session.user.id,
        action: 'API_KEY_UPDATED',
        resource: 'api_key',
        resourceId: id,
        metadata: {
          changes: updateData,
        },
      },
    });

    return NextResponse.json({
      apiKey: updatedApiKey,
      message: 'API key updated successfully',
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    );
  }
}

// DELETE - Revoke API key
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const apiKeyId = searchParams.get('id');

    if (!apiKeyId) {
      return NextResponse.json(
        { error: 'API Key ID is required' },
        { status: 400 }
      );
    }

    // Verify the API key belongs to the user
    const apiKey = await prisma.api_keys.findFirst({
      where: {
        id: apiKeyId,
        userId: session.user.id,
      },
    });

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    // Delete the API key
    await prisma.api_keys.delete({
      where: { id: apiKeyId },
    });

    // Create audit log entry
    await prisma.audit_logs.create({
      data: {
        id: nanoid(),
        userId: session.user.id,
        action: 'API_KEY_REVOKED',
        resource: 'api_key',
        resourceId: apiKeyId,
        metadata: {
          apiKeyName: apiKey.name,
        },
      },
    });

    return NextResponse.json({
      message: 'API key revoked successfully',
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    return NextResponse.json(
      { error: 'Failed to revoke API key' },
      { status: 500 }
    );
  }
}

// Helper functions
function generateApiKey(): string {
  // Generate a secure random API key
  const prefix = 'rcd_'; // Recoder prefix
  const randomPart = randomBytes(32).toString('hex');
  return `${prefix}${randomPart}`;
}

function hashApiKey(key: string): string {
  // In production, use a proper hashing library like bcrypt
  // This is a simple example
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(key).digest('hex');
}
