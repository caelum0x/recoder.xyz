import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    logger.info('Loading achievements from backend');

    // Connect to actual backend API
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const authHeader = req.headers.get('authorization') || `Bearer ${process.env.API_TOKEN || 'development-token'}`;
    
    const response = await fetch(`${backendUrl}/api/social/achievements`, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    const backendData = await response.json();
    
    logger.info('Achievements loaded from backend', { 
      level: backendData.data?.userLevel?.level || 0,
      unlockedCount: backendData.data?.unlockedAchievements?.length || 0
    });

    return NextResponse.json({
      success: true,
      data: backendData.data,
      message: 'Achievements retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to load achievements', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load achievements',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}