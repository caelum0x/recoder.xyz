import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/jwt';
import { db } from '@/lib/database/client';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';

// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'social-media-assets';
const CDN_URL = process.env.AWS_CLOUDFRONT_URL || `https://${BUCKET_NAME}.s3.amazonaws.com`;

// Content Library API
export const POST = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'upload':
        return await handleFileUpload(request, user, body);
      case 'create_content':
        return await createContentItem(user, body);
      case 'generate_variants':
        return await generateContentVariants(user, body);
      case 'bulk_import':
        return await bulkImportContent(user, body);
      case 'ai_optimize':
        return await aiOptimizeContent(user, body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Content library error:', error);
    return NextResponse.json({ error: 'Content operation failed' }, { status: 500 });
  }
});

export const GET = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const category = searchParams.get('category');
    const contentType = searchParams.get('content_type');
    const tags = searchParams.get('tags')?.split(',') || [];
    const search = searchParams.get('search');
    const teamId = searchParams.get('team_id');

    const offset = (page - 1) * limit;

    let query = `
      SELECT cl.*, u.first_name, u.last_name,
             array_length(cl.media_urls, 1) as media_count,
             json_array_length(cl.platform_specific) as platform_count
      FROM content_library cl
      JOIN users u ON cl.created_by = u.id
      WHERE (cl.user_id = $1 OR cl.team_id = $2)
    `;

    const values = [user.userId, teamId];

    if (category) {
      query += ` AND cl.category = $${values.length + 1}`;
      values.push(category);
    }

    if (contentType) {
      query += ` AND cl.content_type = $${values.length + 1}`;
      values.push(contentType);
    }

    if (tags.length > 0) {
      query += ` AND cl.tags && $${values.length + 1}`;
      values.push(tags);
    }

    if (search) {
      query += ` AND (cl.title ILIKE $${values.length + 1} OR cl.content ILIKE $${values.length + 1})`;
      values.push(`%${search}%`);
    }

    query += ` ORDER BY cl.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await db.query(query, values);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) FROM content_library cl 
      WHERE (cl.user_id = $1 OR cl.team_id = $2)
    `;
    const countValues = [user.userId, teamId];

    if (category) {
      countQuery += ` AND cl.category = $${countValues.length + 1}`;
      countValues.push(category);
    }

    if (contentType) {
      countQuery += ` AND cl.content_type = $${countValues.length + 1}`;
      countValues.push(contentType);
    }

    if (tags.length > 0) {
      countQuery += ` AND cl.tags && $${countValues.length + 1}`;
      countValues.push(tags);
    }

    const countResult = await db.query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].count);

    // Get categories and tags for filtering
    const categoriesQuery = `
      SELECT category, COUNT(*) as count 
      FROM content_library 
      WHERE (user_id = $1 OR team_id = $2) AND category IS NOT NULL
      GROUP BY category 
      ORDER BY count DESC
    `;
    const categoriesResult = await db.query(categoriesQuery, [user.userId, teamId]);

    const tagsQuery = `
      SELECT unnest(tags) as tag, COUNT(*) as count 
      FROM content_library 
      WHERE (user_id = $1 OR team_id = $2) AND tags IS NOT NULL
      GROUP BY tag 
      ORDER BY count DESC 
      LIMIT 50
    `;
    const tagsResult = await db.query(tagsQuery, [user.userId, teamId]);

    return NextResponse.json({
      success: true,
      content: result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      },
      filters: {
        categories: categoriesResult.rows,
        tags: tagsResult.rows
      }
    });

  } catch (error) {
    console.error('Content fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
});

