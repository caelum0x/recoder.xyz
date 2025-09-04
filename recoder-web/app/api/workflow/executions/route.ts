import { NextRequest, NextResponse } from 'next/server';
import { workflowEngine } from '@/lib/workflow/engine';

//const workflowEngine = new WorkflowEngine();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const workflow = searchParams.get('workflow');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get all executions and filter them
    let executions = await workflowEngine.getAllExecutions();

    // Apply filters
    if (status && status !== 'all') {
      executions = executions.filter(exec => exec.status === status);
    }

    if (workflow && workflow !== 'all') {
      executions = executions.filter(exec => exec.workflowId === workflow);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      executions = executions.filter(exec => 
        exec.id.toLowerCase().includes(searchLower) ||
        (exec as any).workflowName?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by start time (newest first)
    executions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    // Apply pagination
    const paginatedExecutions = executions.slice(offset, offset + limit);

    // Calculate duration for completed executions
    const enrichedExecutions = paginatedExecutions.map(execution => ({
      ...execution,
      workflowName: `Workflow ${execution.workflowId}`, // This would come from DB in real implementation
      userName: 'Current User', // This would come from auth in real implementation
      duration: execution.completedAt ? 
        new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime() : 
        execution.status === 'running' ? 
          Date.now() - new Date(execution.startedAt).getTime() : 
          undefined
    }));

    return NextResponse.json({
      executions: enrichedExecutions,
      total: executions.length,
      hasMore: offset + limit < executions.length
    });

  } catch (error) {
    console.error('Error fetching workflow executions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflow executions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workflowId, variables = {} } = body;

    if (!workflowId) {
      return NextResponse.json(
        { error: 'Workflow ID is required' },
        { status: 400 }
      );
    }

    const executionId = await workflowEngine.executeWorkflow(workflowId, variables);

    return NextResponse.json({ 
      executionId,
      message: 'Workflow execution started successfully' 
    });

  } catch (error) {
    console.error('Error starting workflow execution:', error);
    return NextResponse.json(
      { error: 'Failed to start workflow execution' },
      { status: 500 }
    );
  }
}
