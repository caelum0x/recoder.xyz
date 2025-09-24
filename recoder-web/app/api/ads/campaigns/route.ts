import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireSubscription } from '@/lib/auth/jwt';
import { db } from '@/lib/database/client';

// Create Ad Campaign
export const POST = requireSubscription(['pro', 'agency', 'enterprise'], async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const {
      adAccountId,
      campaignId,
      platform,
      name,
      objective,
      optimizationGoal,
      bidStrategy,
      budgetType = 'daily',
      budgetAmount,
      bidAmount,
      startDate,
      endDate,
      targeting,
      placementSettings,
      specialCategories = []
    } = body;

    if (!adAccountId || !name || !objective || !budgetAmount) {
      return NextResponse.json(
        { error: 'Ad account, name, objective, and budget are required' },
        { status: 400 }
      );
    }

    // Verify ad account belongs to user
    const adAccountQuery = `
      SELECT id FROM ad_accounts 
      WHERE id = $1 AND user_id = $2 AND account_status = 'active'
    `;
    const adAccountResult = await db.query(adAccountQuery, [adAccountId, user.userId]);
    
    if (adAccountResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Ad account not found or not accessible' },
        { status: 404 }
      );
    }

    // Create ad campaign in our database
    const query = `
      INSERT INTO ad_campaigns (
        user_id, team_id, ad_account_id, campaign_id, platform, name,
        objective, optimization_goal, bid_strategy, budget_type,
        budget_amount, bid_amount, start_date, end_date, targeting,
        placement_settings, special_categories
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const result = await db.query(query, [
      user.userId,
      user.teamId,
      adAccountId,
      campaignId,
      platform,
      name,
      objective,
      optimizationGoal,
      bidStrategy,
      budgetType,
      budgetAmount,
      bidAmount,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null,
      JSON.stringify(targeting || {}),
      JSON.stringify(placementSettings || {}),
      specialCategories
    ]);

    const adCampaign = result.rows[0];

    // Create campaign on the actual platform
    try {
      const platformCampaignId = await createPlatformCampaign(platform, adCampaign, user);
      
      // Update with platform campaign ID
      await db.query(
        'UPDATE ad_campaigns SET platform_campaign_id = $1, platform_status = $2 WHERE id = $3',
        [platformCampaignId, 'PAUSED', adCampaign.id]
      );
      
      adCampaign.platform_campaign_id = platformCampaignId;
      adCampaign.platform_status = 'PAUSED';
    } catch (platformError) {
      console.error('Platform campaign creation failed:', platformError);
      // Campaign exists in our DB but failed on platform
      adCampaign.platform_error = platformError instanceof Error ? platformError.message : 'Platform error occurred';
    }

    return NextResponse.json({
      success: true,
      adCampaign
    });

  } catch (error) {
    console.error('Ad campaign creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create ad campaign' },
      { status: 500 }
    );
  }
});

// Get Ad Campaigns
export const GET = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const adAccountId = searchParams.get('ad_account_id');
    const platform = searchParams.get('platform');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = `
      SELECT ac.*, aa.account_name, aa.platform as account_platform
      FROM ad_campaigns ac
      JOIN ad_accounts aa ON ac.ad_account_id = aa.id
      WHERE ac.user_id = $1
    `;
    
    const values = [user.userId];

    if (adAccountId) {
      query += ` AND ac.ad_account_id = $${values.length + 1}`;
      values.push(adAccountId);
    }

    if (platform) {
      query += ` AND ac.platform = $${values.length + 1}`;
      values.push(platform);
    }

    if (status) {
      query += ` AND ac.status = $${values.length + 1}`;
      values.push(status);
    }

    query += `
      ORDER BY ac.created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    
    values.push(limit, offset);

    const result = await db.query(query, values);

    // Sync with platform data
    const campaignsWithMetrics = await Promise.all(
      result.rows.map(async (campaign: any) => {
        try {
          const platformMetrics = await getPlatformCampaignMetrics(campaign.platform, campaign.platform_campaign_id, user);
          return {
            ...campaign,
            metrics: platformMetrics
          };
        } catch (error) {
          return {
            ...campaign,
            metrics: null,
            sync_error: error instanceof Error ? error.message : 'Sync error occurred'
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      adCampaigns: campaignsWithMetrics,
      pagination: {
        limit,
        offset,
        hasMore: result.rows.length === limit
      }
    });

  } catch (error) {
    console.error('Ad campaigns fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ad campaigns' },
      { status: 500 }
    );
  }
});

