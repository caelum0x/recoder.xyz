/**
 * Health Check API Route
 * Used by CLI to verify backend availability
 */

import { NextRequest, NextResponse } from 'next/server';
import { traceRequest } from '@/lib/tracing-middleware';

export async function GET(request: NextRequest) {
  const { traceId, applyTraceId } = traceRequest(request);

  const hasResend = !!process.env.RESEND_API_KEY;
  const hasSmtp = !!process.env.SMTP_USER;

  return applyTraceId(
    NextResponse.json({
      status: 'healthy',
      service: 'recoder-api',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      traceId,
      endpoints: {
        ai: '/api/ai/chat',
        auth: '/api/auth/login',
        health: '/api/health',
      },
      email: {
        configured: hasResend || hasSmtp,
        provider: hasResend ? 'resend' : hasSmtp ? 'smtp' : 'none',
      },
    })
  );
}
