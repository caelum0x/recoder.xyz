import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') || '20';
    const offset = searchParams.get('offset') || '0';
    const type = searchParams.get('type');

    logger.info('Loading social feed from backend');

    // Connect to actual backend API
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const authHeader = req.headers.get('authorization') || `Bearer ${process.env.API_TOKEN || 'development-token'}`;
    
    let url = `${backendUrl}/api/social/feed?limit=${limit}&offset=${offset}`;
    if (type) {
      url += `&type=${type}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    const backendData = await response.json();
    
    logger.info('Social feed loaded from backend', { 
      postsCount: backendData.data?.posts?.length || 0,
      totalEngagement: backendData.data?.summary?.totalLikes || 0
    });

    return NextResponse.json({
      success: true,
      data: backendData.data,
      metadata: {
        timestamp: new Date().toISOString(),
        dataSource: 'social-feed-backend',
        refreshInterval: '30 seconds'
      },
      message: 'Social feed retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to load social feed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load social feed',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}