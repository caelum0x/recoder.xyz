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
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user security settings
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        twoFactorEnabled: true,
        passwordUpdatedAt: true,
        securitySettings: true
      }
    })

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    const settings: SecuritySettings = {
      twoFactorEnabled: user.twoFactorEnabled || false,
      loginNotifications: user.securitySettings?.loginNotifications ?? true,
      suspiciousActivityAlerts: user.securitySettings?.suspiciousActivityAlerts ?? true,
      sessionTimeout: user.securitySettings?.sessionTimeout ?? 30,
      allowMultipleSessions: user.securitySettings?.allowMultipleSessions ?? true,
      requirePasswordOnSensitive: user.securitySettings?.requirePasswordOnSensitive ?? true,
      passwordLastChanged: user.passwordUpdatedAt?.toISOString() || new Date().toISOString()
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
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updates = await request.json()

    // Validate the updates
    const allowedFields = [
      'loginNotifications',
      'suspiciousActivityAlerts', 
      'sessionTimeout',
      'allowMultipleSessions',
      'requirePasswordOnSensitive'
    ]

    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key]
        return obj
      }, {} as any)

    if (Object.keys(filteredUpdates).length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Validate sessionTimeout
    if (filteredUpdates.sessionTimeout && (filteredUpdates.sessionTimeout < 5 || filteredUpdates.sessionTimeout > 480)) {
      return Response.json({ error: 'Session timeout must be between 5 and 480 minutes' }, { status: 400 })
    }

    // Update user security settings
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        securitySettings: {
          upsert: {
            create: filteredUpdates,
            update: filteredUpdates
          }
        }
      },
      select: {
        twoFactorEnabled: true,
        passwordUpdatedAt: true,
        securitySettings: true
      }
    })

    const settings: SecuritySettings = {
      twoFactorEnabled: updatedUser.twoFactorEnabled || false,
      loginNotifications: updatedUser.securitySettings?.loginNotifications ?? true,
      suspiciousActivityAlerts: updatedUser.securitySettings?.suspiciousActivityAlerts ?? true,
      sessionTimeout: updatedUser.securitySettings?.sessionTimeout ?? 30,
      allowMultipleSessions: updatedUser.securitySettings?.allowMultipleSessions ?? true,
      requirePasswordOnSensitive: updatedUser.securitySettings?.requirePasswordOnSensitive ?? true,
      passwordLastChanged: updatedUser.passwordUpdatedAt?.toISOString() || new Date().toISOString()
    }

    // Log security settings change
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SECURITY_SETTINGS_UPDATED',
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

    return Response.json(settings)
  } catch (error) {
    console.error('Security settings update error:', error)
    return Response.json(
      { error: 'Failed to update security settings' },
      { status: 500 }
    )
  }
}
