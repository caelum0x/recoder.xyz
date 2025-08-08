import { NextRequest, NextResponse } from 'next/server';
import { ServerAuth } from '@/lib/auth/server-auth';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  
  // Clear session cookie
  ServerAuth.clearSessionCookie(response);
  
  return response;
}