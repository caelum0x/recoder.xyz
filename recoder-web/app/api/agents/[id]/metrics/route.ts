import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agentId = params.id;
    logger.info('Fetching agent metrics', { agentId });

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const response = await fetch(`${backendUrl}/api/agents/${agentId}/metrics`, {
      headers: {
        'Authorization': `Bearer ${process.env.API_TOKEN || 'development-token'}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      data: result.data,
      message: 'Agent metrics retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to fetch agent metrics', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      agentId: params.id
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch agent metrics',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}