import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for feedback submission
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 200,
});

const feedbackSchema = z.object({
  articleId: z.string(),
  helpful: z.boolean(),
  comment: z.string().max(500).optional(),
  rating: z.number().min(1).max(5).optional(),
});

// POST /api/help/feedback - Submit feedback for help articles
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'help-feedback');
    } catch {
      return NextResponse.json(
        { error: 'Too many feedback requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    const body = await request.json();
    
    // Validate input
    let validatedData;
    try {
      validatedData = feedbackSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'Validation failed', 
            details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // Create feedback record
    const feedback = {
      id: generateFeedbackId(),
      articleId: validatedData.articleId,
      userId: session?.user?.id || 'anonymous',
      helpful: validatedData.helpful,
      comment: validatedData.comment,
      rating: validatedData.rating,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    };

    // Store feedback (in production, save to database)
    await storeFeedback(feedback);

    // Update article helpful score
    await updateArticleScore(validatedData.articleId, validatedData.helpful);

    return NextResponse.json({ 
      success: true,
      feedbackId: feedback.id,
      message: 'Thank you for your feedback!'
    });

  } catch (error) {
    console.error('Help feedback error:', error);
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}

// GET /api/help/feedback - Get feedback statistics (admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin (in production, check actual permissions)
    const isAdmin = session.user.email?.includes('@recoder.xyz') || false;
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const articleId = url.searchParams.get('articleId');
    const timeRange = url.searchParams.get('range') || '30d';

    if (articleId) {
      // Get feedback for specific article
      const articleFeedback = await getArticleFeedback(articleId, timeRange);
      return NextResponse.json(articleFeedback);
    } else {
      // Get overall feedback statistics
      const overallStats = await getOverallFeedbackStats(timeRange);
      return NextResponse.json(overallStats);
    }

  } catch (error) {
    console.error('Help feedback fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}

// Helper functions
function generateFeedbackId(): string {
  return `feedback-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

async function storeFeedback(feedback: any): Promise<void> {
  try {
    // In production, this would write to feedback database
    console.log('Feedback Stored:', {
      ...feedback,
      ipAddress: '[REDACTED]',
      userAgent: feedback.userAgent ? '[REDACTED]' : undefined
    });
  } catch (error) {
    console.error('Failed to store feedback:', error);
    throw error;
  }
}

async function updateArticleScore(articleId: string, helpful: boolean): Promise<void> {
  try {
    // In production, this would update article helpful score in database
    const increment = helpful ? 1 : 0;
    const decrement = helpful ? 0 : 1;
    
    console.log(`Updated article ${articleId} score: +${increment} helpful, +${decrement} not helpful`);
    
    // Also track for machine learning improvements
    await trackFeedbackForML(articleId, helpful);
    
  } catch (error) {
    console.error('Failed to update article score:', error);
  }
}

async function trackFeedbackForML(articleId: string, helpful: boolean): Promise<void> {
  try {
    // In production, this would feed into ML system for content improvement recommendations
    console.log(`ML Feedback tracked for article ${articleId}: ${helpful ? 'helpful' : 'not helpful'}`);
  } catch (error) {
    console.error('Failed to track ML feedback:', error);
  }
}

async function getArticleFeedback(articleId: string, timeRange: string) {
  // In production, this would query actual feedback data
  return {
    articleId,
    timeRange,
    statistics: {
      totalFeedback: 234,
      helpfulCount: 198,
      notHelpfulCount: 36,
      helpfulPercentage: 84.6,
      averageRating: 4.2,
      totalRatings: 89
    },
    recentFeedback: [
      {
        id: 'fb-1',
        helpful: true,
        rating: 5,
        comment: 'Very clear and helpful tutorial!',
        timestamp: '2024-01-15T10:30:00Z',
        anonymous: false
      },
      {
        id: 'fb-2',
        helpful: true,
        rating: 4,
        comment: 'Good explanation but could use more examples',
        timestamp: '2024-01-15T09:15:00Z',
        anonymous: true
      },
      {
        id: 'fb-3',
        helpful: false,
        rating: 2,
        comment: 'Instructions were confusing and outdated',
        timestamp: '2024-01-15T08:45:00Z',
        anonymous: true
      }
    ],
    trends: generateFeedbackTrends(timeRange),
    suggestions: [
      'Add more code examples to improve clarity',
      'Update screenshots to match current UI',
      'Include troubleshooting section for common issues'
    ]
  };
}

async function getOverallFeedbackStats(timeRange: string) {
  // In production, this would aggregate actual feedback data
  return {
    timeRange,
    summary: {
      totalFeedback: 5678,
      averageHelpfulPercentage: 78.9,
      averageRating: 4.1,
      totalComments: 1234,
      respondedToComments: 891
    },
    topPerformingArticles: [
      {
        id: '1',
        title: 'Creating Your First Project',
        helpfulPercentage: 92.3,
        averageRating: 4.8,
        totalFeedback: 456
      },
      {
        id: '2',
        title: 'Advanced AI Prompting',
        helpfulPercentage: 89.7,
        averageRating: 4.6,
        totalFeedback: 234
      },
      {
        id: '3',
        title: 'Deployment Guide',
        helpfulPercentage: 87.1,
        averageRating: 4.5,
        totalFeedback: 189
      }
    ],
    lowPerformingArticles: [
      {
        id: '15',
        title: 'Legacy API Integration',
        helpfulPercentage: 45.2,
        averageRating: 2.8,
        totalFeedback: 67
      },
      {
        id: '22',
        title: 'Advanced Database Queries',
        helpfulPercentage: 52.1,
        averageRating: 3.1,
        totalFeedback: 89
      }
    ],
    categoryPerformance: {
      'getting-started': { helpfulPercentage: 85.2, averageRating: 4.3 },
      'code-generation': { helpfulPercentage: 79.8, averageRating: 4.1 },
      'deployment': { helpfulPercentage: 76.5, averageRating: 4.0 },
      'ai-features': { helpfulPercentage: 82.1, averageRating: 4.2 },
      'security': { helpfulPercentage: 74.3, averageRating: 3.9 },
      'integrations': { helpfulPercentage: 69.7, averageRating: 3.7 },
      'troubleshooting': { helpfulPercentage: 71.2, averageRating: 3.8 }
    },
    trends: generateOverallFeedbackTrends(timeRange),
    actionItems: [
      'Review and update low-performing articles',
      'Add more examples to integration guides',
      'Improve troubleshooting documentation',
      'Create more beginner-friendly content'
    ]
  };
}

function generateFeedbackTrends(timeRange: string) {
  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  const trends = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    trends.push({
      date: date.toISOString().split('T')[0],
      helpful: Math.floor(Math.random() * 20) + 10,
      notHelpful: Math.floor(Math.random() * 5) + 1,
      averageRating: 3.5 + Math.random() * 1.5
    });
  }
  
  return trends;
}

function generateOverallFeedbackTrends(timeRange: string) {
  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  const trends = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    trends.push({
      date: date.toISOString().split('T')[0],
      totalFeedback: Math.floor(Math.random() * 100) + 50,
      helpfulPercentage: 70 + Math.random() * 20,
      averageRating: 3.5 + Math.random() * 1.0
    });
  }
  
  return trends;
}

export const runtime = "edge";