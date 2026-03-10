/**
 * Health Check API Route
 * Used by CLI to verify backend availability
 */

import { NextRequest, NextResponse } from 'next/server';
import { traceRequest } from '@/lib/tracing-middleware';
import { detectBillingHealth } from '@/lib/billing-health';
import { prisma } from '@/lib/prisma';

function sanitizeErrorMessage(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(request: NextRequest) {
  const { traceId, applyTraceId } = traceRequest(request);

  const hasResend = !!process.env.RESEND_API_KEY;
  const hasSmtp = !!process.env.SMTP_USER;
  const billing = detectBillingHealth(process.env);
  let dbConnected = false;
  let dbError: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch (error) {
    dbConnected = false;
    dbError = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
  }

  const status = dbConnected ? 'healthy' : 'degraded';

  return applyTraceId(
    NextResponse.json({
      status,
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
      database: {
        connected: dbConnected,
        error: dbError,
      },
      billing,
    })
  );
}
