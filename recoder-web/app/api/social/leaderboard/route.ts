import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'overall';
    const timeframe = searchParams.get('timeframe') || 'weekly';

    logger.info('Loading leaderboard from backend');

    // Connect to actual backend API
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const authHeader = req.headers.get('authorization') || `Bearer ${process.env.API_TOKEN || 'development-token'}`;
    
    const url = `${backendUrl}/api/social/leaderboard?category=${category}&timeframe=${timeframe}`;

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
    
    logger.info('Leaderboard loaded from backend', { 
      category,
      timeframe,
      entries: backendData.data?.leaderboard?.length || 0
    });

    return NextResponse.json({
      success: true,
      data: backendData.data,
      message: 'Leaderboard retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to load leaderboard', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load leaderboard',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}