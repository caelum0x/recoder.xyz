import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const agentId = params.id;
    
    logger.info('Executing agent task', { agentId, task: body.task });

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const response = await fetch(`${backendUrl}/api/agents/${agentId}/execute`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.API_TOKEN || 'development-token'}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        task: body.task,
        context: body.context || {}
      })
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    const result = await response.json();
    
    logger.info('Agent task executed successfully', { 
      agentId, 
      duration: result.data?.duration,
      success: result.data?.success 
    });

    return NextResponse.json({
      success: true,
      data: result.data,
      message: 'Task executed successfully'
    });

  } catch (error) {
    logger.error('Failed to execute agent task', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      agentId: params.id
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to execute agent task',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}