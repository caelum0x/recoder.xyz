/**
 * Security Configuration API
 * Allows updating security settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { updateSecurityConfig } from '@/lib/security/router-security-middleware';

export async function PUT(request: NextRequest) {
  try {
    // Check authentication and admin permissions
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.user.email !== 'admin@recoder.xyz') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    
    // Validate configuration fields
    const validFields = [
      'enableThreatDetection',
      'enableRateLimiting', 
      'enableAnomalyDetection',
      'maxRequestsPerMinute',
      'maxRequestsPerHour',
      'maxFailedAttemptsBeforeBan',
      'banDurationMinutes',
      'enableGeoBlocking'
    ];

    const config: any = {};
    for (const [key, value] of Object.entries(body)) {
      if (validFields.includes(key)) {
        config[key] = value;
      }
    }

    // Validate numeric fields
    const numericFields = [
      'maxRequestsPerMinute',
      'maxRequestsPerHour', 
      'maxFailedAttemptsBeforeBan',
      'banDurationMinutes'
    ];

    for (const field of numericFields) {
      if (config[field] !== undefined) {
        const value = Number(config[field]);
        if (isNaN(value) || value < 0) {
          return NextResponse.json(
            { error: `${field} must be a positive number` },
            { status: 400 }
          );
        }
        config[field] = value;
      }
    }

    // Update security configuration
    updateSecurityConfig(config);

    return NextResponse.json({ 
      success: true, 
      message: 'Security configuration updated',
      updatedFields: Object.keys(config),
      updatedBy: session.user.email,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Security config API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}