/**
 * Admin LTV-by-channel API
 *
 * GET /api/admin/ltv
 *
 * Protected by the shared admin gate (`ensureAdminAccess`: an `x-admin-secret`
 * header matching ADMIN_SECRET, or an authenticated admin session).
 *
 * Returns revenue / LTV proxies grouped by acquisition channel, aggregated
 * ONLY from persisted `users` records. It never synthesizes CAC and never
 * fabricates revenue — see `lib/analytics/ltv.ts` for the truthfulness rules.
 * When there are no revenue-bearing records the report is an honest empty
 * state (`hasData: false`), not zeros dressed up as metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureAdminAccess } from '@/lib/admin-auth';
import { getLtvReport } from '@/lib/analytics/ltv';

export async function GET(request: NextRequest) {
  const access = await ensureAdminAccess(request);
  if ('response' in access) {
    return access.response;
  }

  const report = await getLtvReport({
    users: {
      findMany: (args) => prisma.users.findMany(args),
    },
  });

  return NextResponse.json({ success: true, report }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
