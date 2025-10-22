/**
 * Paddle Checkout API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/billing/checkout/paddle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(session as any).accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Failed to create Paddle checkout:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
