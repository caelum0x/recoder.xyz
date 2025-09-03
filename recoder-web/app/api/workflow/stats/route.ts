import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    // Mock stats data - in real implementation, this would query the database
    const stats = {
      totalExecutions: 1247,
      runningExecutions: 3,
      successRate: 87.5,
      averageDuration: 45000, // 45 seconds in milliseconds
      executionsToday: 23,
      topWorkflows: [
        {
          id: 'wf_ci_cd_main',
          name: 'CI/CD Pipeline',
          executions: 156,
          successRate: 92.3
        },
        {
          id: 'wf_media_processing',
          name: 'Media Processing',
          executions: 89,
          successRate: 95.5
        },
        {
          id: 'wf_data_sync',
          name: 'Data Synchronization',
          executions: 67,
          successRate: 78.2
        }
      ]
    };

    return NextResponse.json(stats);

  } catch (error) {
    console.error('Error fetching workflow stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflow stats' },
      { status: 500 }
    );
  }
}
