import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const agentId = params.id;
    logger.info('Fetching agent details', { agentId });

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const response = await fetch(`${backendUrl}/api/agents/${agentId}`, {
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
      message: 'Agent retrieved successfully'
    });

  } catch (error) {
    const params = await context.params;
    logger.error('Failed to fetch agent', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      agentId: params.id
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch agent',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json();
    const params = await context.params;
    const agentId = params.id;
    
    logger.info('Updating agent', { agentId, updateData: body });

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const response = await fetch(`${backendUrl}/api/agents/${agentId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.API_TOKEN || 'development-token'}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    const result = await response.json();
    
    logger.info('Agent updated successfully', { agentId });

    return NextResponse.json({
      success: true,
      data: result.data,
      message: 'Agent updated successfully'
    });

  } catch (error) {
    const params = await context.params;
    logger.error('Failed to update agent', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      agentId: params.id
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update agent',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const agentId = params.id;
    logger.info('Deleting agent', { agentId });

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const response = await fetch(`${backendUrl}/api/agents/${agentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.API_TOKEN || 'development-token'}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    logger.info('Agent deleted successfully', { agentId });

    return NextResponse.json({
      success: true,
      message: 'Agent deleted successfully'
    });

  } catch (error) {
    const params = await context.params;
    logger.error('Failed to delete agent', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      agentId: params.id
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete agent',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}