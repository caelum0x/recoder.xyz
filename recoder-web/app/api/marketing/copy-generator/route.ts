import { NextRequest, NextResponse } from 'next/server';

interface CopyGeneratorRequest {
  copy_type: 'landing_page' | 'email_campaign' | 'social_post' | 'ad_copy' | 'product_description' | 'blog_post';
  product_name: string;
  product_description: string;
  target_audience: string;
  key_benefits: string[];
  tone: 'professional' | 'casual' | 'urgent' | 'friendly' | 'authoritative';
  platform?: 'facebook' | 'google' | 'linkedin' | 'twitter' | 'instagram';
  word_limit?: number;
  include_cta?: boolean;
  brand_voice?: string;
  competitor_analysis?: boolean;
  model_preference?: 'together_ai' | 'openrouter' | 'auto';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CopyGeneratorRequest;
    
    const { 
      copy_type,
      product_name,
      product_description,
      target_audience,
      key_benefits,
      tone,
      platform,
      word_limit,
      include_cta = true,
      brand_voice,
      competitor_analysis = false,
      model_preference = 'together_ai'
    } = body;

    if (!product_name || !product_description || !target_audience || !key_benefits.length) {
      return NextResponse.json(
        { error: 'Missing required fields: product_name, product_description, target_audience, key_benefits' },
        { status: 400 }
      );
    }

    // Generate copy using AI models
    const copyVariations = await generateCopyVariations({
      copy_type,
      product_name,
      product_description,
      target_audience,
      key_benefits,
      tone,
      platform,
      word_limit,
      include_cta,
      brand_voice,
      model_preference
    });

    // Analyze copy performance potential
    const performanceAnalysis = await analyzeCopyPerformance(copyVariations);

    // Generate A/B test suggestions
    const abTestSuggestions = generateABTestSuggestions(copyVariations);

    return NextResponse.json({
      success: true,
      generated_copy: copyVariations,
      performance_analysis: performanceAnalysis,
      ab_test_suggestions: abTestSuggestions,
      model_used: model_preference,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Copy generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate marketing copy' },
      { status: 500 }
    );
  }
}

async function generateCopyVariations(params: CopyGeneratorRequest) {
  const variations = [];
  
  // Generate 3 variations using different approaches
  for (let i = 0; i < 3; i++) {
    let variation;
    
    try {
      if (params.model_preference === 'together_ai') {
        variation = await generateWithTogetherAI(params, i);
      } else if (params.model_preference === 'openrouter') {
        variation = await generateWithOpenRouter(params, i);
      } else {
        // Auto mode - use Together AI for cost effectiveness
        variation = await generateWithTogetherAI(params, i);
      }
    } catch (error) {
      console.error(`Failed to generate variation ${i + 1}:`, error);
      variation = generateFallbackCopy(params, i);
    }
    
    variations.push({
      id: `var_${i + 1}`,
      variation_name: getVariationName(i),
      copy: variation,
      approach: getApproachDescription(i),
      word_count: variation.split(' ').length,
      estimated_performance: Math.floor(Math.random() * 30) + 70 // Mock performance score
    });
  }
  
  return variations;
}

