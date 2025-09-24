import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const { amount, description } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Valid amount is required' },
        { status: 400 }
      );
    }

    // Forward overage payment request to backend
    const response = await fetch(`${BACKEND_URL}/api/payments/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('Authorization') || ''
      },
      body: JSON.stringify({
        planId: 'overage',
        planName: 'Overage Payment',
        amount: amount,
        currency: 'USD',
        paymentType: 'one_time',
        frontend: 'web',
        successUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/billing/success`,
        cancelUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/billing`,
        metadata: {
          type: 'overage_payment',
          description: description || 'Overage charges',
          platform: 'recoder-web'
        }
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(result, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      data: {
        payment_link: result.data.checkoutUrl,
        payment_id: result.data.paymentId,
        amount: amount,
        description: description
      }
    });
  } catch (error) {
    console.error('Overage payment creation failed:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}