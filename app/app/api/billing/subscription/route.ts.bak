import { NextRequest, NextResponse } from 'next/server';

const PRODUCTION_ENGINE_URL = process.env.PRODUCTION_ENGINE_URL || 'http://localhost:4567';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'anonymous';
    
    const response = await fetch(`${PRODUCTION_ENGINE_URL}/api/billing/subscription/${userId}`, {
      headers: {
        'x-user-id': userId,
        'x-admin-key': process.env.ADMIN_KEY || 'admin-key',
      }
    });

    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Subscription fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch subscription data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = request.headers.get('x-user-id') || 'anonymous';
    
    const response = await fetch(`${PRODUCTION_ENGINE_URL}/api/billing/upgrade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-admin-key': process.env.ADMIN_KEY || 'admin-key',
      },
      body: JSON.stringify({ userId, ...body })
    });

    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Subscription update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}