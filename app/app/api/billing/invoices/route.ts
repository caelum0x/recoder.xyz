import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';

// GET /api/billing/invoices - List all invoices for user
export async function GET(req: NextRequest) {
  try {
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

    // Fetch invoices from database
    // In a real app, this would come from your payment provider (Paddle/DODO/Stripe)
    const invoices = await prisma.invoices.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // Transform to match frontend interface
    const formattedInvoices = invoices.map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.id, // Use id as invoice number
      date: invoice.createdAt.toISOString(),
      dueDate: invoice.createdAt.toISOString(), // dueDate field doesn't exist
      amount: invoice.amount,
      currency: invoice.currency || 'USD',
      status: invoice.status,
      description: invoice.description || 'Subscription Invoice',
      pdfUrl: null, // pdfUrl field doesn't exist in schema
    }));

    return NextResponse.json({
      success: true,
      invoices: formattedInvoices,
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