async function generateWithTogetherAI(params: CopyGeneratorRequest, variationIndex: number): Promise<string> {
  // Use free Together AI models for cost-effective copy generation
  const models = [
    'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
    'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
    'LGAI-EXAONE/EXAONE-3.5-32B-Instruct'
  ];
  
  const selectedModel = models[variationIndex % models.length];
  
  const prompt = buildCopyPrompt(params, variationIndex);
  
  try {
    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert marketing copywriter. Generate compelling, conversion-focused copy that drives action.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: params.word_limit ? Math.min(params.word_limit * 2, 1000) : 800,
        temperature: 0.7 + (variationIndex * 0.1) // Vary creativity per variation
      })
    });

    if (!response.ok) {
      throw new Error(`Together AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
    
  } catch (error) {
    console.error('Together AI generation failed:', error);
    throw error;
  }
}

async function generateWithOpenRouter(params: CopyGeneratorRequest, variationIndex: number): Promise<string> {
  // Use OpenRouter for premium models
  const models = [
    'deepseek/deepseek-v3',
    'google/gemini-2.5-flash',
    'deepseek/deepseek-r1'
  ];
  
  const selectedModel = models[variationIndex % models.length];
  const prompt = buildCopyPrompt(params, variationIndex);
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://recoder.xyz',
        'X-Title': 'Recoder Marketing Copy Generator'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert marketing copywriter specializing in high-converting copy.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: params.word_limit ? Math.min(params.word_limit * 2, 1000) : 800,
        temperature: 0.7 + (variationIndex * 0.1)
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
    
  } catch (error) {
    console.error('OpenRouter generation failed:', error);
    throw error;
  }
}

function buildCopyPrompt(params: CopyGeneratorRequest, variationIndex: number): string {
  const approaches = [
    'benefit-focused',
    'problem-solution',
    'social-proof'
  ];
  
  const currentApproach = approaches[variationIndex];
  
  let prompt = `Generate ${params.copy_type} copy with a ${currentApproach} approach.

Product: ${params.product_name}
Description: ${params.product_description}
Target Audience: ${params.target_audience}
Key Benefits: ${params.key_benefits.join(', ')}
Tone: ${params.tone}`;

  if (params.platform) {
    prompt += `\nPlatform: ${params.platform}`;
  }

  if (params.word_limit) {
    prompt += `\nWord Limit: ${params.word_limit} words`;
  }

  if (params.brand_voice) {
    prompt += `\nBrand Voice: ${params.brand_voice}`;
  }

  if (params.include_cta) {
    prompt += `\nInclude a compelling call-to-action`;
  }

  // Add specific instructions based on copy type
  switch (params.copy_type) {
    case 'landing_page':
      prompt += `\n\nCreate a compelling landing page headline and supporting copy that immediately communicates value and drives conversions. Include subheadings and bullet points if appropriate.`;
      break;
    case 'email_campaign':
      prompt += `\n\nWrite an email subject line and body copy that will get opened and drive clicks. Consider the email preview text.`;
      break;
    case 'social_post':
      prompt += `\n\nCreate engaging social media copy that stops the scroll and encourages engagement. Include relevant hashtags if appropriate.`;
      break;
    case 'ad_copy':
      prompt += `\n\nWrite compelling ad copy that grabs attention and drives clicks. Focus on the main benefit and create urgency.`;
      break;
    case 'product_description':
      prompt += `\n\nWrite a product description that highlights key features, benefits, and addresses potential customer concerns.`;
      break;
    case 'blog_post':
      prompt += `\n\nCreate a blog post introduction and outline that provides value and keeps readers engaged.`;
      break;
  }

  // Add approach-specific instructions
  switch (currentApproach) {
    case 'benefit-focused':
      prompt += `\n\nFocus on the primary benefits and outcomes. Lead with what the customer gains.`;
      break;
    case 'problem-solution':
      prompt += `\n\nStart by identifying the problem your target audience faces, then present your product as the solution.`;
      break;
    case 'social-proof':
      prompt += `\n\nIncorporate elements of social proof, testimonials, or success metrics to build credibility.`;
      break;
  }

  return prompt;
}

function generateFallbackCopy(params: CopyGeneratorRequest, variationIndex: number): string {
  // Fallback copy generation when AI fails
  const templates = {
    landing_page: [
      `Transform Your ${params.target_audience} Experience with ${params.product_name}`,
      `The Ultimate Solution for ${params.target_audience}: ${params.product_name}`,
      `Revolutionary ${params.product_name} - Perfect for ${params.target_audience}`
    ],
    email_campaign: [
      `Don't Miss Out: ${params.product_name} is Here!`,
      `Exclusive for You: ${params.product_name} Launch`,
      `Finally, a Solution That Works: ${params.product_name}`
    ],
    social_post: [
      `🚀 Introducing ${params.product_name} - the game-changer for ${params.target_audience}!`,
      `Why ${params.target_audience} love ${params.product_name}: ${params.key_benefits[0]}`,
      `The future of ${params.product_description.split(' ')[0]} is here: ${params.product_name}`
    ],
    ad_copy: [
      `${params.product_name}: ${params.key_benefits[0]}. Perfect for ${params.target_audience}.`,
      `Stop struggling with ${params.product_description.split(' ')[0]}. Try ${params.product_name} today.`,
      `Join thousands of ${params.target_audience} who chose ${params.product_name}.`
    ]
  };

  const categoryTemplates = templates[params.copy_type] || templates.ad_copy;
  const selectedTemplate = categoryTemplates[variationIndex % categoryTemplates.length];
  
  let copy = selectedTemplate;
  
  if (params.include_cta) {
    const ctas = [
      'Get Started Today!',
      'Try It Free Now!',
      'Learn More →',
      'Start Your Journey!',
      'Download Now!'
    ];
    copy += ` ${ctas[variationIndex % ctas.length]}`;
  }
  
  return copy;
}

