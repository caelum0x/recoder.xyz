/**
 * Task Timeline API Proxy
 *
 * Forwards to the docker-backend A2A read-model endpoint
 * `GET /api/a2a/tasks/:taskId/timeline`, which projects the unified
 * task -> artifact -> pr -> preview -> approval timeline from shared run
 * history. Auth is enforced via Better Auth before proxying.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://docker.recoder.xyz' : 'http://localhost:3100');

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await props.params;

  if (!taskId || taskId === 'undefined') {
    return NextResponse.json({ success: false, error: 'taskId is required' }, { status: 400 });
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const sessionToken = request.cookies.get('recoder_session')?.value;
    const url = `${BACKEND_URL}/api/a2a/tasks/${encodeURIComponent(taskId)}/timeline`;

    const backendResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        'X-User-Email': session.user.email,
        'X-User-Id': session.user.id,
      },
      cache: 'no-store',
    });

    const data = await backendResponse.json().catch(() => ({
      success: false,
      error: 'Invalid response from backend',
    }));

    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Internal server error while fetching task timeline' },
      { status: 500 },
    );
  }
}
