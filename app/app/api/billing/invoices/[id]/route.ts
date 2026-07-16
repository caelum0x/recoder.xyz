import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

import { prisma } from '@/lib/prisma';

// GET /api/billing/invoices/[id] - Get invoice details
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    // In Next.js 15, params is a Promise that must be awaited
    const params = await props.params;

    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const invoice = await prisma.invoices.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.id, // Use id as invoice number since invoiceNumber field doesn't exist
        date: invoice.createdAt.toISOString(),
        dueDate: invoice.createdAt.toISOString(), // dueDate field doesn't exist, using createdAt
        amount: invoice.amount,
        currency: invoice.currency || 'USD',
        status: invoice.status,
        description: invoice.description || '',
        pdfUrl: null, // pdfUrl field doesn't exist in schema
        items: invoice.items || [],
      },
    });
  } catch (error) {
    logger.error('Error fetching invoice', { route: 'api/billing/invoices/[id]', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invoice' },
      { status: 500 }
    );
  }
}
