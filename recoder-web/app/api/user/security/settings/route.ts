import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface SecuritySettings {
  twoFactorEnabled: boolean
  loginNotifications: boolean
  suspiciousActivityAlerts: boolean
  sessionTimeout: number
  allowMultipleSessions: boolean
  requirePasswordOnSensitive: boolean
  passwordLastChanged: string
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user security settings from backend schema
    const user = await prisma.user.findUnique({
      where: { id: (session.user as any).id },
      select: {
        twoFactorEnabled: true,
        updatedAt: true
      }
    })

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    const settings: SecuritySettings = {
      twoFactorEnabled: user.twoFactorEnabled || false,
      loginNotifications: true, // Default value - not stored in backend schema
      suspiciousActivityAlerts: true, // Default value - not stored in backend schema
      sessionTimeout: 30, // Default 30 minutes - not stored in backend schema
      allowMultipleSessions: true, // Default value - not stored in backend schema
      requirePasswordOnSensitive: true, // Default value - not stored in backend schema
      passwordLastChanged: user.updatedAt?.toISOString() || new Date().toISOString()
    }

    return Response.json(settings)
  } catch (error) {
    console.error('Security settings fetch error:', error)
    return Response.json(
      { error: 'Failed to fetch security settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updates = await request.json()

    // Backend schema only supports twoFactorEnabled updates
    // Other settings like loginNotifications, sessionTimeout are not stored
    const allowedFields = ['twoFactorEnabled']

    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key]
        return obj
      }, {} as any)

    // For settings not stored in backend, we'll just acknowledge them
    // but not actually update anything in the database
    const hasValidUpdates = Object.keys(filteredUpdates).length > 0
    const hasClientOnlyUpdates = ['loginNotifications', 'suspiciousActivityAlerts', 'sessionTimeout', 'allowMultipleSessions', 'requirePasswordOnSensitive']
      .some(key => key in updates)

    if (!hasValidUpdates && !hasClientOnlyUpdates) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Validate sessionTimeout (in minutes from client)
    if (updates.sessionTimeout && (updates.sessionTimeout < 5 || updates.sessionTimeout > 480)) {
      return Response.json({ error: 'Session timeout must be between 5 and 480 minutes' }, { status: 400 })
    }

    let updatedUser
    if (hasValidUpdates) {
      // Update user security settings in backend schema
      updatedUser = await prisma.user.update({
        where: { id: (session.user as any).id },
        data: filteredUpdates,
        select: {
          twoFactorEnabled: true,
          updatedAt: true
        }
      })
    } else {
      // Just fetch current user data for client-only updates
      updatedUser = await prisma.user.findUnique({
        where: { id: (session.user as any).id },
        select: {
          twoFactorEnabled: true,
          updatedAt: true
        }
      })
    }

    const settings: SecuritySettings = {
      twoFactorEnabled: updatedUser?.twoFactorEnabled || false,
      loginNotifications: updates.loginNotifications ?? true,
      suspiciousActivityAlerts: updates.suspiciousActivityAlerts ?? true,
      sessionTimeout: updates.sessionTimeout ?? 30,
      allowMultipleSessions: updates.allowMultipleSessions ?? true,
      requirePasswordOnSensitive: updates.requirePasswordOnSensitive ?? true,
      passwordLastChanged: updatedUser?.updatedAt?.toISOString() || new Date().toISOString()
    }

    // Log security settings change
    if (session.user) {
      await prisma.auditLog.create({
        data: {
          userId: (session.user as any).id,
          action: 'SECURITY_SETTINGS_UPDATED',
          resource: 'system',
          platform: 'web',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            updatedFields: Object.keys(filteredUpdates),
            changes: filteredUpdates
          }
        }
      })
    }

    return Response.json(settings)
  } catch (error) {
    console.error('Security settings update error:', error)
    return Response.json(
      { error: 'Failed to update security settings' },
      { status: 500 }
    )
  }
}
