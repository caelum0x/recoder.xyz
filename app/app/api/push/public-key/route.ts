import { NextResponse } from 'next/server';

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

  return NextResponse.json({
    success: Boolean(publicKey),
    publicKey: publicKey || null,
    message: publicKey ? 'VAPID public key loaded' : 'VAPID public key not configured',
  });
}
