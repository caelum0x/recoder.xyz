/**
 * Dodo Pay Payment API
 * Alternative payment processor
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';


export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'unauthorized'
      }, { status: 401 });
    }

    const body = await request.json();
    const { plan, amount } = body;

    // For now, return mock payment intent
    // TODO: Integrate real Dodo Pay API when credentials are available
    const paymentIntent = {
      id: `pi_${Date.now()}`,
      amount: amount * 100,
      currency: 'USD',
      status: 'pending' as const,
      metadata: {
        userId: user.id,
        plan,
        email: user.email
      }
    };

    return NextResponse.json({
      success: true,
      data: paymentIntent
    });

  } catch (error: any) {
    console.error('Dodo Pay error:', error);
    return NextResponse.json({
      success: false,
      error: 'payment_error'
    }, { status: 500 });
  }
}