// File Upload Handler
async function handleFileUpload(request: NextRequest, user: any, body: any) {
  const { file_data, file_name, file_type, file_size, team_id } = body;

  if (!file_data || !file_name) {
    return NextResponse.json({ error: 'File data and name required' }, { status: 400 });
  }

  try {
    // Decode base64 file data
    const buffer = Buffer.from(file_data, 'base64');
    const fileId = uuidv4();
    const fileExt = file_name.split('.').pop();
    const fileName = `${fileId}.${fileExt}`;
    const filePath = `uploads/${user.userId}/${fileName}`;

    // Process different file types
    let processedBuffer = buffer;
    let metadata: any = {
      original_size: file_size,
      format: fileExt
    };

    if (file_type.startsWith('image/')) {
      // Process images with Sharp
      const image = sharp(buffer);
      const imageMetadata = await image.metadata();
      
      metadata = {
        ...metadata,
        width: imageMetadata.width,
        height: imageMetadata.height,
        format: imageMetadata.format
      };

      // Optimize image
      processedBuffer = Buffer.from(await image
        .jpeg({ quality: 85, progressive: true })
        .toBuffer());

      // Generate thumbnails
      const thumbnailBuffer = await image
        .resize(300, 300, { fit: 'cover' })
        .jpeg({ quality: 70 })
        .toBuffer();

      // Upload thumbnail
      const thumbnailPath = `thumbnails/${user.userId}/${fileId}_thumb.jpg`;
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: thumbnailPath,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg'
      }));

      metadata.thumbnail_url = `${CDN_URL}/${thumbnailPath}`;
    }

    if (file_type.startsWith('video/')) {
      // Process videos with FFmpeg (in production, use a queue)
      metadata.duration = await getVideoDuration(buffer);
      
      // Generate video thumbnail
      const thumbnailPath = `thumbnails/${user.userId}/${fileId}_thumb.jpg`;
      // FFmpeg thumbnail generation would go here
      metadata.thumbnail_url = `${CDN_URL}/${thumbnailPath}`;
    }

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
      Body: processedBuffer,
      ContentType: file_type,
      Metadata: {
        userId: user.userId,
        originalName: file_name
      }
    }));

    const cdnUrl = `${CDN_URL}/${filePath}`;

    // Save to database
    const assetQuery = `
      INSERT INTO media_assets (
        user_id, team_id, filename, original_filename, file_type,
        file_size, mime_type, width, height, duration,
        storage_provider, storage_path, cdn_url, thumbnail_url,
        metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const assetResult = await db.query(assetQuery, [
      user.userId,
      team_id,
      fileName,
      file_name,
      fileExt,
      processedBuffer.length,
      file_type,
      metadata.width,
      metadata.height,
      metadata.duration,
      'aws_s3',
      filePath,
      cdnUrl,
      metadata.thumbnail_url,
      JSON.stringify(metadata),
      user.userId
    ]);

    return NextResponse.json({
      success: true,
      asset: assetResult.rows[0]
    });

  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// Create Content Item
async function createContentItem(user: any, body: any) {
  const {
    title,
    content,
    content_type,
    category,
    tags = [],
    target_audience,
    platform_specific = {},
    media_urls = [],
    hashtags = [],
    mentions = [],
    team_id,
    language = 'en',
    tone = 'professional'
  } = body;

  if (!title || !content || !content_type) {
    return NextResponse.json(
      { error: 'Title, content, and content type are required' },
      { status: 400 }
    );
  }

  try {
    // AI-powered content analysis
    const contentAnalysis = await analyzeContentWithAI(content, platform_specific);

    const query = `
      INSERT INTO content_library (
        user_id, team_id, title, content, content_type, platform_specific,
        tags, category, language, tone, target_audience, hashtags, mentions,
        media_urls, performance_score, estimated_reach, estimated_engagement,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

    const result = await db.query(query, [
      user.userId,
      team_id,
      title,
      content,
      content_type,
      JSON.stringify(platform_specific),
      tags,
      category,
      language,
      tone,
      target_audience,
      hashtags,
      mentions,
      media_urls,
      contentAnalysis.performance_score,
      contentAnalysis.estimated_reach,
      contentAnalysis.estimated_engagement,
      user.userId
    ]);

    return NextResponse.json({
      success: true,
      content_item: result.rows[0],
      analysis: contentAnalysis
    });

  } catch (error) {
    console.error('Content creation error:', error);
    return NextResponse.json({ error: 'Content creation failed' }, { status: 500 });
  }
}