// Platform-specific campaign creation
async function createPlatformCampaign(platform: string, campaign: any, user: any): Promise<string> {
  switch (platform) {
    case 'facebook':
      return await createFacebookCampaign(campaign, user);
    case 'google':
      return await createGoogleCampaign(campaign, user);
    case 'linkedin':
      return await createLinkedInCampaign(campaign, user);
    case 'twitter':
      return await createTwitterCampaign(campaign, user);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function createFacebookCampaign(campaign: any, user: any): Promise<string> {
  // Get ad account tokens
  const adAccountQuery = `
    SELECT account_id, access_token FROM ad_accounts 
    WHERE id = $1 AND user_id = $2
  `;
  const result = await db.query(adAccountQuery, [campaign.ad_account_id, user.userId]);
  const adAccount = result.rows[0];
  
  if (!adAccount) {
    throw new Error('Ad account not found');
  }

  // Create campaign via Facebook Marketing API
  const response = await fetch(`https://graph.facebook.com/v18.0/${adAccount.account_id}/campaigns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: campaign.name,
      objective: campaign.objective.toUpperCase(),
      status: 'PAUSED', // Always start paused
      buying_type: 'AUCTION',
      budget_rebalance_flag: campaign.budget_type === 'daily',
      special_ad_categories: campaign.special_categories,
      access_token: adAccount.access_token // In production, this would be decrypted
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Facebook API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.id;
}

async function createGoogleCampaign(campaign: any, user: any): Promise<string> {
  // Google Ads API implementation
  // This would require Google Ads API setup and authentication
  throw new Error('Google Ads integration not implemented yet');
}

async function createLinkedInCampaign(campaign: any, user: any): Promise<string> {
  // LinkedIn Campaign Manager API implementation
  const adAccountQuery = `
    SELECT account_id, access_token FROM ad_accounts 
    WHERE id = $1 AND user_id = $2 AND platform = 'linkedin'
  `;
  const result = await db.query(adAccountQuery, [campaign.ad_account_id, user.userId]);
  const adAccount = result.rows[0];
  
  if (!adAccount) {
    throw new Error('LinkedIn ad account not found');
  }

  const response = await fetch('https://api.linkedin.com/rest/adCampaigns', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adAccount.access_token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202401'
    },
    body: JSON.stringify({
      name: campaign.name,
      type: 'SPONSORED_CONTENT',
      account: `urn:li:sponsoredAccount:${adAccount.account_id}`,
      objectiveType: campaign.objective.toUpperCase(),
      costType: 'CPC',
      status: 'PAUSED',
      dailyBudget: {
        currencyCode: 'USD',
        amount: campaign.budget_amount * 1000000 // LinkedIn uses micro amounts
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`LinkedIn API error: ${error.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.id.toString();
}

async function createTwitterCampaign(campaign: any, user: any): Promise<string> {
  // Twitter Ads API implementation
  throw new Error('Twitter Ads integration not implemented yet');
}

// Get platform campaign metrics
async function getPlatformCampaignMetrics(platform: string, platformCampaignId: string, user: any): Promise<any> {
  switch (platform) {
    case 'facebook':
      return await getFacebookCampaignMetrics(platformCampaignId, user);
    case 'google':
      return await getGoogleCampaignMetrics(platformCampaignId, user);
    case 'linkedin':
      return await getLinkedInCampaignMetrics(platformCampaignId, user);
    case 'twitter':
      return await getTwitterCampaignMetrics(platformCampaignId, user);
    default:
      return null;
  }
}

async function getFacebookCampaignMetrics(campaignId: string, user: any): Promise<any> {
  // Facebook Marketing API insights call
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${campaignId}/insights?fields=impressions,clicks,spend,cpm,cpc,ctr&access_token=ACCESS_TOKEN`
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.data[0] || {};
    }
  } catch (error) {
    console.error('Facebook metrics fetch failed:', error);
  }
  
  return null;
}

async function getLinkedInCampaignMetrics(campaignId: string, user: any): Promise<any> {
  // LinkedIn Campaign Manager API analytics call
  try {
    const response = await fetch(
      `https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&campaigns=List(${campaignId})&fields=impressions,clicks,costInUsd,clickThroughRate`,
      {
        headers: {
          'Authorization': `Bearer ACCESS_TOKEN`,
          'LinkedIn-Version': '202401'
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.elements[0] || {};
    }
  } catch (error) {
    console.error('LinkedIn metrics fetch failed:', error);
  }
  
  return null;
}

async function getGoogleCampaignMetrics(campaignId: string, user: any): Promise<any> {
  // Google Ads API reporting call
  return null;
}

async function getTwitterCampaignMetrics(campaignId: string, user: any): Promise<any> {
  // Twitter Ads API analytics call
  return null;
}