import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { metrics, userAgent, timestamp } = body;

    // Process and store performance metrics
    const processedMetrics = processPerformanceMetrics(metrics);
    
    // In production, store in database/analytics service
    console.log('Performance metrics received:', {
      userAgent,
      timestamp,
      metrics: processedMetrics
    });

    return NextResponse.json({
      success: true,
      processed: processedMetrics.length,
      recommendations: generatePerformanceRecommendations(processedMetrics)
    });
  } catch (error) {
    console.error('Performance metrics error:', error);
    return NextResponse.json(
      { error: 'Failed to process performance metrics' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const timeframe = searchParams.get('timeframe') || '24h';

    switch (action) {
      case 'core-vitals':
        return getCoreWebVitals(timeframe);
      case 'cache-performance':
        return getCachePerformance(timeframe);
      case 'network-performance':
        return getNetworkPerformance(timeframe);
      case 'recommendations':
        return getPerformanceRecommendations();
      default:
        return getPerformanceDashboard(timeframe);
    }
  } catch (error) {
    console.error('Get performance metrics error:', error);
    return NextResponse.json(
      { error: 'Failed to get performance metrics' },
      { status: 500 }
    );
  }
}

function processPerformanceMetrics(metrics: any[]) {
  return metrics.map(metric => {
    const processed = {
      id: generateMetricId(),
      name: metric.name,
      value: metric.value,
      rating: getPerformanceRating(metric.name, metric.value),
      timestamp: Date.now(),
      context: {
        url: metric.url || window.location.href,
        connection: metric.connection || 'unknown',
        deviceMemory: metric.deviceMemory || 'unknown'
      }
    };

    // Add specific processing based on metric type
    switch (metric.name) {
      case 'FCP': // First Contentful Paint
        processed.threshold = { good: 1800, needsImprovement: 3000 };
        break;
      case 'LCP': // Largest Contentful Paint
        processed.threshold = { good: 2500, needsImprovement: 4000 };
        break;
      case 'FID': // First Input Delay
        processed.threshold = { good: 100, needsImprovement: 300 };
        break;
      case 'CLS': // Cumulative Layout Shift
        processed.threshold = { good: 0.1, needsImprovement: 0.25 };
        break;
      case 'TTFB': // Time to First Byte
        processed.threshold = { good: 800, needsImprovement: 1800 };
        break;
    }

    return processed;
  });
}

function getPerformanceRating(metricName: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds: { [key: string]: { good: number; needsImprovement: number } } = {
    'FCP': { good: 1800, needsImprovement: 3000 },
    'LCP': { good: 2500, needsImprovement: 4000 },
    'FID': { good: 100, needsImprovement: 300 },
    'CLS': { good: 0.1, needsImprovement: 0.25 },
    'TTFB': { good: 800, needsImprovement: 1800 }
  };

  const threshold = thresholds[metricName];
  if (!threshold) return 'good';

  if (value <= threshold.good) return 'good';
  if (value <= threshold.needsImprovement) return 'needs-improvement';
  return 'poor';
}

async function getCoreWebVitals(timeframe: string) {
  // Mock Core Web Vitals data
  const vitals = {
    fcp: {
      value: 1250,
      rating: 'good',
      percentile75: 1400,
      samples: 1500,
      trend: '+5%'
    },
    lcp: {
      value: 2100,
      rating: 'good',
      percentile75: 2300,
      samples: 1500,
      trend: '-2%'
    },
    fid: {
      value: 85,
      rating: 'good',
      percentile75: 95,
      samples: 1200,
      trend: '-8%'
    },
    cls: {
      value: 0.08,
      rating: 'good',
      percentile75: 0.12,
      samples: 1500,
      trend: '-15%'
    },
    ttfb: {
      value: 650,
      rating: 'good',
      percentile75: 750,
      samples: 1500,
      trend: '+3%'
    }
  };

  return NextResponse.json({
    success: true,
    timeframe,
    vitals,
    overallScore: calculateOverallScore(vitals),
    lastUpdated: new Date().toISOString()
  });
}

async function getCachePerformance(timeframe: string) {
  const cacheMetrics = {
    hitRate: 85.5,
    missRate: 14.5,
    totalRequests: 12450,
    cacheHits: 10645,
    cacheMisses: 1805,
    avgResponseTime: {
      cached: 45,
      uncached: 280
    },
    cacheSize: {
      total: '125MB',
      used: '98MB',
      available: '27MB'
    },
    topCachedResources: [
      { url: '/api/projects', hits: 450, percentage: 12.3 },
      { url: '/api/user/profile', hits: 320, percentage: 8.7 },
      { url: '/static/js/main.js', hits: 280, percentage: 7.6 },
      { url: '/api/analytics/dashboard', hits: 250, percentage: 6.8 },
      { url: '/static/css/main.css', hits: 200, percentage: 5.4 }
    ]
  };

  return NextResponse.json({
    success: true,
    timeframe,
    cache: cacheMetrics,
    lastUpdated: new Date().toISOString()
  });
}

async function getNetworkPerformance(timeframe: string) {
  const networkMetrics = {
    averageLatency: 120,
    downloadSpeed: 25.5, // Mbps
    uploadSpeed: 8.2, // Mbps
    connectionType: '4g',
    requestsByType: {
      document: { count: 150, avgTime: 850 },
      script: { count: 320, avgTime: 180 },
      stylesheet: { count: 85, avgTime: 120 },
      image: { count: 450, avgTime: 95 },
      fetch: { count: 1200, avgTime: 150 },
      xhr: { count: 800, avgTime: 200 }
    },
    errorRate: 2.1,
    timeoutRate: 0.5,
    retryRate: 3.2
  };

  return NextResponse.json({
    success: true,
    timeframe,
    network: networkMetrics,
    lastUpdated: new Date().toISOString()
  });
}

async function getPerformanceRecommendations() {
  const recommendations = [
    {
      id: 'rec_1',
      priority: 'high',
      category: 'loading',
      title: 'Optimize Largest Contentful Paint',
      description: 'Consider lazy loading images and optimizing critical resource delivery',
      impact: 'high',
      effort: 'medium',
      expectedImprovement: '15-25% faster LCP',
      actions: [
        'Implement image lazy loading',
        'Optimize critical CSS delivery',
        'Use resource hints (preload, prefetch)',
        'Minimize main thread work'
      ]
    },
    {
      id: 'rec_2',
      priority: 'medium',
      category: 'caching',
      title: 'Improve Cache Hit Rate',
      description: 'Current cache hit rate is 85.5%, target should be 90%+',
      impact: 'medium',
      effort: 'low',
      expectedImprovement: '5-10% faster loading',
      actions: [
        'Extend cache TTL for static assets',
        'Implement service worker caching',
        'Add ETags for dynamic content',
        'Use CDN for better geographical caching'
      ]
    },
    {
      id: 'rec_3',
      priority: 'medium',
      category: 'javascript',
      title: 'Reduce JavaScript Bundle Size',
      description: 'Bundle size is larger than recommended, consider code splitting',
      impact: 'medium',
      effort: 'high',
      expectedImprovement: '20-30% faster initial load',
      actions: [
        'Implement route-based code splitting',
        'Remove unused dependencies',
        'Use tree shaking optimization',
        'Defer non-critical JavaScript'
      ]
    },
    {
      id: 'rec_4',
      priority: 'low',
      category: 'images',
      title: 'Optimize Image Delivery',
      description: 'Some images could be better optimized for web delivery',
      impact: 'low',
      effort: 'low',
      expectedImprovement: '5-10% faster image loading',
      actions: [
        'Use next-gen image formats (WebP, AVIF)',
        'Implement responsive images',
        'Optimize image compression',
        'Use image CDN'
      ]
    }
  ];

  return NextResponse.json({
    success: true,
    recommendations,
    totalRecommendations: recommendations.length,
    highPriority: recommendations.filter(r => r.priority === 'high').length,
    lastUpdated: new Date().toISOString()
  });
}

async function getPerformanceDashboard(timeframe: string) {
  const dashboard = {
    overview: {
      overallScore: 92,
      previousScore: 88,
      trend: 'improving',
      totalPageViews: 45230,
      avgLoadTime: 1.8,
      bounceRate: 12.5
    },
    coreVitals: {
      fcp: { value: 1250, rating: 'good', trend: '+5%' },
      lcp: { value: 2100, rating: 'good', trend: '-2%' },
      fid: { value: 85, rating: 'good', trend: '-8%' },
      cls: { value: 0.08, rating: 'good', trend: '-15%' }
    },
    technicalMetrics: {
      cacheHitRate: 85.5,
      errorRate: 2.1,
      avgLatency: 120,
      serviceWorkerUsage: 78
    },
    userExperience: {
      mobileScore: 89,
      desktopScore: 95,
      accessibilityScore: 96,
      seoScore: 92
    },
    alerts: [
      {
        type: 'warning',
        message: 'LCP increased by 8% in the last hour',
        timestamp: new Date().toISOString()
      },
      {
        type: 'info',
        message: 'Cache hit rate improved by 3% today',
        timestamp: new Date().toISOString()
      }
    ]
  };

  return NextResponse.json({
    success: true,
    timeframe,
    dashboard,
    lastUpdated: new Date().toISOString()
  });
}

function generatePerformanceRecommendations(metrics: any[]) {
  const recommendations = [];

  for (const metric of metrics) {
    if (metric.rating === 'poor') {
      recommendations.push({
        metric: metric.name,
        priority: 'high',
        message: `${metric.name} needs immediate attention`,
        suggestion: getMetricSuggestion(metric.name)
      });
    } else if (metric.rating === 'needs-improvement') {
      recommendations.push({
        metric: metric.name,
        priority: 'medium',
        message: `${metric.name} could be improved`,
        suggestion: getMetricSuggestion(metric.name)
      });
    }
  }

  return recommendations;
}

function getMetricSuggestion(metricName: string): string {
  const suggestions: { [key: string]: string } = {
    'FCP': 'Optimize critical resource delivery and reduce render-blocking resources',
    'LCP': 'Optimize images and text rendering, consider lazy loading',
    'FID': 'Reduce main thread blocking time and optimize event handlers',
    'CLS': 'Ensure proper sizing for images and avoid inserting content above existing content',
    'TTFB': 'Optimize server response time and consider CDN usage'
  };

  return suggestions[metricName] || 'Consider general performance optimization techniques';
}

function calculateOverallScore(vitals: any): number {
  const scores = Object.values(vitals).map((vital: any) => {
    switch (vital.rating) {
      case 'good': return 100;
      case 'needs-improvement': return 70;
      case 'poor': return 30;
      default: return 50;
    }
  });

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function generateMetricId(): string {
  return `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}