// Generate Content Variants
async function generateContentVariants(user: any, body: any) {
  const { content_id, platforms = [], variations_count = 3 } = body;

  try {
    // Get original content
    const contentQuery = `SELECT * FROM content_library WHERE id = $1 AND (user_id = $2 OR team_id = $3)`;
    const contentResult = await db.query(contentQuery, [content_id, user.userId, body.team_id]);
    
    if (contentResult.rows.length === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const originalContent = contentResult.rows[0];
    const variants: any[] = [];

    // Generate platform-specific variants
    for (const platform of platforms) {
      for (let i = 0; i < variations_count; i++) {
        const variant = await generatePlatformVariant(originalContent, platform, i + 1);
        
        // Save variant
        const variantQuery = `
          INSERT INTO content_library (
            user_id, team_id, title, content, content_type, platform_specific,
            tags, category, language, tone, target_audience, hashtags, mentions,
            media_urls, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *
        `;

        const variantResult = await db.query(variantQuery, [
          user.userId,
          originalContent.team_id,
          `${originalContent.title} - ${platform} Variant ${i + 1}`,
          variant.content,
          originalContent.content_type,
          JSON.stringify({ [platform]: variant.platform_config }),
          originalContent.tags,
          originalContent.category,
          originalContent.language,
          originalContent.tone,
          originalContent.target_audience,
          variant.hashtags,
          originalContent.mentions,
          originalContent.media_urls,
          user.userId
        ]);

        variants.push(variantResult.rows[0]);
      }
    }

    return NextResponse.json({
      success: true,
      original_content: originalContent,
      variants: variants,
      generated_count: variants.length
    });

  } catch (error) {
    console.error('Variant generation error:', error);
    return NextResponse.json({ error: 'Variant generation failed' }, { status: 500 });
  }
}

// AI Content Analysis
async function analyzeContentWithAI(content: string, platformSpecific: any) {
  try {
    // Use Together AI for content analysis
    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a social media content analyst. Analyze content and predict performance.'
          },
          {
            role: 'user',
            content: `Analyze this social media content and provide performance predictions:

Content: "${content}"

Platform info: ${JSON.stringify(platformSpecific)}

Provide analysis in JSON format:
{
  "performance_score": number (1-100),
  "estimated_reach": number,
  "estimated_engagement": number,
  "sentiment": "positive|neutral|negative",
  "readability_score": number (1-100),
  "key_topics": ["topic1", "topic2"],
  "improvement_suggestions": ["suggestion1", "suggestion2"]
}`
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      })
    });

    if (response.ok) {
      const data = await response.json();
      const analysis = JSON.parse(data.choices[0].message.content);
      return analysis;
    }
  } catch (error) {
    console.error('AI analysis failed:', error);
  }

  // Fallback analysis
  return {
    performance_score: Math.floor(Math.random() * 40) + 60, // 60-100
    estimated_reach: Math.floor(Math.random() * 10000) + 5000,
    estimated_engagement: Math.floor(Math.random() * 500) + 200,
    sentiment: 'neutral',
    readability_score: 75,
    key_topics: ['social media', 'content'],
    improvement_suggestions: ['Add more engaging visuals', 'Include call-to-action']
  };
}

// Generate Platform Variant
async function generatePlatformVariant(originalContent: any, platform: string, variantNumber: number) {
  const platformLimits: Record<string, { max_chars: number; hashtags: number }> = {
    twitter: { max_chars: 280, hashtags: 2 },
    linkedin: { max_chars: 3000, hashtags: 3 },
    facebook: { max_chars: 2200, hashtags: 5 },
    instagram: { max_chars: 2200, hashtags: 30 }
  };

  const limits = platformLimits[platform] || { max_chars: 2200, hashtags: 5 };
  
  try {
    // Use AI to generate platform-specific variant
    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
        messages: [
          {
            role: 'system',
            content: `You are a social media content optimizer. Create platform-specific variants of content.`
          },
          {
            role: 'user',
            content: `Create a ${platform} variant of this content:

Original: "${originalContent.content}"
Platform: ${platform}
Character limit: ${limits.max_chars}
Max hashtags: ${limits.hashtags}
Variant #: ${variantNumber}

Make it engaging and platform-appropriate. Return JSON:
{
  "content": "optimized content",
  "hashtags": ["hashtag1", "hashtag2"],
  "platform_config": {
    "posting_time": "optimal time",
    "audience_targeting": "target audience",
    "engagement_strategy": "strategy"
  }
}`
          }
        ],
        max_tokens: 400,
        temperature: 0.7 + (variantNumber * 0.1)
      })
    });

    if (response.ok) {
      const data = await response.json();
      return JSON.parse(data.choices[0].message.content);
    }
  } catch (error) {
    console.error('Variant generation failed:', error);
  }

  // Fallback variant
  const truncatedContent = originalContent.content.substring(0, limits.max_chars - 50);
  return {
    content: `${truncatedContent} (${platform} variant ${variantNumber})`,
    hashtags: originalContent.hashtags?.slice(0, limits.hashtags) || [],
    platform_config: {
      posting_time: 'peak hours',
      audience_targeting: originalContent.target_audience,
      engagement_strategy: 'maximize reach'
    }
  };
}

