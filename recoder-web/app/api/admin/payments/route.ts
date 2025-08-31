import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

// Admin endpoint for viewing payments
export async function GET(request: NextRequest) {
  try {
    // Check authentication and admin role
    const session = await auth();
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
    const subscriptionId = searchParams.get('subscription_id') || undefined;

    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('page_size', pageSize.toString());
    queryParams.append('page_number', pageNumber.toString());
    
    if (customerId) queryParams.append('customer_id', customerId);
    if (status) queryParams.append('status', status);
    if (subscriptionId) queryParams.append('subscription_id', subscriptionId);

    // Call Dodo Pay List Payments API
    const response = await fetch(
      `${process.env.DODO_API_BASE_URL}/payments?${queryParams.toString()}`,
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

    return NextResponse.json({
      success: true,
      payments: data.items?.map((payment: any) => ({
        paymentId: payment.payment_id,
        totalAmount: payment.total_amount,
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.payment_method,
        paymentMethodType: payment.payment_method_type,
        subscriptionId: payment.subscription_id,
        createdAt: payment.created_at,
        digitalProductsDelivered: payment.digital_products_delivered,
        customer: payment.customer,
        metadata: payment.metadata,
        brandId: payment.brand_id
      })) || [],
      pagination: {
        pageSize,
        pageNumber,
        hasMore: data.items?.length === pageSize
      }
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}