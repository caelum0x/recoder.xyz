import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';

export async function POST(request: NextRequest) {
  try {
    // Generate VAPID keys using web-push library
    const vapidKeys = webpush.generateVAPIDKeys();
    
    return NextResponse.json({
      publicKey: vapidKeys.publicKey,
      privateKey: vapidKeys.privateKey
    });
    
  } catch (error) {
    console.error('Failed to generate VAPID keys:', error);
    return NextResponse.json(
      { error: 'Failed to generate VAPID keys' },
      { status: 500 }
    );
  }
}
