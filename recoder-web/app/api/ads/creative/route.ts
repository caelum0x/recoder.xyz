import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireSubscription } from '@/lib/auth/jwt';
import { db } from '@/lib/database/client';

// AI-Powered Ad Creative Generation with Together AI
export const POST = requireSubscription(['pro', 'agency', 'enterprise'], async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const {
      action,
      adSetId,
      name,
      adFormat,
      creativeData,
      callToAction,
      destinationUrl,
      generateWithAI = false,
      aiPrompt,
      targetAudience,
      productName,
      brandVoice
    } = body;

    if (action === 'generate_creative') {
      return await generateAdCreativeWithAI({
        aiPrompt,
        adFormat,
        platform: body.platform || 'facebook',
        targetAudience,
        productName,
        brandVoice,
        callToAction,
        destinationUrl,
        userId: user.userId
      });
    }

    if (action === 'create_ad') {
      if (!adSetId || !name || !adFormat || !creativeData) {
        return NextResponse.json(
          { error: 'Ad set, name, format, and creative data are required' },
          { status: 400 }
        );
      }

      // Verify ad set belongs to user
      const adSetQuery = `
        SELECT ads.id as ad_set_id, ac.user_id
        FROM ad_sets ads
        JOIN ad_campaigns ac ON ads.ad_campaign_id = ac.id
        WHERE ads.id = $1 AND ac.user_id = $2
      `;
      const adSetResult = await db.query(adSetQuery, [adSetId, user.userId]);
      
      if (adSetResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Ad set not found or not accessible' },
          { status: 404 }
        );
      }

      // Create ad in database
      const query = `
        INSERT INTO ads (
          ad_set_id, name, ad_format, creative_data, call_to_action,
          destination_url, tracking_params
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const trackingParams = {
        utm_source: 'social_ads',
        utm_medium: 'paid_social',
        utm_campaign: name.toLowerCase().replace(/\s+/g, '_'),
        created_by: user.userId
      };

      const result = await db.query(query, [
        adSetId,
        name,
        adFormat,
        JSON.stringify(creativeData),
        callToAction,
        destinationUrl,
        JSON.stringify(trackingParams)
      ]);

      const ad = result.rows[0];

      // Create ad on platform
      try {
        const platformAdId = await createPlatformAd(ad, user);
        
        await db.query(
          'UPDATE ads SET platform_ad_id = $1, platform_status = $2 WHERE id = $3',
          [platformAdId, 'PAUSED', ad.id]
        );
        
        ad.platform_ad_id = platformAdId;
        ad.platform_status = 'PAUSED';
      } catch (platformError) {
        console.error('Platform ad creation failed:', platformError);
        ad.platform_error = platformError.message;
      }

      return NextResponse.json({
        success: true,
        ad
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Ad creative error:', error);
    return NextResponse.json(
      { error: 'Failed to process ad creative request' },
      { status: 500 }
    );
  }
});

// Get ads for an ad set
export const GET = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const adSetId = searchParams.get('ad_set_id');
    const adCampaignId = searchParams.get('ad_campaign_id');
    const status = searchParams.get('status');

    let query = `
      SELECT a.*, ads.name as ad_set_name, ac.name as campaign_name
      FROM ads a
      JOIN ad_sets ads ON a.ad_set_id = ads.id
      JOIN ad_campaigns ac ON ads.ad_campaign_id = ac.id
      WHERE ac.user_id = $1
    `;
    
    const values = [user.userId];

    if (adSetId) {
      query += ` AND a.ad_set_id = $${values.length + 1}`;
      values.push(adSetId);
    }

    if (adCampaignId) {
      query += ` AND ac.id = $${values.length + 1}`;
      values.push(adCampaignId);
    }

    if (status) {
      query += ` AND a.status = $${values.length + 1}`;
      values.push(status);
    }

    query += ` ORDER BY a.created_at DESC`;

    const result = await db.query(query, values);

    return NextResponse.json({
      success: true,
      ads: result.rows
    });

  } catch (error) {
    console.error('Ads fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ads' },
      { status: 500 }
    );
  }
});

// AI Creative Generation Function
async function generateAdCreativeWithAI(params: {
  aiPrompt: string;
  adFormat: string;
  platform: string;
  targetAudience?: string;
  productName?: string;
  brandVoice?: string;
  callToAction?: string;
  destinationUrl?: string;
  userId: string;
}) {
  const {
    aiPrompt,
    adFormat,
    platform,
    targetAudience,
    productName,
    brandVoice,
    callToAction,
    userId
  } = params;

  try {
    // Use Together AI for cost-effective ad generation
    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo', // Free model
        messages: [
          {
            role: 'system',
            content: `You are an expert advertising creative director specializing in high-converting ${platform} ads. Create compelling ad creatives that drive action and maximize ROI.`
          },
          {
            role: 'user',
            content: buildCreativePrompt(params)
          }
        ],
        max_tokens: 1000,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      throw new Error(`Together AI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Parse AI response into structured creative data
    const creativeData = parseAICreativeResponse(aiResponse, adFormat, platform);

    // Record AI generation for tracking
    await db.query(`
      INSERT INTO ai_generations (
        user_id, prompt, generated_content, content_type, platform,
        model_used, model_version, tokens_used, cost
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      userId,
      buildCreativePrompt(params),
      aiResponse,
      'ad_creative',
      platform,
      'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
      '1.0',
      data.usage?.total_tokens || 0,
      0 // Free model
    ]);

    return NextResponse.json({
      success: true,
      creativeData,
      aiResponse,
      suggestions: generateCreativeVariations(creativeData, adFormat),
      performance_predictions: predictCreativePerformance(creativeData, platform)
    });

  } catch (error) {
    console.error('AI creative generation failed:', error);
    
    // Fallback to template-based generation
    const fallbackCreative = generateFallbackCreative(params);
    
    return NextResponse.json({
      success: true,
      creativeData: fallbackCreative,
      fallback: true,
      suggestions: generateCreativeVariations(fallbackCreative, adFormat)
    });
  }
}

function buildCreativePrompt(params: any): string {
  const {
    aiPrompt,
    adFormat,
    platform,
    targetAudience,
    productName,
    brandVoice,
    callToAction
  } = params;

  let prompt = `Create a ${platform} ${adFormat} ad creative for: ${aiPrompt}`;
  
  if (productName) prompt += `\nProduct/Service: ${productName}`;
  if (targetAudience) prompt += `\nTarget Audience: ${targetAudience}`;
  if (brandVoice) prompt += `\nBrand Voice: ${brandVoice}`;
  if (callToAction) prompt += `\nDesired CTA: ${callToAction}`;

  prompt += `\n\nRequirements:
- Platform: ${platform}
- Format: ${adFormat}
- Must be compliant with ${platform} ad policies
- Include compelling headline, description, and CTA
- Focus on driving conversions and engagement
- Use persuasive copywriting techniques

Provide the response in JSON format with:
{
  "headline": "Primary headline (max 40 chars for most platforms)",
  "description": "Ad description/body text",
  "callToAction": "Call to action text",
  "images": ["description of image 1", "description of image 2"],
  "videos": ["description of video content if needed"],
  "additionalText": "Any additional text elements",
  "targeting_suggestions": "Suggested audience targeting",
  "budget_recommendation": "Recommended budget range",
  "performance_prediction": "Expected performance metrics"
}`;

  return prompt;
}

function parseAICreativeResponse(aiResponse: string, adFormat: string, platform: string): any {
  try {
    // Try to extract JSON from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        format: adFormat,
        platform: platform,
        headline: parsed.headline || '',
        description: parsed.description || '',
        callToAction: parsed.callToAction || 'Learn More',
        images: parsed.images || [],
        videos: parsed.videos || [],
        additionalText: parsed.additionalText || '',
        targeting_suggestions: parsed.targeting_suggestions || '',
        budget_recommendation: parsed.budget_recommendation || '',
        performance_prediction: parsed.performance_prediction || ''
      };
    }
  } catch (error) {
    console.error('Failed to parse AI response as JSON:', error);
  }

  // Fallback parsing
  const lines = aiResponse.split('\n');
  return {
    format: adFormat,
    platform: platform,
    headline: extractValue(lines, 'headline') || 'Great Product for You',
    description: extractValue(lines, 'description') || aiResponse.substring(0, 200),
    callToAction: extractValue(lines, 'call', 'cta', 'action') || 'Shop Now',
    images: ['Professional product image', 'Lifestyle image showing product in use'],
    targeting_suggestions: extractValue(lines, 'targeting', 'audience') || 'Interested in similar products',
    budget_recommendation: extractValue(lines, 'budget') || '$20-50 per day'
  };
}

function extractValue(lines: string[], ...keywords: string[]): string {
  for (const line of lines) {
    for (const keyword of keywords) {
      if (line.toLowerCase().includes(keyword)) {
        const parts = line.split(':');
        if (parts.length > 1) {
          return parts[1].trim().replace(/['"]/g, '');
        }
      }
    }
  }
  return '';
}

function generateFallbackCreative(params: any): any {
  const { adFormat, platform, productName, targetAudience, callToAction } = params;
  
  const headlines = [
    `Discover ${productName || 'Our Amazing Product'}`,
    `Perfect for ${targetAudience || 'You'}`,
    `Limited Time Offer on ${productName || 'Premium Products'}`,
    `Transform Your Life with ${productName || 'Our Solution'}`
  ];

  const descriptions = [
    `Get the best ${productName || 'product'} designed specifically for ${targetAudience || 'modern users'}. Join thousands of satisfied customers today.`,
    `Experience the difference with our premium ${productName || 'solution'}. Perfect for ${targetAudience || 'professionals'} who demand excellence.`,
    `Don't miss out on this exclusive offer. ${productName || 'Our product'} delivers results that ${targetAudience || 'customers'} love.`
  ];

  return {
    format: adFormat,
    platform: platform,
    headline: headlines[Math.floor(Math.random() * headlines.length)],
    description: descriptions[Math.floor(Math.random() * descriptions.length)],
    callToAction: callToAction || 'Shop Now',
    images: ['High-quality product image', 'Customer testimonial image'],
    targeting_suggestions: `${targetAudience || 'General audience'}, interests in similar products`,
    budget_recommendation: '$25-75 per day'
  };
}

