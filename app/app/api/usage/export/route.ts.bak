import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { format, startDate, endDate } = body;

    const user = await prisma.user.findUnique({
      where: { email: authUser.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const where: any = { userId: user.id };

    if (startDate && endDate) {
      where.timestamp = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const usageRecords = await prisma.usageRecord.findMany({
      where,
      orderBy: { timestamp: 'desc' }
    });

    if (format === 'csv') {
      const csv = generateCSV(usageRecords);
      
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="usage-export-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    } else if (format === 'json') {
      const jsonData = JSON.stringify(usageRecords, null, 2);
      
      return new NextResponse(jsonData, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="usage-export-${new Date().toISOString().split('T')[0]}.json"`
        }
      });
    } else {
      return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
    }

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export usage data' },
      { status: 500 }
    );
  }
}

function generateCSV(records: any[]): string {
  const headers = ['Timestamp', 'Model', 'Platform', 'Tokens', 'Cost'];
  const rows = records.map(record => [
    record.timestamp.toISOString(),
    record.model || 'unknown',
    record.requestType || 'N/A',
    record.tokensUsed || 0,
    (record.cost || 0).toFixed(4)
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
}
