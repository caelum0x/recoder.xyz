import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    logger.info('Loading learning insights');

    // Simulate AI-generated learning insights
    const insights = [
      {
        id: 'insight-1',
        category: 'productivity',
        insight: 'Your use of custom hooks reduces code duplication by 34% compared to average developers',
        impact: 'high',
        actionable: true,
        timestamp: '2025-08-17T06:30:00Z'
      },
      {
        id: 'insight-2',
        category: 'quality',
        insight: 'Consistent TypeScript usage prevents an estimated 12 runtime errors per week',
        impact: 'high',
        actionable: false,
        timestamp: '2025-08-17T05:45:00Z'
      },
      {
        id: 'insight-3',
        category: 'patterns',
        insight: 'Your async/await pattern usage indicates advanced Promise handling skills',
        impact: 'medium',
        actionable: false,
        timestamp: '2025-08-17T04:20:00Z'
      },
      {
        id: 'insight-4',
        category: 'preferences',
        insight: 'Tailwind CSS usage suggests preference for utility-first styling approach',
        impact: 'medium',
        actionable: true,
        timestamp: '2025-08-17T03:15:00Z'
      },
      {
        id: 'insight-5',
        category: 'productivity',
        insight: 'Your component structure follows React best practices, improving maintainability',
        impact: 'high',
        actionable: false,
        timestamp: '2025-08-17T02:30:00Z'
      },
      {
        id: 'insight-6',
        category: 'quality',
        insight: 'Consistent naming conventions make your code 23% more readable than average',
        impact: 'medium',
        actionable: false,
        timestamp: '2025-08-17T01:45:00Z'
      },
      {
        id: 'insight-7',
        category: 'patterns',
        insight: 'Your error handling patterns could be enhanced with custom error boundaries',
        impact: 'medium',
        actionable: true,
        timestamp: '2025-08-17T01:00:00Z'
      },
      {
        id: 'insight-8',
        category: 'preferences',
        insight: 'Strong preference for functional programming detected - consider React.memo optimization',
        impact: 'low',
        actionable: true,
        timestamp: '2025-08-17T00:30:00Z'
      }
    ];

    const categoryStats = insights.reduce((stats, insight) => {
      stats[insight.category] = (stats[insight.category] || 0) + 1;
      return stats;
    }, {} as Record<string, number>);

    const impactStats = insights.reduce((stats, insight) => {
      stats[insight.impact] = (stats[insight.impact] || 0) + 1;
      return stats;
    }, {} as Record<string, number>);

    logger.info('Learning insights generated', { 
      count: insights.length,
      categories: Object.keys(categoryStats).length,
      actionableCount: insights.filter(i => i.actionable).length
    });

    return NextResponse.json({
      success: true,
      insights,
      metadata: {
        timestamp: new Date().toISOString(),
        totalInsights: insights.length,
        actionableInsights: insights.filter(i => i.actionable).length,
        categoryBreakdown: categoryStats,
        impactBreakdown: impactStats,
        lastGenerated: '2025-08-17T08:17:00Z'
      },
      recommendations: [
        'Continue using TypeScript for better code quality',
        'Consider implementing error boundaries for better error handling',
        'Your functional programming approach is excellent - keep it up',
        'Custom hooks usage is a strength - consider sharing patterns with team'
      ],
      learningProgress: {
        patternsIdentified: 47,
        confidenceImprovement: '12%',
        adaptationSpeed: 'fast',
        nextLearningGoals: [
          'Performance optimization patterns',
          'Advanced React patterns',
          'Testing methodology preferences'
        ]
      }
    });

  } catch (error) {
    logger.error('Failed to load learning insights', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load learning insights',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}