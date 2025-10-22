import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';

// GET /api/billing/invoices/[id]/download - Download invoice PDF
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const user = await prisma.user.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const invoice = await prisma.invoice.findFirst({
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

    // In a real app, you would:
    // 1. Fetch PDF from payment provider (Paddle, Stripe, etc.)
    // 2. Or generate PDF using a library like pdfkit or puppeteer
    // 3. Return the PDF blob

    // For now, return a simple PDF generation placeholder
    const pdfContent = generateInvoicePDF(invoice, user);

    return new NextResponse(pdfContent, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error downloading invoice:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to download invoice' },
      { status: 500 }
    );
  }
}

// Simplified PDF generation (in production, use proper PDF library)
function generateInvoicePDF(invoice: any, user: any): Buffer {
  // This is a placeholder - in production use pdfkit, puppeteer, or similar
  const pdfContent = `
    INVOICE #${invoice.invoiceNumber}
    Date: ${new Date(invoice.createdAt).toLocaleDateString()}
    
    Bill To:
    ${user.name}
    ${user.email}
    
    Description: ${invoice.description}
    Amount: $${invoice.amount}
    Status: ${invoice.status}
    
    Thank you for your business!
  `;

  return Buffer.from(pdfContent);
}