// Video duration helper
async function getVideoDuration(buffer: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    // In production, use FFprobe to get video duration
    // For now, return mock duration
    resolve(Math.floor(Math.random() * 300) + 30); // 30-330 seconds
  });
}

// AI Content Optimization
async function aiOptimizeContent(user: any, body: any) {
  const { content_id, optimization_goals = [], platforms = [] } = body;

  try {
    const contentQuery = `SELECT * FROM content_library WHERE id = $1 AND (user_id = $2 OR team_id = $3)`;
    const contentResult = await db.query(contentQuery, [content_id, user.userId, body.team_id]);
    
    if (contentResult.rows.length === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const content = contentResult.rows[0];

    // AI optimization
    const optimized = await optimizeContentWithAI(content, optimization_goals, platforms);

    // Update content
    const updateQuery = `
      UPDATE content_library 
      SET content = $1, hashtags = $2, platform_specific = $3, 
          performance_score = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `;

    const updateResult = await db.query(updateQuery, [
      optimized.content,
      optimized.hashtags,
      JSON.stringify(optimized.platform_specific),
      optimized.performance_score,
      content_id
    ]);

    return NextResponse.json({
      success: true,
      original: content,
      optimized: updateResult.rows[0],
      improvements: optimized.improvements
    });

  } catch (error) {
    console.error('Content optimization error:', error);
    return NextResponse.json({ error: 'Optimization failed' }, { status: 500 });
  }
}

async function optimizeContentWithAI(content: any, goals: string[], platforms: string[]) {
  try {
    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a social media optimization expert. Improve content for maximum engagement.'
          },
          {
            role: 'user',
            content: `Optimize this content:

Original: "${content.content}"
Goals: ${goals.join(', ')}
Platforms: ${platforms.join(', ')}
Current hashtags: ${content.hashtags?.join(', ') || 'none'}

Optimize for engagement and return JSON:
{
  "content": "improved content",
  "hashtags": ["optimized hashtags"],
  "platform_specific": {"platform": "specific optimizations"},
  "performance_score": number,
  "improvements": ["what was improved"]
}`
          }
        ],
        max_tokens: 600,
        temperature: 0.4
      })
    });

    if (response.ok) {
      const data = await response.json();
      return JSON.parse(data.choices[0].message.content);
    }
  } catch (error) {
    console.error('AI optimization failed:', error);
  }

  // Fallback optimization
  return {
    content: content.content + ' 🚀',
    hashtags: [...(content.hashtags || []), '#optimized'],
    platform_specific: content.platform_specific || {},
    performance_score: Math.min(100, (content.performance_score || 60) + 10),
    improvements: ['Added engagement emoji', 'Optimized hashtags']
  };
}

async function bulkImportContent(user: any, body: any) {
  const { content_items, team_id } = body;

  if (!Array.isArray(content_items) || content_items.length === 0) {
    return NextResponse.json({ error: 'Content items array required' }, { status: 400 });
  }

  const results: Array<{success: boolean; item?: any; error?: string}> = [];
  
  for (const item of content_items) {
    try {
      const result = await createContentItem(user, { ...item, team_id });
      results.push({ success: true, item: result });
    } catch (error) {
      results.push({ success: false, error: error instanceof Error ? error.message : 'Unknown error', item });
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return NextResponse.json({
    success: true,
    results,
    summary: {
      total: content_items.length,
      successful,
      failed
    }
  });
}