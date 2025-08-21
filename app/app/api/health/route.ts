/**
 * Health Check API Route
 * Used by CLI to verify backend availability
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'healthy',
    service: 'recoder-api',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      ai: '/api/ai/chat',
      auth: '/api/auth/login',
      health: '/api/health'
    }
  });
}