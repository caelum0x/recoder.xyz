import { NextResponse } from 'next/server';
import { readPilotProofAggregate } from '@/lib/pilot-operations/proof';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const aggregate = await readPilotProofAggregate();
    return NextResponse.json({ success: true, aggregate }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Pilot proof aggregate failed', { error: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ success: false, error: 'Pilot proof is temporarily unavailable.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
