import { NextRequest, NextResponse } from 'next/server';

// Mock execution data for demonstration - in real implementation, this would query the database
const mockExecution = {
  id: 'exec_12345',
  workflowId: 'wf_example',
  workflowName: 'Example Workflow',
  status: 'running',
  startedAt: new Date(Date.now() - 30000), // 30 seconds ago
  progress: 60,
  currentStep: 'step_processing',
  logs: [
    {
      timestamp: new Date(Date.now() - 30000),
      level: 'info',
      message: 'Workflow execution started',
      step: undefined
    },
    {
      timestamp: new Date(Date.now() - 25000),
      level: 'info',
      message: 'Executing step: Data Validation',
      step: 'step_validation'
    },
    {
      timestamp: new Date(Date.now() - 20000),
      level: 'info',
      message: 'Step completed successfully',
      step: 'step_validation'
    },
    {
      timestamp: new Date(Date.now() - 15000),
      level: 'info',
      message: 'Executing step: Data Processing',
      step: 'step_processing'
    }
  ],
  variables: {
    inputFile: '/uploads/example.mp4',
    outputFormat: 'mp4',
    quality: 'high'
  },
  stepResults: {
    step_validation: {
      valid: true,
      fileSize: 1024000,
      duration: 120
    }
  }
};

export async function GET(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  try {
    const { executionId } = params;

    if (!executionId) {
      return NextResponse.json(
        { error: 'Execution ID is required' },
        { status: 400 }
      );
    }

    // In real implementation, query the database for the execution
    // For now, return mock data
    const execution = {
      ...mockExecution,
      id: executionId
    };

    return NextResponse.json(execution);

  } catch (error) {
    console.error('Error fetching execution:', error);
    return NextResponse.json(
      { error: 'Failed to fetch execution' },
      { status: 500 }
    );
  }
}
