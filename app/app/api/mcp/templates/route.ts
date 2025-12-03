import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-helpers';
import { SERVER_TEMPLATES, applyTemplate } from '@/lib/mcp/templates';
import { installServer } from '@/lib/services/mcp.service';

export async function GET() {
  return NextResponse.json({ templates: SERVER_TEMPLATES });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId } = await req.json();
    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    const result = await applyTemplate(
      user.id,
      templateId,
      installServer
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to apply template:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply template' },
      { status: 500 }
    );
  }
}
