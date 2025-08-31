/**
 * Security Dashboard API
 * Provides security metrics and events data
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { authOptions } from '@/lib/auth';
import { getSecurityDashboardData } from '@/lib/security/router-security-middleware';

export async function GET(request: NextRequest) {
  try {
    // Check authentication and admin permissions
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin (you might want to implement proper role checking)
    if (session.user.email !== 'admin@recoder.xyz') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get security dashboard data
    const securityData = getSecurityDashboardData();
    
    if (!securityData) {
      return NextResponse.json({ 
        error: 'Security service not initialized',
        metrics: {
          totalRequests: 0,
          blockedRequests: 0,
          suspiciousRequests: 0,
          uniqueIPs: 0,
          topAttackTypes: [],
          averageRiskScore: 0
        },
        recentEvents: [],
        config: {
          enableThreatDetection: true,
          enableRateLimiting: true,
          enableAnomalyDetection: true,
          maxRequestsPerMinute: 60,
          maxRequestsPerHour: 1000,
          maxFailedAttemptsBeforeBan: 5,
          banDurationMinutes: 60,
          enableGeoBlocking: false
        }
      });
    }

    return NextResponse.json(securityData);
  } catch (error) {
    console.error('Security dashboard API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}