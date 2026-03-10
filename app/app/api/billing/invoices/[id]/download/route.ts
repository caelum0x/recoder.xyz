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

    // When billing provider API keys are configured (Paddle, Stripe, Dodo),
    // prefer fetching the canonical PDF from the provider instead of generating
    // locally. The provider PDF includes tax details, legal compliance, etc.
    // Example: await paddleClient.getInvoicePdf(invoice.providerInvoiceId)
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

/** Escape special characters for PDF text strings. */
function pdfEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/** Format a currency amount (stored in cents) for display. */
function formatAmount(amount: number | string, currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5',
  };
  const sym = symbols[currency?.toUpperCase()] || `${currency} `;
  const num = typeof amount === 'number' ? amount / 100 : parseFloat(String(amount));
  return `${sym}${num.toFixed(2)}`;
}

/** Format a Date for invoice display. */
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Generate a professional invoice PDF using raw PDF 1.4 spec.
 * No external dependencies required. Produces a single-page US Letter document
 * with company header, customer details, itemized line items, totals, and status.
 *
 * When billing provider keys are configured, prefer fetching the provider-hosted
 * PDF instead (it will include tax jurisdiction details, legal compliance, etc.).
 */
function generateInvoicePDF(invoice: any, user: any): Buffer {
  const currency = invoice.currency || 'USD';
  const invoiceDate = formatDate(invoice.createdAt);
  const paidDate = formatDate(invoice.paidAt);
  const status = (invoice.status || 'unknown').toUpperCase();
  const customerName = user.name || 'Customer';
  const customerEmail = user.email || '';
  const customerOrg = user.organization || '';
  const invoiceNumber = invoice.id || 'N/A';
  const totalAmount = formatAmount(invoice.amount, currency);

  // Parse line items from JSON (array of {name, amount, quantity?})
  let lineItems: Array<{ name: string; amount: number; quantity?: number }> = [];
  try {
    const parsed = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : invoice.items;
    if (Array.isArray(parsed) && parsed.length > 0) {
      lineItems = parsed;
    }
  } catch {
    // Fallback handled below
  }

  // If no items stored, synthesize one from description + amount
  if (lineItems.length === 0) {
    lineItems = [{
      name: invoice.description || 'Recoder Subscription',
      amount: typeof invoice.amount === 'number' ? invoice.amount : parseFloat(String(invoice.amount)) || 0,
      quantity: 1,
    }];
  }

  // ── Build PDF content stream drawing commands ──
  // US Letter: 612 x 792 points. Origin at bottom-left.
  const cmds: string[] = [];
  let y = 742; // current Y cursor (starts near top)

  const leftMargin = 50;
  const rightEdge = 562;

  // Helper: draw a line of text
  const text = (x: number, yPos: number, font: string, size: number, content: string) => {
    cmds.push(`BT /${font} ${size} Tf ${x} ${yPos} Td (${pdfEscape(content)}) Tj ET`);
  };

  // Helper: draw a horizontal rule
  const hline = (yPos: number, width?: number) => {
    cmds.push(`0.85 0.85 0.85 RG`); // light gray
    cmds.push(`${leftMargin} ${yPos} m ${width || rightEdge} ${yPos} l S`);
    cmds.push(`0 0 0 RG`); // reset to black
  };

  // Helper: draw a filled rectangle
  const fillRect = (x: number, yPos: number, w: number, h: number, r: number, g: number, b: number) => {
    cmds.push(`${r} ${g} ${b} rg`);
    cmds.push(`${x} ${yPos} ${w} ${h} re f`);
    cmds.push(`0 0 0 rg`); // reset fill to black
  };

  // ── Header background bar ──
  fillRect(0, 760, 612, 32, 0.11, 0.11, 0.14); // dark charcoal banner

  // ── Company name (white on dark bar) ──
  cmds.push(`1 1 1 rg`); // white text
  text(leftMargin, 769, 'F2', 18, 'RECODER');
  cmds.push(`0 0 0 rg`); // reset to black

  // "INVOICE" label, right-aligned on the bar
  cmds.push(`1 1 1 rg`);
  text(480, 769, 'F2', 18, 'INVOICE');
  cmds.push(`0 0 0 rg`);

  y = 740;

  // ── Company info (left) ──
  cmds.push(`0.4 0.4 0.4 rg`); // gray text
  text(leftMargin, y, 'F1', 9, 'Recoder Technologies');
  text(leftMargin, y - 13, 'F1', 9, 'https://recoder.xyz');
  text(leftMargin, y - 26, 'F1', 9, 'billing@recoder.xyz');
  cmds.push(`0 0 0 rg`);

  // ── Invoice metadata (right column) ──
  const metaX = 380;
  const metaLabelX = metaX;
  const metaValueX = 480;

  cmds.push(`0.4 0.4 0.4 rg`);
  text(metaLabelX, y, 'F1', 9, 'Invoice No:');
  cmds.push(`0 0 0 rg`);
  text(metaValueX, y, 'F2', 9, invoiceNumber.length > 16 ? `${invoiceNumber.slice(0, 16)}...` : invoiceNumber);

  cmds.push(`0.4 0.4 0.4 rg`);
  text(metaLabelX, y - 13, 'F1', 9, 'Issue Date:');
  cmds.push(`0 0 0 rg`);
  text(metaValueX, y - 13, 'F1', 9, invoiceDate);

  cmds.push(`0.4 0.4 0.4 rg`);
  text(metaLabelX, y - 26, 'F1', 9, 'Status:');
  cmds.push(`0 0 0 rg`);

  // Status with color coding
  if (status === 'PAID') {
    cmds.push(`0.13 0.55 0.13 rg`); // green
  } else if (status === 'OVERDUE' || status === 'VOIDED') {
    cmds.push(`0.8 0.15 0.15 rg`); // red
  } else {
    cmds.push(`0.7 0.5 0.0 rg`); // amber
  }
  text(metaValueX, y - 26, 'F2', 9, status);
  cmds.push(`0 0 0 rg`);

  if (invoice.paidAt) {
    cmds.push(`0.4 0.4 0.4 rg`);
    text(metaLabelX, y - 39, 'F1', 9, 'Paid Date:');
    cmds.push(`0 0 0 rg`);
    text(metaValueX, y - 39, 'F1', 9, paidDate);
  }

  y -= 70;

  // ── Divider ──
  hline(y);
  y -= 20;

  // ── Bill To section ──
  cmds.push(`0.4 0.4 0.4 rg`);
  text(leftMargin, y, 'F2', 10, 'BILL TO');
  cmds.push(`0 0 0 rg`);
  y -= 16;
  text(leftMargin, y, 'F2', 11, customerName);
  y -= 14;
  text(leftMargin, y, 'F1', 10, customerEmail);
  if (customerOrg) {
    y -= 14;
    text(leftMargin, y, 'F1', 10, customerOrg);
  }

  y -= 30;

  // ── Line items table ──
  // Table header background
  fillRect(leftMargin, y - 4, rightEdge - leftMargin, 18, 0.95, 0.95, 0.95);

  // Table header labels
  cmds.push(`0.3 0.3 0.3 rg`);
  text(leftMargin + 8, y, 'F2', 9, 'DESCRIPTION');
  text(310, y, 'F2', 9, 'QTY');
  text(380, y, 'F2', 9, 'UNIT PRICE');
  text(480, y, 'F2', 9, 'AMOUNT');
  cmds.push(`0 0 0 rg`);

  y -= 22;

  // Table rows
  for (const item of lineItems) {
    const qty = item.quantity || 1;
    const itemTotal = item.amount;
    const unitPrice = itemTotal / qty;
    const itemName = String(item.name || 'Item');
    // Truncate long names
    const displayName = itemName.length > 45 ? `${itemName.slice(0, 45)}...` : itemName;

    text(leftMargin + 8, y, 'F1', 10, displayName);
    text(318, y, 'F1', 10, String(qty));
    text(380, y, 'F1', 10, formatAmount(unitPrice, currency));
    text(480, y, 'F1', 10, formatAmount(itemTotal, currency));

    y -= 18;

    // Row separator
    hline(y + 5);
    y -= 4;
  }

  y -= 10;

  // ── Totals section ──
  // Subtotal
  cmds.push(`0.4 0.4 0.4 rg`);
  text(380, y, 'F1', 10, 'Subtotal:');
  cmds.push(`0 0 0 rg`);
  text(480, y, 'F1', 10, totalAmount);
  y -= 16;

  // Total (bold, larger)
  fillRect(370, y - 5, rightEdge - 370, 20, 0.95, 0.95, 0.95);
  text(380, y, 'F2', 11, 'Total:');
  text(480, y, 'F2', 11, totalAmount);

  y -= 40;

  // ── Payment status banner ──
  if (status === 'PAID') {
    fillRect(leftMargin, y - 4, 200, 22, 0.93, 0.98, 0.93); // light green bg
    cmds.push(`0.13 0.55 0.13 rg`);
    text(leftMargin + 10, y, 'F2', 11, `PAID on ${paidDate}`);
    cmds.push(`0 0 0 rg`);
    y -= 30;
  } else if (status === 'VOIDED') {
    fillRect(leftMargin, y - 4, 200, 22, 0.98, 0.93, 0.93); // light red bg
    cmds.push(`0.8 0.15 0.15 rg`);
    text(leftMargin + 10, y, 'F2', 11, 'VOIDED');
    cmds.push(`0 0 0 rg`);
    y -= 30;
  }

  // ── Footer ──
  const footerY = 50;
  hline(footerY + 15);
  cmds.push(`0.55 0.55 0.55 rg`);
  text(leftMargin, footerY, 'F1', 8, 'Thank you for your business. Questions? Contact billing@recoder.xyz');
  text(leftMargin, footerY - 12, 'F1', 8, `Invoice generated on ${formatDate(new Date())} | recoder.xyz`);
  cmds.push(`0 0 0 rg`);

  // ── Assemble PDF structure ──
  const contentStream = cmds.join('\n');
  const streamLength = Buffer.byteLength(contentStream);

  const objects = [
    // 1: Catalog
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    // 2: Pages
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    // 3: Page (US Letter, two fonts)
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj',
    // 4: Content stream
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream\nendobj`,
    // 5: Font - Helvetica (regular)
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj',
    // 6: Font - Helvetica-Bold
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj',
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