async function analyzeCopyPerformance(variations: any[]) {
  const analysis = {
    overall_score: 0,
    strengths: [],
    improvements: [],
    predicted_metrics: {
      click_through_rate: 0,
      conversion_rate: 0,
      engagement_score: 0
    },
    best_variation: null
  };

  // Analyze each variation
  let bestScore = 0;
  let bestVariation = null;

  for (const variation of variations) {
    const copy = variation.copy;
    let score = 0;
    
    // Length analysis
    const wordCount = copy.split(' ').length;
    if (wordCount >= 10 && wordCount <= 50) score += 20;
    else if (wordCount >= 5 && wordCount <= 80) score += 10;
    
    // Power words detection
    const powerWords = ['free', 'new', 'exclusive', 'limited', 'guaranteed', 'proven', 'results', 'save', 'discover', 'transform'];
    const powerWordsFound = powerWords.filter(word => 
      copy.toLowerCase().includes(word)
    ).length;
    score += powerWordsFound * 5;
    
    // Call-to-action detection
    const ctaWords = ['now', 'today', 'get', 'start', 'try', 'download', 'learn more', 'sign up'];
    const hasStrrongCTA = ctaWords.some(cta => copy.toLowerCase().includes(cta));
    if (hasStrrongCTA) score += 15;
    
    // Urgency indicators
    const urgencyWords = ['limited time', 'expires', 'hurry', 'don\'t miss', 'act now'];
    const hasUrgency = urgencyWords.some(word => copy.toLowerCase().includes(word));
    if (hasUrgency) score += 10;
    
    // Benefit-focused language
    const benefitWords = ['you', 'your', 'save', 'gain', 'improve', 'increase', 'reduce'];
    const benefitScore = benefitWords.filter(word => 
      copy.toLowerCase().includes(word)
    ).length * 3;
    score += benefitScore;
    
    variation.performance_score = score;
    
    if (score > bestScore) {
      bestScore = score;
      bestVariation = variation;
    }
  }
  
  analysis.overall_score = Math.round(variations.reduce((sum, v) => sum + v.performance_score, 0) / variations.length);
  analysis.best_variation = bestVariation;
  
  // Generate insights
  if (analysis.overall_score >= 80) {
    analysis.strengths.push('Strong use of persuasive language');
    analysis.strengths.push('Clear value proposition');
  }
  
  if (analysis.overall_score < 60) {
    analysis.improvements.push('Add more benefit-focused language');
    analysis.improvements.push('Include stronger call-to-action');
    analysis.improvements.push('Consider adding urgency or scarcity elements');
  }
  
  // Predicted metrics (mock data based on score)
  analysis.predicted_metrics.click_through_rate = Math.max(1, Math.min(15, analysis.overall_score * 0.15));
  analysis.predicted_metrics.conversion_rate = Math.max(0.5, Math.min(8, analysis.overall_score * 0.08));
  analysis.predicted_metrics.engagement_score = analysis.overall_score;
  
  return analysis;
}

function generateABTestSuggestions(variations: any[]) {
  const suggestions = [
    {
      test_name: 'Headline Comparison',
      description: 'Test different headline approaches to see which drives more clicks',
      variations_to_test: variations.slice(0, 2).map(v => ({ id: v.id, name: v.variation_name })),
      primary_metric: 'click_through_rate',
      recommended_traffic_split: '50/50',
      minimum_sample_size: 1000,
      estimated_duration: '7-14 days'
    },
    {
      test_name: 'CTA Optimization',
      description: 'Compare different call-to-action phrases and positioning',
      variations_to_test: variations.map(v => ({ id: v.id, name: v.variation_name })),
      primary_metric: 'conversion_rate',
      recommended_traffic_split: '33/33/34',
      minimum_sample_size: 1500,
      estimated_duration: '10-21 days'
    }
  ];
  
  return suggestions;
}

function getVariationName(index: number): string {
  const names = ['Benefit-Focused', 'Problem-Solution', 'Social Proof'];
  return names[index] || `Variation ${index + 1}`;
}

function getApproachDescription(index: number): string {
  const descriptions = [
    'Emphasizes key benefits and outcomes',
    'Identifies problems and positions solution',
    'Leverages social proof and credibility'
  ];
  return descriptions[index] || `Alternative approach ${index + 1}`;
}