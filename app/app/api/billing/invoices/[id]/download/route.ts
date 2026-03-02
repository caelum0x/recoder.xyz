import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

import { prisma } from '@/lib/prisma';

// GET /api/billing/invoices/[id]/download - Download invoice PDF
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

    // In a real app, you would:
    // 1. Fetch PDF from payment provider (Paddle, Stripe, etc.)
    // 2. Or generate PDF using a library like pdfkit or puppeteer
    // 3. Return the PDF blob

    // For now, return a simple PDF generation placeholder
    const pdfContent = generateInvoicePDF(invoice, user);

    return new NextResponse(pdfContent as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoice.id}.pdf"`,
      },
    });
  } catch (error) {
    logger.error('Error downloading invoice', { route: 'api/billing/invoices/[id]/download', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to download invoice' },
      { status: 500 }
    );
  }
}

/**
 * Generate a minimal valid PDF for the invoice.
 * Uses the raw PDF spec (no external library) to produce a single-page document.
 */
function generateInvoicePDF(invoice: any, user: any): Buffer {
  const date = new Date(invoice.createdAt).toLocaleDateString();
  const amount = typeof invoice.amount === 'number'
    ? `$${(invoice.amount / 100).toFixed(2)}`
    : `$${invoice.amount}`;

  const lines = [
    `Invoice #${invoice.id}`,
    `Date: ${date}`,
    '',
    `Bill To:`,
    `${user.name || 'Customer'}`,
    `${user.email}`,
    '',
    `Description: ${invoice.description || 'Subscription'}`,
    `Amount: ${amount}`,
    `Status: ${invoice.status}`,
    '',
    'Thank you for your business!',
  ];

  // Build text drawing commands (PDF coordinate system: origin at bottom-left)
  const textCommands = lines
    .map((line, i) => {
      const y = 750 - i * 18;
      const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      return `BT /F1 12 Tf 50 ${y} Td (${escaped}) Tj ET`;
    })
    .join('\n');

  const stream = `stream\n${textCommands}\nendstream`;
  const streamLength = Buffer.byteLength(textCommands);

  const objects = [
    // Object 1: Catalog
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    // Object 2: Pages
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    // Object 3: Page
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    // Object 4: Content stream
    `4 0 obj\n<< /Length ${streamLength} >>\n${stream}\nendobj`,
    // Object 5: Font
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
  ];

  let body = '';
  const offsets: number[] = [];
  const header = '%PDF-1.4\n';
  let pos = header.length;

  for (const obj of objects) {
    offsets.push(pos);
    const entry = obj + '\n';
    body += entry;
    pos += Buffer.byteLength(entry);
  }

  const xrefStart = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(header + body + xref + trailer);
}
