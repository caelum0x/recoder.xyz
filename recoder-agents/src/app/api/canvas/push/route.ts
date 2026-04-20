/**
 * Internal endpoint called by docker-backend to relay canvas updates to SSE subscribers.
 * Requires Authorization: Bearer <INTERNAL_SERVICE_KEY>
 */

import { NextRequest, NextResponse } from 'next/server';
import { pushCanvasUpdate } from '../_subscribers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Validate internal service key
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;
  if (expectedKey && token !== expectedKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.threadId || !Array.isArray(body.elements)) {
    return NextResponse.json({ error: 'threadId and elements[] required' }, { status: 400 });
  }

  pushCanvasUpdate(body.threadId, {
    type: 'canvas_update',
    projectId: body.projectId,
    threadId: body.threadId,
    elements: body.elements,
    timestamp: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
