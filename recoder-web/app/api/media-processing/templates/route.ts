import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/jwt';

// GET /api/media-processing/templates
export async function GET(request: NextRequest) {
  return requireAuth(async (request: NextRequest, user: any) => {
    try {
      // Mock templates for now - replace with actual database query
      const templates = [
        {
          id: '1',
          name: 'Instagram Post',
          category: 'social',
          platform: 'instagram',
          aspectRatio: '1:1',
          resolution: { width: 1080, height: 1080 },
          settings: { format: 'mp4', quality: 'high' }
        },
        {
          id: '2', 
          name: 'YouTube Video',
          category: 'video',
          platform: 'youtube',
          aspectRatio: '16:9',
          resolution: { width: 1920, height: 1080 },
          settings: { format: 'mp4', quality: 'ultra' }
        }
      ];

      return NextResponse.json({ templates });
    } catch (error) {
      console.error('Templates API error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      );
    }
  })(request);
}

// POST /api/media-processing/templates
export async function POST(request: NextRequest) {
  return requireAuth(async (request: NextRequest, user: any) => {
    try {
      const body = await request.json();
      
      // Validate required fields
      if (!body.name || !body.category || !body.platform) {
        return NextResponse.json(
          { error: 'Missing required fields: name, category, platform' },
          { status: 400 }
        );
      }

      // Mock creation - replace with actual database insert
      const newTemplate = {
        id: Date.now().toString(),
        ...body,
        userId: user.id,
        createdAt: new Date().toISOString()
      };

      return NextResponse.json({ template: newTemplate }, { status: 201 });
    } catch (error) {
      console.error('Create template error:', error);
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }
  })(request);
}