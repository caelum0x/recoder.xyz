import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
//import { apiKeyRatelimit, getClientIP } from '@/lib/ratelimit'
import { z } from 'zod'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { getClientIP, apiKeyRatelimit } from '@/lib/ratelimit'

// Validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.enum([
    'projects:read',
    'projects:write',
    'templates:read',
    'templates:write',
    'analytics:read',
    'notifications:read',
    'notifications:write'
  ])).min(1),
  expiresIn: z.enum(['30d', '90d', '1y', 'never']).optional().default('90d')
})

const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.enum([
    'projects:read',
    'projects:write',
    'templates:read',
    'templates:write',
    'analytics:read',
    'notifications:read',
    'notifications:write'
  ])).optional(),
  isActive: z.boolean().optional()
})

// Create new API key
export async function POST(request: NextRequest) {
  try {
    // Check rate limiting
    const ip = getClientIP(request)
    const { success } = await apiKeyRatelimit.limit(ip)
    
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    // Verify authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = createApiKeySchema.parse(body)

    // Check if user has reached API key limit
    const existingKeysCount = await prisma.apiKey.count({
      where: { 
        userId: session.user.id,
        active: true
      }
    })

    const maxApiKeys = 10 // Configurable based on subscription
    if (existingKeysCount >= maxApiKeys) {
      return NextResponse.json(
        { error: `Maximum number of API keys (${maxApiKeys}) reached` },
        { status: 400 }
      )
    }

    // Check for duplicate names
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        userId: session.user.id,
        name: validatedData.name,
        active: true
      }
    })

    if (existingKey) {
      return NextResponse.json(
        { error: 'API key with this name already exists' },
        { status: 400 }
      )
    }

    // Generate API key
    const apiKey = generateApiKey()
    const hashedKey = await bcrypt.hash(apiKey, 12)

    // Calculate expiration date
    const expiresAt = calculateExpirationDate(validatedData.expiresIn)

    // Create API key in database
    const createdKey = await prisma.apiKey.create({
      data: {
        userId: session.user.id,
        keyId: crypto.randomUUID(),
        name: validatedData.name,
        hashedKey: hashedKey,
        scopes: validatedData.permissions,
        restrictions: {
          expiresAt: expiresAt?.toISOString(),
          maxUses: null,
          ipWhitelist: [],
          platformRestrictions: []
        },
        lastUsed: null,
        active: true
      },
      select: {
        id: true,
        keyId: true,
        name: true,
        scopes: true,
        restrictions: true,
        createdAt: true,
        lastUsed: true,
        active: true
      }
    })

    // Log the API key creation
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'API_KEY_CREATED',
        platform: 'web',
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'Unknown',
        success: true,
        riskLevel: 'low',
        metadata: {
          name: validatedData.name,
          permissions: validatedData.permissions,
          expiresAt: expiresAt?.toISOString()
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'API key created successfully',
      apiKey: {
        ...createdKey,
        key: apiKey // Only returned once during creation
      },
      warning: 'Save this API key securely. You will not be able to see it again.'
    })

  } catch (error) {
    console.error('Create API key error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid input data', 
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    )
  }
}

// Get all API keys for user
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's API keys
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        keyId: true,
        name: true,
        scopes: true,
        restrictions: true,
        lastUsed: true,
        createdAt: true,
        active: true
      },
      orderBy: { createdAt: 'desc' }
    })

    // Add status information
    const keysWithStatus = apiKeys.map(key => ({
      ...key,
      status: getKeyStatus(key),
      expiresAt: key.restrictions && typeof key.restrictions === 'object' && 'expiresAt' in key.restrictions 
        ? key.restrictions.expiresAt as string 
        : null,
      daysUntilExpiration: key.restrictions && typeof key.restrictions === 'object' && 'expiresAt' in key.restrictions
        ? Math.ceil((new Date(key.restrictions.expiresAt as string).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null
    }))

    return NextResponse.json({
      success: true,
      apiKeys: keysWithStatus,
      total: apiKeys.length,
      active: apiKeys.filter(key => key.active && getKeyStatus(key) === 'active').length
    })

  } catch (error) {
    console.error('Get API keys error:', error)
    return NextResponse.json(
      { error: 'Failed to get API keys' },
      { status: 500 }
    )
  }
}

// Update API key
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get('id')

    if (!keyId) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      )
    }

    // Verify authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = updateApiKeySchema.parse(body)

    // Check if API key exists and belongs to user
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        userId: session.user.id
      }
    })

    if (!existingKey) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      )
    }

    // Check for duplicate names if name is being updated
    if (validatedData.name && validatedData.name !== existingKey.name) {
      const duplicateKey = await prisma.apiKey.findFirst({
        where: {
          userId: session.user.id,
          name: validatedData.name,
          active: true,
          id: { not: keyId }
        }
      })

      if (duplicateKey) {
        return NextResponse.json(
          { error: 'API key with this name already exists' },
          { status: 400 }
        )
      }
    }

    // Update API key
    const updatedKey = await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        name: validatedData.name,
        scopes: validatedData.permissions,
        active: validatedData.isActive ?? true
      },
      select: {
        id: true,
        keyId: true,
        name: true,
        scopes: true,
        restrictions: true,
        lastUsed: true,
        createdAt: true,
        active: true
      }
    })

    // Log the update
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'API_KEY_UPDATED',
        platform: 'web',
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'Unknown',
        success: true,
        riskLevel: 'low',
        metadata: {
          keyId: keyId,
          updatedFields: Object.keys(validatedData),
          changes: validatedData
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'API key updated successfully',
      apiKey: {
        ...updatedKey,
        status: getKeyStatus(updatedKey)
      }
    })

  } catch (error) {
    console.error('Update API key error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    )
  }
}

// Delete API key
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get('id')

    if (!keyId) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      )
    }

    // Verify authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if API key exists and belongs to user
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        userId: session.user.id
      }
    })

    if (!existingKey) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      )
    }

    // Soft delete the API key
    await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        active: false
      }
    })

    // Log the deletion
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'API_KEY_DELETED',
        platform: 'web',
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'Unknown',
        success: true,
        riskLevel: 'medium',
        metadata: {
          keyId: keyId,
          name: existingKey.name,
          deletedAt: new Date().toISOString()
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'API key deleted successfully'
    })

  } catch (error) {
    console.error('Delete API key error:', error)
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    )
  }
}

// Helper functions
function generateApiKey(): string {
  const prefix = 'rcd_'
  const randomBytes = crypto.randomBytes(32).toString('hex')
  return `${prefix}${randomBytes}`
}

function calculateExpirationDate(expiresIn: string): Date | null {
  switch (expiresIn) {
    case '30d':
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    case '90d':
      return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    case '1y':
      return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    case 'never':
      return null
    default:
      return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  }
}

function getKeyStatus(key: any): 'active' | 'expired' | 'inactive' {
  if (!key.active) return 'inactive'
  if (key.restrictions && typeof key.restrictions === 'object' && 'expiresAt' in key.restrictions) {
    const expiresAt = key.restrictions.expiresAt as string
    if (expiresAt && new Date(expiresAt) < new Date()) return 'expired'
  }
  return 'active'
}