function generateCreativeVariations(baseCreative: any, adFormat: string): any[] {
  const variations = [];
  
  // Headline variations
  const headlineVariations = [
    baseCreative.headline,
    baseCreative.headline.replace(/Discover|Get|Experience/, 'Try'),
    `New: ${baseCreative.headline}`,
    `${baseCreative.headline} - Limited Time`
  ];

  // CTA variations
  const ctaVariations = ['Shop Now', 'Learn More', 'Get Started', 'Try Free', 'Buy Now'];

  for (let i = 0; i < 3; i++) {
    variations.push({
      ...baseCreative,
      headline: headlineVariations[i] || baseCreative.headline,
      callToAction: ctaVariations[i] || baseCreative.callToAction,
      variation_name: `Variation ${i + 1}`
    });
  }

  return variations;
}

function predictCreativePerformance(creativeData: any, platform: string): any {
  // Mock performance prediction based on creative elements
  let score = 50; // Base score
  
  // Headline analysis
  if (creativeData.headline && creativeData.headline.length > 0) {
    score += 10;
    if (creativeData.headline.includes('Limited') || creativeData.headline.includes('New')) score += 5;
  }

  // Description analysis
  if (creativeData.description && creativeData.description.length > 50) {
    score += 10;
  }

  // CTA analysis
  const strongCTAs = ['Shop Now', 'Buy Now', 'Get Started', 'Try Free'];
  if (strongCTAs.includes(creativeData.callToAction)) {
    score += 15;
  }

  // Platform-specific bonuses
  if (platform === 'facebook' && creativeData.images && creativeData.images.length > 1) {
    score += 10;
  }

  return {
    overall_score: Math.min(100, score),
    predicted_ctr: (score / 100) * 3.5, // Mock CTR prediction
    predicted_conversion_rate: (score / 100) * 2.1, // Mock conversion rate
    recommendations: generatePerformanceRecommendations(creativeData, score)
  };
}

