import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/jwt';
import { db, analyticsService } from '@/lib/database/client';

export const GET = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0];
    const platform = searchParams.get('platform');
    const campaignId = searchParams.get('campaign_id');

    // Get overview metrics
    const overview = await getOverviewMetrics(user.userId, startDate || '30d', endDate || 'now', platform || 'all');
    
    // Get platform breakdown
    const platformBreakdown = await getPlatformBreakdown(user.userId, startDate || '30d', endDate || 'now');
    
    // Get content performance
    const contentPerformance = await getContentPerformance(user.userId, startDate || '30d', endDate || 'now', platform || 'all');
    
    // Get campaign performance
    const campaignPerformance = await getCampaignPerformance(user.userId, startDate || '30d', endDate || 'now', campaignId || undefined);
    
    // Get audience insights
    const audienceInsights = await getAudienceInsights(user.userId, startDate || '30d', endDate || 'now', platform || 'all');
    
    // Get competitor analysis
    const competitorData = await getCompetitorAnalysis(user.userId, platform || undefined);
    
    // Get real-time metrics
    const realTimeMetrics = await getRealTimeMetrics(user.userId);

    return NextResponse.json({
      success: true,
      analytics: {
        overview,
        platform_breakdown: platformBreakdown,
        content_performance: contentPerformance,
        campaign_performance: campaignPerformance,
        audience_insights: audienceInsights,
        competitor_analysis: competitorData,
        real_time_metrics: realTimeMetrics,
        date_range: { start_date: startDate, end_date: endDate }
      }
    });

  } catch (error) {
    console.error('Analytics dashboard error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
});

async function getOverviewMetrics(userId: string, startDate: string, endDate: string, platform?: string) {
  let query = `
    SELECT 
      SUM(impressions) as total_impressions,
      SUM(reach) as total_reach,
      SUM(engagement) as total_engagement,
      SUM(likes) as total_likes,
      SUM(comments) as total_comments,
      SUM(shares) as total_shares,
      SUM(clicks) as total_clicks,
      SUM(website_clicks) as total_website_clicks,
      SUM(followers_gained) as followers_gained,
      SUM(followers_lost) as followers_lost,
      SUM(spend) as total_spend,
      AVG(ctr) as avg_ctr,
      AVG(cpm) as avg_cpm,
      AVG(cpc) as avg_cpc,
      COUNT(DISTINCT date) as days_active
    FROM analytics_daily
    WHERE user_id = $1 AND date BETWEEN $2 AND $3
  `;
  
  const values = [userId, startDate, endDate];
  
  if (platform) {
    query += ` AND platform = $4`;
    values.push(platform);
  }

  const result = await db.query(query, values);
  const metrics = result.rows[0];

  // Calculate derived metrics
  const engagementRate = metrics.total_impressions > 0 
    ? (metrics.total_engagement / metrics.total_impressions * 100).toFixed(2)
    : 0;
    
  const reachRate = metrics.total_impressions > 0
    ? (metrics.total_reach / metrics.total_impressions * 100).toFixed(2)
    : 0;

  return {
    ...metrics,
    engagement_rate: parseFloat(engagementRate.toString()),
    reach_rate: parseFloat(reachRate.toString()),
    net_followers: metrics.followers_gained - metrics.followers_lost,
    cost_per_engagement: metrics.total_spend > 0 && metrics.total_engagement > 0
      ? (metrics.total_spend / metrics.total_engagement).toFixed(4)
      : 0
  };
}

async function getPlatformBreakdown(userId: string, startDate: string, endDate: string) {
  const query = `
    SELECT 
      platform,
      SUM(impressions) as impressions,
      SUM(engagement) as engagement,
      SUM(clicks) as clicks,
      SUM(spend) as spend,
      AVG(ctr) as avg_ctr,
      COUNT(DISTINCT account_id) as accounts_count
    FROM analytics_daily
    WHERE user_id = $1 AND date BETWEEN $2 AND $3
    GROUP BY platform
    ORDER BY impressions DESC
  `;

  const result = await db.query(query, [userId, startDate, endDate]);
  
  return result.rows.map((row: any) => ({
    ...row,
    engagement_rate: row.impressions > 0 ? (row.engagement / row.impressions * 100).toFixed(2) : 0,
    cost_per_click: row.clicks > 0 ? (row.spend / row.clicks).toFixed(4) : 0
  }));
}

