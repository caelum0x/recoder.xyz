import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server-auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session) {
      return NextResponse.json(null);
    }
    
    return NextResponse.json(session);
  } catch (error) {
    console.error('Session retrieval error:', error);
    return NextResponse.json(null);
  }
}