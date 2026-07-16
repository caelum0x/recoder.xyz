/**
 * CLI Chat Session API - Get/Update specific chat
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { neon } from '@neondatabase/serverless';
import { logger } from '@/lib/logger';

function getSQL() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return neon(databaseUrl);
}

/**
 * GET /api/cli/chat/[chatId] - Load chat session
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatId } = await props.params;
    const sql = getSQL();
    
    const rows = await sql`
      SELECT url_id, title, description, messages, metadata, updated_at
      FROM chat_sessions
      WHERE url_id = ${chatId} AND user_id = ${session.user.id}
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const chat = rows[0] as any;
    return NextResponse.json({
      chatId: chat.url_id,
      title: chat.title,
      messages: chat.messages || [],
      metadata: chat.metadata,
      lastUpdated: chat.updated_at?.toISOString()
    });
  } catch (error) {
    logger.error('[cli/chat/[chatId]] GET error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to load session' }, { status: 500 });
  }
}

/**
 * PUT /api/cli/chat/[chatId] - Update chat session
 */
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatId } = await props.params;
    const { title, messages, metadata } = await request.json();
    const sql = getSQL();

    await sql`
      UPDATE chat_sessions
      SET 
        title = COALESCE(${title}, title),
        messages = COALESCE(${messages ? JSON.stringify(messages) : null}, messages),
        total_messages = COALESCE(${messages?.length}, total_messages),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}, metadata),
        updated_at = NOW()
      WHERE url_id = ${chatId} AND user_id = ${session.user.id}
    `;

    return NextResponse.json({ success: true, chatId });
  } catch (error) {
    logger.error('[cli/chat/[chatId]] PUT error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}