async function getContentPerformance(userId: string, startDate: string, endDate: string, platform?: string) {
  let query = `
    SELECT 
      p.id,
      p.content,
      p.platform,
      p.posted_at,
      p.hashtags,
      cp.engagement_rate,
      cp.reach_rate,
      cp.click_through_rate,
      cp.sentiment_score,
      ad.impressions,
      ad.engagement,
      ad.likes,
      ad.comments,
      ad.shares,
      ad.clicks
    FROM posts p
    LEFT JOIN content_performance cp ON p.id = cp.post_id
    LEFT JOIN analytics_daily ad ON p.id = ad.post_id
    WHERE p.user_id = $1 
      AND p.status = 'posted'
      AND p.posted_at BETWEEN $2 AND $3
  `;

  const values = [userId, startDate, endDate];
  
  if (platform) {
    query += ` AND p.platform = $4`;
    values.push(platform);
  }

  query += ` ORDER BY ad.engagement DESC LIMIT 50`;

  const result = await db.query(query, values);
  
  return result.rows.map((post: any) => ({
    ...post,
    content_preview: post.content ? post.content.substring(0, 100) + '...' : '',
    performance_score: calculateContentScore(post),
    hashtags: post.hashtags || []
  }));
}

async function getCampaignPerformance(userId: string, startDate: string, endDate: string, campaignId?: string) {
  let query = `
    SELECT 
      c.id,
      c.name,
      c.objective,
      c.campaign_type,
      c.budget_total,
      c.start_date,
      c.end_date,
      c.status,
      COUNT(p.id) as posts_count,
      SUM(ad.impressions) as total_impressions,
      SUM(ad.engagement) as total_engagement,
      SUM(ad.clicks) as total_clicks,
      SUM(ad.spend) as total_spend,
      AVG(ad.ctr) as avg_ctr
    FROM campaigns c
    LEFT JOIN posts p ON c.id = p.campaign_id
    LEFT JOIN analytics_daily ad ON p.id = ad.post_id
    WHERE c.user_id = $1
  `;

  const values = [userId];
  
  if (campaignId) {
    query += ` AND c.id = $2`;
    values.push(campaignId);
  }

  query += `
    GROUP BY c.id, c.name, c.objective, c.campaign_type, c.budget_total, c.start_date, c.end_date, c.status
    ORDER BY total_engagement DESC
  `;

  const result = await db.query(query, values);
  
  return result.rows.map((campaign: any) => ({
    ...campaign,
    roi: calculateCampaignROI(campaign),
    cost_per_engagement: campaign.total_spend > 0 && campaign.total_engagement > 0
      ? (campaign.total_spend / campaign.total_engagement).toFixed(4)
      : 0,
    engagement_rate: campaign.total_impressions > 0
      ? (campaign.total_engagement / campaign.total_impressions * 100).toFixed(2)
      : 0
  }));
}

async function getAudienceInsights(userId: string, startDate: string, endDate: string, platform?: string) {
  // Get demographic data
  let query = `
    SELECT 
      platform,
      demographic_data,
      interest_data,
      behavior_data,
      geographic_data,
      device_data
    FROM audience_insights ai
    JOIN social_accounts sa ON ai.social_account_id = sa.id
    WHERE sa.user_id = $1 AND ai.date BETWEEN $2 AND $3
  `;

  const values = [userId, startDate, endDate];
  
  if (platform) {
    query += ` AND ai.platform = $4`;
    values.push(platform);
  }

  query += ` ORDER BY ai.date DESC LIMIT 10`;

  const result = await db.query(query, values);
  
  // Aggregate audience data
  const audienceData = {
    demographics: {},
    interests: {},
    locations: {},
    devices: {},
    age_gender_breakdown: {},
    engagement_by_time: {}
  };

  result.rows.forEach((row: any) => {
    // Merge demographic data
    const demo = JSON.parse(row.demographic_data || '{}');
    const interests = JSON.parse(row.interest_data || '{}');
    const geo = JSON.parse(row.geographic_data || '{}');
    const devices = JSON.parse(row.device_data || '{}');

    // Aggregate data (simplified aggregation)
    Object.keys(demo).forEach(key => {
      (audienceData.demographics as Record<string, number>)[key] = ((audienceData.demographics as Record<string, number>)[key] || 0) + (demo[key] || 0);
    });

    Object.keys(interests).forEach(key => {
      (audienceData.interests as Record<string, number>)[key] = ((audienceData.interests as Record<string, number>)[key] || 0) + (interests[key] || 0);
    });

    Object.keys(geo).forEach(key => {
      (audienceData.locations as Record<string, number>)[key] = ((audienceData.locations as Record<string, number>)[key] || 0) + (geo[key] || 0);
    });

    Object.keys(devices).forEach(key => {
      (audienceData.devices as Record<string, number>)[key] = ((audienceData.devices as Record<string, number>)[key] || 0) + (devices[key] || 0);
    });
  });

  return audienceData;
}

