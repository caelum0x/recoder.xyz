import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';


const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

function getAccessToken(session: unknown): string {
  if (!session || typeof session !== 'object') return '';
  const token = (session as Record<string, unknown>).accessToken;
  return typeof token === 'string' ? token : '';
}

/**
 * GET /api/user/usage-analytics
 * Get usage analytics for the authenticated user
 * Query params: startDate, endDate, groupBy (day|week|month), provider, model
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user, session } = authResult;

    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const days = searchParams.get('days') || '30';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const groupBy = searchParams.get('groupBy') || 'day';
    const provider = searchParams.get('provider');
    const model = searchParams.get('model');

    // Build query string for backend
    const backendParams = new URLSearchParams();
    if (startDate) backendParams.append('startDate', startDate);
    if (endDate) backendParams.append('endDate', endDate);
    backendParams.append('days', days);
    backendParams.append('groupBy', groupBy);
    if (provider) backendParams.append('provider', provider);
    if (model) backendParams.append('model', model);

    const backendUrl = `${BACKEND_URL}/api/auth/cli/usage-stats?${backendParams.toString()}`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getAccessToken(session)}`,
        'Content-Type': 'application/json',
        'X-User-Email': user.email,
        'X-User-ID': user.id || '',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to fetch usage analytics:', error);
      
      return NextResponse.json(
        { error: 'Failed to fetch usage analytics' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Transform data for frontend if needed
    return NextResponse.json({
      success: true,
      data,
      metadata: {
        startDate,
        endDate,
        groupBy,
        provider,
        model,
      },
    });

  } catch (error) {
    console.error('Usage analytics error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/usage-analytics/export
 * Export usage analytics as CSV or JSON
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user, session } = authResult;
    
    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { format = 'csv', startDate, endDate, filters } = body;

    if (!['csv', 'json'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format', message: 'Format must be csv or json' },
        { status: 400 }
      );
    }

    // Fetch usage data
    const backendParams = new URLSearchParams();
    if (startDate) backendParams.append('startDate', startDate);
    if (endDate) backendParams.append('endDate', endDate);
    backendParams.append('days', '365'); // Get more data for export
    
    const backendUrl = `${BACKEND_URL}/api/auth/cli/usage-stats?${backendParams.toString()}`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getAccessToken(session)}`,
        'Content-Type': 'application/json',
        'X-User-Email': user.email,
        'X-User-ID': user.id || '',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch usage data for export');
    }

    const data = await response.json();

    if (format === 'csv') {
      // Convert to CSV
      const csvData = convertToCSV(data);
      
      return new NextResponse(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="usage-export-${Date.now()}.csv"`,
        },
      });
    } else {
      // Return as JSON
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="usage-export-${Date.now()}.json"`,
        },
      });
    }

  } catch (error) {
    console.error('Usage analytics export error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to export usage analytics',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper function to convert data to CSV format
 */
function convertToCSV(data: any): string {
  if (!data || !data.usage || data.usage.length === 0) {
    return 'No data available';
  }

  const usage = data.usage;
  
  // CSV headers
  const headers = ['Date', 'Request Type', 'Provider', 'Model', 'Tokens', 'Cost', 'Duration (ms)', 'Success'];
  
  // CSV rows
  const rows = usage.map((item: any) => [
    new Date(item.timestamp).toISOString(),
    item.requestType || '',
    item.provider || '',
    item.model || '',
    item.tokens || 0,
    item.cost || 0,
    item.duration || 0,
    item.success ? 'Yes' : 'No',
  ]);
  
  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map((row: any[]) => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
  
  return csvContent;
}
