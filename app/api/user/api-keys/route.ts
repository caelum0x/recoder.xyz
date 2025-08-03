// API keys management endpoint
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userManager } from '@/lib/user-management';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const profile = await userManager.getUserProfile(session.user.id);
    
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      api_keys: profile.api_keys,
      plan: profile.plan,
      usage_stats: profile.usage_stats
    });
  } catch (error) {
    console.error('API keys GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { product } = await request.json();
    
    if (!['cli', 'extension', 'router'].includes(product)) {
      return NextResponse.json(
        { error: 'Invalid product type' },
        { status: 400 }
      );
    }

    const newApiKey = await userManager.regenerateApiKey(session.user.id, product);
    
    return NextResponse.json({
      product,
      api_key: newApiKey,
      regenerated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('API key regeneration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}