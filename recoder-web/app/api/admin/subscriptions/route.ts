import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Admin endpoint for viewing all subscriptions
export async function GET(request: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // TODO: Check if user has admin role
    // const isAdmin = await checkAdminRole(session.user.email);
    // if (!isAdmin) {
    //   return NextResponse.json(
    //     { error: 'Admin access required' },
    //     { status: 403 }
    //   );
    // }

    const { searchParams } = new URL(request.url);
    const pageSize = Math.min(parseInt(searchParams.get('page_size') || '10'), 100);
    const pageNumber = parseInt(searchParams.get('page_number') || '0');
    const customerId = searchParams.get('customer_id') || undefined;
    const status = searchParams.get('status') || undefined;
    const createdAtGte = searchParams.get('created_at_gte') || undefined;
    const createdAtLte = searchParams.get('created_at_lte') || undefined;

    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('page_size', pageSize.toString());
    queryParams.append('page_number', pageNumber.toString());
    
    if (customerId) queryParams.append('customer_id', customerId);
    if (status) queryParams.append('status', status);
    if (createdAtGte) queryParams.append('created_at_gte', createdAtGte);
    if (createdAtLte) queryParams.append('created_at_lte', createdAtLte);

    // Call Dodo Pay List Subscriptions API
    const response = await fetch(
      `${process.env.DODO_API_BASE_URL}/subscriptions?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(`Dodo Pay API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    // Calculate subscription analytics
    const analytics = calculateSubscriptionAnalytics(data.items || []);

    return NextResponse.json({
      success: true,
      subscriptions: data.items?.map((sub: any) => ({
        subscriptionId: sub.subscription_id,
        productId: sub.product_id,
        status: sub.status,
        recurringAmount: sub.recurring_pre_tax_amount,
        currency: sub.currency,
        quantity: sub.quantity,
        trialPeriodDays: sub.trial_period_days,
        nextBillingDate: sub.next_billing_date,
        previousBillingDate: sub.previous_billing_date,
        createdAt: sub.created_at,
        cancelledAt: sub.cancelled_at,
        cancelAtNextBilling: sub.cancel_at_next_billing_date,
        customer: sub.customer,
        billing: sub.billing,
        metadata: sub.metadata,
        onDemand: sub.on_demand,
        subscriptionPeriod: {
          interval: sub.subscription_period_interval,
          count: sub.subscription_period_count
        },
        paymentFrequency: {
          interval: sub.payment_frequency_interval,
          count: sub.payment_frequency_count
        }
      })) || [],
      analytics,
      pagination: {
        pageSize,
        pageNumber,
        hasMore: data.items?.length === pageSize
      }
    });

  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    );
  }
}

function calculateSubscriptionAnalytics(subscriptions: any[]) {
  const total = subscriptions.length;
  const active = subscriptions.filter(sub => sub.status === 'active').length;
  const onHold = subscriptions.filter(sub => sub.status === 'on_hold').length;
  const cancelled = subscriptions.filter(sub => sub.status === 'cancelled').length;
  const failed = subscriptions.filter(sub => sub.status === 'failed').length;
  const pending = subscriptions.filter(sub => sub.status === 'pending').length;

  // Calculate MRR (Monthly Recurring Revenue)
  const mrr = subscriptions
    .filter(sub => sub.status === 'active')
    .reduce((sum, sub) => {
      let monthlyAmount = sub.recurring_pre_tax_amount;
      
      // Convert to monthly if needed
      if (sub.payment_frequency_interval === 'Year') {
        monthlyAmount = monthlyAmount / 12;
      } else if (sub.payment_frequency_interval === 'Week') {
        monthlyAmount = monthlyAmount * 4.33; // Average weeks per month
      } else if (sub.payment_frequency_interval === 'Day') {
        monthlyAmount = monthlyAmount * 30; // Average days per month
      }
      
      return sum + (monthlyAmount * sub.quantity);
    }, 0);

  // Calculate ARR (Annual Recurring Revenue)
  const arr = mrr * 12;

  // Calculate churn rate (simplified - cancelled subscriptions this period)
  const churnRate = total > 0 ? (cancelled / total) * 100 : 0;

  return {
    total,
    active,
    onHold,
    cancelled,
    failed,
    pending,
    mrr: Math.round(mrr) / 100, // Convert cents to dollars
    arr: Math.round(arr) / 100,
    churnRate: Math.round(churnRate * 100) / 100,
    conversion: {
      activeRate: total > 0 ? Math.round((active / total) * 100 * 100) / 100 : 0,
      failureRate: total > 0 ? Math.round((failed / total) * 100 * 100) / 100 : 0
    }
  };
}