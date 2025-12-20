/**
 * CLI Chat History API
 * Save and list chat sessions from CLI
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { neon } from '@neondatabase/serverless';
import { nanoid } from 'nanoid';

function getSQL() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return neon(databaseUrl);
}

/**
 * GET /api/cli/chat - List chat sessions
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSQL();
    const sessions = await sql`
      SELECT url_id, title, total_messages, updated_at
      FROM chat_sessions
      WHERE user_id = ${session.user.id}
      ORDER BY updated_at DESC
      LIMIT 50
    `;

    return NextResponse.json({
      sessions: sessions.map((s: any) => ({
        chatId: s.url_id,
        title: s.title || 'Untitled',
        messageCount: s.total_messages || 0,
        lastUpdated: s.updated_at?.toISOString()
      }))
    });
  } catch (error) {
    console.error('[cli/chat] GET error:', error);
    return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 });
  }
}

/**
 * POST /api/cli/chat - Save new chat session
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, messages, projectPath, metadata } = await request.json();
    if (!messages?.length) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });
    }

    const sql = getSQL();
    const chatId = nanoid(10);
    
    await sql`
      INSERT INTO chat_sessions (url_id, user_id, title, description, messages, total_messages, metadata, created_at, updated_at)
      VALUES (
        ${chatId},
        ${session.user.id},
        ${title || 'CLI Chat'},
        ${projectPath || ''},
        ${JSON.stringify(messages)},
        ${messages.length},
        ${JSON.stringify({ ...metadata, source: 'cli', projectPath })},
        NOW(),
        NOW()
      )
    `;

    return NextResponse.json({
      success: true,
      chatId,
      url: `${process.env.NEXTAUTH_URL || 'https://recoder.xyz'}/chat/${chatId}`
    });
  } catch (error) {
    console.error('[cli/chat] POST error:', error);
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 });
  }
}