async function getCompetitorAnalysis(userId: string, platform?: string) {
  let query = `
    SELECT 
      c.name,
      c.industry,
      c.social_handles,
      ca.platform,
      ca.followers_count,
      ca.engagement_rate,
      ca.posting_frequency,
      ca.top_hashtags,
      ca.content_themes,
      ca.date
    FROM competitors c
    JOIN competitor_analytics ca ON c.id = ca.competitor_id
    WHERE c.user_id = $1
  `;

  const values = [userId];
  
  if (platform) {
    query += ` AND ca.platform = $2`;
    values.push(platform);
  }

  query += ` ORDER BY ca.date DESC LIMIT 20`;

  const result = await db.query(query, values);
  
  // Group by competitor
  const competitorMap: Record<string, any> = {};
  result.rows.forEach((row: any) => {
    if (!competitorMap[row.name]) {
      competitorMap[row.name] = {
        name: row.name,
        industry: row.industry,
        social_handles: JSON.parse(row.social_handles || '{}'),
        platforms: {}
      };
    }
    
    competitorMap[row.name].platforms[row.platform] = {
      followers_count: row.followers_count,
      engagement_rate: row.engagement_rate,
      posting_frequency: row.posting_frequency,
      top_hashtags: row.top_hashtags || [],
      content_themes: row.content_themes || [],
      last_updated: row.date
    };
  });

  return Object.values(competitorMap);
}

async function getRealTimeMetrics(userId: string) {
  // Get today's metrics
  const today = new Date().toISOString().split('T')[0];
  
  const query = `
    SELECT 
      platform,
      SUM(impressions) as today_impressions,
      SUM(engagement) as today_engagement,
      SUM(clicks) as today_clicks,
      COUNT(*) as active_posts
    FROM analytics_daily
    WHERE user_id = $1 AND date = $2
    GROUP BY platform
  `;

  const result = await db.query(query, [userId, today]);
  
  // Get recent notifications/alerts
  const alertsQuery = `
    SELECT type, title, message, created_at
    FROM notifications
    WHERE user_id = $1 AND read_at IS NULL
    ORDER BY created_at DESC
    LIMIT 5
  `;
  
  const alertsResult = await db.query(alertsQuery, [userId]);

  return {
    today_metrics: result.rows,
    alerts: alertsResult.rows,
    last_updated: new Date().toISOString()
  };
}

// Helper functions
function calculateContentScore(post: any): number {
  let score = 0;
  
  if (post.engagement_rate) score += post.engagement_rate * 20;
  if (post.reach_rate) score += post.reach_rate * 15;
  if (post.click_through_rate) score += post.click_through_rate * 25;
  if (post.sentiment_score > 0) score += post.sentiment_score * 10;
  
  return Math.min(100, Math.round(score));
}

function calculateCampaignROI(campaign: any): number {
  if (!campaign.total_spend || campaign.total_spend === 0) return 0;
  
  // Simplified ROI calculation - in reality this would use conversion data
  const estimatedRevenue = campaign.total_clicks * 50; // Assume $50 per click conversion
  const roi = ((estimatedRevenue - campaign.total_spend) / campaign.total_spend) * 100;
  
  return Math.round(roi * 100) / 100;
}