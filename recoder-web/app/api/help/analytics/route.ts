import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for analytics tracking
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 1000,
});

const analyticsEventSchema = z.object({
  event: z.enum(['article_viewed', 'search_performed', 'video_watched', 'category_browsed']),
  articleId: z.string().optional(),
  searchQuery: z.string().optional(),
  videoId: z.string().optional(),
  category: z.string().optional(),
  timestamp: z.string(),
  metadata: z.record(z.any()).optional(),
});

// POST /api/help/analytics - Track help system usage
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 100, 'help-analytics');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    const body = await request.json();
    
    // Validate input
    let validatedData;
    try {
      validatedData = analyticsEventSchema.parse(body);
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

    // Track analytics event
    const analyticsEvent = {
      id: generateEventId(),
      userId: session?.user?.id || 'anonymous',
      event: validatedData.event,
      articleId: validatedData.articleId,
      searchQuery: validatedData.searchQuery,
      videoId: validatedData.videoId,
      category: validatedData.category,
      timestamp: validatedData.timestamp,
      metadata: validatedData.metadata || {},
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    };

    // In production, this would write to analytics database
    await trackHelpEvent(analyticsEvent);

    return NextResponse.json({ 
      success: true,
      eventId: analyticsEvent.id
    });

  } catch (error) {
    console.error('Help analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to track analytics event' },
      { status: 500 }
    );
  }
}

// GET /api/help/analytics - Get help system analytics (admin only)
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
    const timeRange = url.searchParams.get('range') || '7d';
    const eventType = url.searchParams.get('event') || 'all';

    // Generate analytics data (in production, query actual data)
    const analytics = await generateHelpAnalytics(timeRange, eventType);

    return NextResponse.json(analytics);

  } catch (error) {
    console.error('Help analytics fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

// Helper functions
function generateEventId(): string {
  return `event-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

async function trackHelpEvent(event: any): Promise<void> {
  try {
    // In production, this would write to analytics database
    console.log('Help Event Tracked:', {
      ...event,
      ipAddress: '[REDACTED]', // Don't log IP in console
      userAgent: event.userAgent ? '[REDACTED]' : undefined
    });

    // Example: Update article view count
    if (event.event === 'article_viewed' && event.articleId) {
      await incrementArticleViewCount(event.articleId);
    }

    // Example: Track popular search queries
    if (event.event === 'search_performed' && event.searchQuery) {
      await trackSearchQuery(event.searchQuery);
    }

  } catch (error) {
    console.error('Failed to track help event:', error);
  }
}

async function incrementArticleViewCount(articleId: string): Promise<void> {
  // In production, increment view count in database
  console.log(`Incremented view count for article: ${articleId}`);
}

async function trackSearchQuery(query: string): Promise<void> {
  // In production, track search queries for improving search results
  console.log(`Tracked search query: ${query}`);
}

async function generateHelpAnalytics(timeRange: string, eventType: string) {
  // In production, this would query actual analytics data
  return {
    timeRange,
    eventType,
    summary: {
      totalEvents: 15247,
      uniqueUsers: 3421,
      totalArticleViews: 8934,
      totalSearches: 2156,
      totalVideoViews: 1823,
      avgSessionDuration: 4.2 // minutes
    },
    popularArticles: [
      { id: '1', title: 'Creating Your First Project', views: 2341, helpful: 234 },
      { id: '2', title: 'Advanced AI Prompting', views: 1876, helpful: 189 },
      { id: '3', title: 'Deployment Guide', views: 1542, helpful: 156 }
    ],
    popularSearches: [
      { query: 'how to deploy', count: 245 },
      { query: 'ai prompting', count: 189 },
      { query: 'authentication', count: 156 },
      { query: 'database setup', count: 134 },
      { query: 'react components', count: 123 }
    ],
    categoryPopularity: {
      'getting-started': 3245,
      'code-generation': 2876,
      'deployment': 1987,
      'ai-features': 1654,
      'integrations': 1432,
      'security': 987,
      'troubleshooting': 876,
      'project-management': 765
    },
    userSatisfaction: {
      averageRating: 4.6,
      totalFeedback: 1234,
      positivePercentage: 87.3
    },
    trends: {
      daily: generateDailyTrends(7),
      weekly: generateWeeklyTrends(4),
      monthly: generateMonthlyTrends(12)
    }
  };
}

function generateDailyTrends(days: number) {
  const trends = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    trends.push({
      date: date.toISOString().split('T')[0],
      views: Math.floor(Math.random() * 500) + 200,
      searches: Math.floor(Math.random() * 100) + 50,
      feedback: Math.floor(Math.random() * 20) + 5
    });
  }
  return trends;
}

function generateWeeklyTrends(weeks: number) {
  const trends = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - (i * 7));
    trends.push({
      week: `Week of ${date.toISOString().split('T')[0]}`,
      views: Math.floor(Math.random() * 3000) + 1500,
      searches: Math.floor(Math.random() * 600) + 300,
      feedback: Math.floor(Math.random() * 100) + 50
    });
  }
  return trends;
}

function generateMonthlyTrends(months: number) {
  const trends = [];
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    trends.push({
      month: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
      views: Math.floor(Math.random() * 10000) + 5000,
      searches: Math.floor(Math.random() * 2000) + 1000,
      feedback: Math.floor(Math.random() * 500) + 200
    });
  }
  return trends;
}

export const runtime = "edge";