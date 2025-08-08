import { NextResponse } from 'next/server';
import { DodoPayService } from '@/lib/dodo-pay';

export async function GET() {
  try {
    const plans = DodoPayService.PLANS.map(plan => ({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      features: plan.features,
      popular: plan.id === 'premium', // Mark PREMIUM as popular
      recommended: plan.id === 'premium'
    }));

    return NextResponse.json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plans' },
      { status: 500 }
    );
  }
}