function generatePerformanceRecommendations(creativeData: any, score: number): string[] {
  const recommendations = [];
  
  if (score < 70) {
    recommendations.push('Consider adding urgency or scarcity elements to the headline');
    recommendations.push('Include more specific benefits in the description');
  }
  
  if (!creativeData.images || creativeData.images.length === 0) {
    recommendations.push('Add high-quality product images for better performance');
  }
  
  if (creativeData.description && creativeData.description.length < 50) {
    recommendations.push('Expand description with more compelling details');
  }

  return recommendations;
}

async function createPlatformAd(ad: any, user: any): Promise<string> {
  // Get ad set and campaign info
  const query = `
    SELECT ads.*, ac.platform, ac.platform_campaign_id, aa.access_token, aa.account_id
    FROM ad_sets ads
    JOIN ad_campaigns ac ON ads.ad_campaign_id = ac.id
    JOIN ad_accounts aa ON ac.ad_account_id = aa.id
    WHERE ads.id = $1
  `;
  
  const result = await db.query(query, [ad.ad_set_id]);
  const adSetData = result.rows[0];
  
  if (!adSetData) {
    throw new Error('Ad set data not found');
  }

  switch (adSetData.platform) {
    case 'facebook':
      return await createFacebookAd(ad, adSetData);
    case 'linkedin':
      return await createLinkedInAd(ad, adSetData);
    default:
      throw new Error(`Platform ${adSetData.platform} not supported yet`);
  }
}

async function createFacebookAd(ad: any, adSetData: any): Promise<string> {
  const creativeData = JSON.parse(ad.creative_data);
  
  const response = await fetch(`https://graph.facebook.com/v18.0/${adSetData.account_id}/ads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: ad.name,
      adset_id: adSetData.platform_ad_set_id,
      status: 'PAUSED',
      creative: {
        name: `${ad.name} Creative`,
        object_story_spec: {
          page_id: adSetData.page_id,
          link_data: {
            call_to_action: {
              type: ad.call_to_action,
              value: {
                link: ad.destination_url
              }
            },
            description: creativeData.description,
            link: ad.destination_url,
            message: creativeData.headline,
            name: creativeData.headline
          }
        }
      },
      access_token: adSetData.access_token
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Facebook ad creation failed: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.id;
}

async function createLinkedInAd(ad: any, adSetData: any): Promise<string> {
  // LinkedIn Campaign Manager API implementation
  throw new Error('LinkedIn ad creation not implemented yet');
}