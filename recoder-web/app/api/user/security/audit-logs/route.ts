import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '10')
    const severity = url.searchParams.get('severity')
    const action = url.searchParams.get('action')
    const success = url.searchParams.get('success')
    const timeRange = url.searchParams.get('timeRange')
    const search = url.searchParams.get('search')

    // Build where clause
    const where: any = {
      userId: session.user.id
    }

    if (severity) {
      // Map severity to our audit log system
      if (severity === 'high') {
        where.action = {
          in: ['ACCOUNT_LOCKED', 'SECURITY_BREACH', 'UNAUTHORIZED_ACCESS', 'FAILED_LOGIN_MULTIPLE']
        }
      } else if (severity === 'medium') {
        where.action = {
          in: ['FAILED_LOGIN', 'PASSWORD_RESET_REQUESTED', 'SUSPICIOUS_ACTIVITY', 'API_KEY_CREATED']
        }
      } else if (severity === 'low') {
        where.action = {
          in: ['LOGIN', 'LOGOUT', 'PROFILE_UPDATED', 'PASSWORD_CHANGED']
        }
      }
    }

    if (action) {
      where.action = {
        contains: action,
        mode: 'insensitive'
      }
    }

    if (success !== null) {
      where.success = success === 'true'
    }

    if (timeRange) {
      const now = new Date()
      let startDate: Date
      
      switch (timeRange) {
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(0)
      }
      
      where.timestamp = {
        gte: startDate
      }
    }

    if (search) {
      where.OR = [
        {
          action: {
            contains: search,
            mode: 'insensitive'
          }
        },
        {
          ip: {
            contains: search,
            mode: 'insensitive'
          }
        },
        {
          userAgent: {
            contains: search,
            mode: 'insensitive'
          }
        }
      ]
    }

    // Get total count
    const total = await prisma.auditLog.count({ where })

    // Get paginated results
    const offset = (page - 1) * limit
    const auditLogs = await prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      skip: offset,
      take: limit,
      select: {
        id: true,
        action: true,
        platform: true,
        ip: true,
        userAgent: true,
        success: true,
        createdAt: true,
        metadata: true
      }
    })

    // Transform audit logs to match our component interface
    const transformedLogs = auditLogs.map(log => {
      // Determine severity based on action
      let severity: 'low' | 'medium' | 'high' = 'low'
      
      if (['ACCOUNT_LOCKED', 'SECURITY_BREACH', 'UNAUTHORIZED_ACCESS', 'FAILED_LOGIN_MULTIPLE'].includes(log.action)) {
        severity = 'high'
      } else if (['FAILED_LOGIN', 'PASSWORD_RESET_REQUESTED', 'SUSPICIOUS_ACTIVITY', 'API_KEY_CREATED'].includes(log.action)) {
        severity = 'medium'
      }

      // Generate description based on action
      const descriptions: { [key: string]: string } = {
        'LOGIN': 'User successfully logged in',
        'LOGOUT': 'User logged out',
        'FAILED_LOGIN': 'Failed login attempt',
        'PASSWORD_CHANGED': 'Password was changed',
        'PASSWORD_RESET_REQUESTED': 'Password reset was requested',
        'PROFILE_UPDATED': 'User profile was updated',
        'ACCOUNT_DELETION_REQUESTED': 'Account deletion was requested',
        'API_KEY_CREATED': 'API key was created',
        'API_KEY_DELETED': 'API key was deleted',
        'INTEGRATIONS_REVOKED_ALL': 'All integrations were revoked',
        'SESSION_REVOKED': 'Session was revoked',
        'TWO_FACTOR_ENABLED': 'Two-factor authentication was enabled',
        'TWO_FACTOR_DISABLED': 'Two-factor authentication was disabled',
        'SUSPICIOUS_ACTIVITY': 'Suspicious activity detected',
        'SECURITY_BREACH': 'Security breach detected',
        'UNAUTHORIZED_ACCESS': 'Unauthorized access attempt',
        'ACCOUNT_LOCKED': 'Account was locked due to security concerns'
      }

      // Extract location from metadata or IP
      let location = 'Unknown location'
      if (log.metadata && typeof log.metadata === 'object') {
        const metadata = log.metadata as any
        if (metadata.location) {
          location = metadata.location
        } else if (metadata.city && metadata.country) {
          location = `${metadata.city}, ${metadata.country}`
        }
      }

      return {
        id: log.id,
        action: log.action,
        description: descriptions[log.action] || `${log.action.replace(/_/g, ' ').toLowerCase()}`,
        platform: log.platform,
        ip: log.ip,
        userAgent: log.userAgent,
        location,
        success: log.success,
        timestamp: log.createdAt.toISOString(),
        severity,
        metadata: log.metadata
      }
    })

    return Response.json({
      logs: transformedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('Security audit logs error:', error)
    return Response.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    )
  }
}
