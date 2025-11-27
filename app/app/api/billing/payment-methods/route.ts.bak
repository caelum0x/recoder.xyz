import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';

// GET /api/billing/payment-methods - List payment methods
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

    const user = await prisma.user.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      methods: paymentMethods.map(method => ({
        id: method.id,
        type: method.type,
        brand: method.brand,
        last4: method.last4,
        expiryMonth: method.expiryMonth,
        expiryYear: method.expiryYear,
        isDefault: method.isDefault,
        holderName: method.holderName,
      })),
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch payment methods' },
      { status: 500 }
    );
  }
}

// POST /api/billing/payment-methods - Add payment method
export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { cardNumber, cardName, expiryMonth, expiryYear, cvv, setAsDefault } = body;

    // Validate card number (basic validation)
    if (!cardNumber || cardNumber.length < 13 || cardNumber.length > 19) {
      return NextResponse.json(
        { success: false, error: 'Invalid card number' },
        { status: 400 }
      );
    }

    // In a real app, you would:
    // 1. Tokenize card with payment provider (Stripe, Paddle, etc.)
    // 2. Store only the token, not the full card number
    // 3. Return payment method ID from provider

    // For demo purposes, we'll store limited card info
    const last4 = cardNumber.slice(-4);
    const brand = detectCardBrand(cardNumber);

    // If setting as default, update other methods
    if (setAsDefault) {
      await prisma.paymentMethod.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }

    const paymentMethod = await prisma.paymentMethod.create({
      data: {
        userId: user.id,
        type: 'card',
        brand,
        last4,
        expiryMonth,
        expiryYear,
        holderName: cardName,
        isDefault: setAsDefault || false,
        // In production, store encrypted token from payment provider
        providerToken: `tok_${Math.random().toString(36).substring(7)}`,
      },
    });

    return NextResponse.json({
      success: true,
      method: {
        id: paymentMethod.id,
        type: paymentMethod.type,
        brand: paymentMethod.brand,
        last4: paymentMethod.last4,
        expiryMonth: paymentMethod.expiryMonth,
        expiryYear: paymentMethod.expiryYear,
        isDefault: paymentMethod.isDefault,
        holderName: paymentMethod.holderName,
      },
    });
  } catch (error) {
    console.error('Error adding payment method:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add payment method' },
      { status: 500 }
    );
  }
}

// PUT /api/billing/payment-methods - Update payment method
export async function PUT(req: NextRequest) {
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

    const body = await req.json();
    const { methodId, setAsDefault } = body;

    if (setAsDefault) {
      // Unset all other defaults
      await prisma.paymentMethod.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });

      // Set this one as default
      await prisma.paymentMethod.update({
        where: { id: methodId, userId: user.id },
        data: { isDefault: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating payment method:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update payment method' },
      { status: 500 }
    );
  }
}

// DELETE /api/billing/payment-methods - Delete payment method
export async function DELETE(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const methodId = searchParams.get('methodId');

    if (!methodId) {
      return NextResponse.json(
        { success: false, error: 'Method ID required' },
        { status: 400 }
      );
    }

    const method = await prisma.paymentMethod.findFirst({
      where: { id: methodId, userId: user.id },
    });

    if (!method) {
      return NextResponse.json(
        { success: false, error: 'Payment method not found' },
        { status: 404 }
      );
    }

    if (method.isDefault) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete default payment method. Set another as default first.' },
        { status: 400 }
      );
    }

    await prisma.paymentMethod.delete({
      where: { id: methodId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete payment method' },
      { status: 500 }
    );
  }
}

// Helper function to detect card brand
function detectCardBrand(cardNumber: string): string {
  const patterns = {
    visa: /^4/,
    mastercard: /^5[1-5]/,
    amex: /^3[47]/,
    discover: /^6(?:011|5)/,
  };

  for (const [brand, pattern] of Object.entries(patterns)) {
    if (pattern.test(cardNumber)) {
      return brand.charAt(0).toUpperCase() + brand.slice(1);
    }
  }

  return 'Card';
}
