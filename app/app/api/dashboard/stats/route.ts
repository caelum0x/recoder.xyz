import { NextRequest, NextResponse } from 'next/server';

const PRODUCTION_ENGINE_URL = process.env.PRODUCTION_ENGINE_URL || 'http://localhost:4567';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'anonymous';
    
    // Fetch multiple data points in parallel
    const [
      subscriptionResponse,
      projectsResponse,
      analyticsResponse
    ] = await Promise.all([
      fetch(`${PRODUCTION_ENGINE_URL}/api/billing/subscription/${userId}`, {
        headers: {
          'x-user-id': userId,
          'x-admin-key': process.env.ADMIN_KEY || 'admin-key',
        }
      }),
      fetch(`${PRODUCTION_ENGINE_URL}/api/dev/projects`, {
        headers: {
          'x-user-id': userId,
        }
      }),
      fetch(`${PRODUCTION_ENGINE_URL}/api/dashboard/analytics`, {
        headers: {
          'x-user-id': userId,
        }
      })
    ]);

    // Parse responses
    const subscriptionData = subscriptionResponse.ok ? await subscriptionResponse.json() : { data: null };
    const projectsData = projectsResponse.ok ? await projectsResponse.json() : { data: { projects: [], total: 0 } };
    const analyticsData = analyticsResponse.ok ? await analyticsResponse.json() : { data: null };

    // Construct comprehensive dashboard stats
    const dashboardStats = {
      subscription: subscriptionData.data || {
        tier: 'Free',
        status: 'active',
        usage: {
          codeGenerated: 0,
          apiCalls: 0,
          deploymentsCount: 0
        },
        limits: {
          codeGeneration: 5000,
          apiCalls: 100,
          deployments: 2
        }
      },
      billing: {
        currentCost: subscriptionData.data?.tier === 'Professional' ? 29.00 : 
                    subscriptionData.data?.tier === 'Business' ? 99.00 : 
                    subscriptionData.data?.tier === 'Enterprise' ? 499.00 : 0,
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        paymentMethod: 'Credit Card ending in 4242'
      },
      projects: {
        total: projectsData.data?.projects?.length || 0,
        active: projectsData.data?.projects?.filter((p: any) => p.status === 'active')?.length || 0,
        shared: projectsData.data?.projects?.filter((p: any) => p.visibility === 'public')?.length || 0
      },
      analytics: analyticsData.data || {
        thisMonth: {
          projects: 0,
          deployments: 0,
          savings: 0
        }
      }
    };

    return NextResponse.json({ 
      success: true, 
      data: dashboardStats 
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    
    // Return mock data as fallback
    const mockStats = {
      subscription: {
        tier: 'Free',
        status: 'active',
        usage: {
          codeGenerated: 1250,
          apiCalls: 45,
          deploymentsCount: 1
        },
        limits: {
          codeGeneration: 5000,
          apiCalls: 100,
          deployments: 2
        }
      },
      billing: {
        currentCost: 0,
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        paymentMethod: 'No payment method'
      },
      projects: {
        total: 3,
        active: 2,
        shared: 1
      },
      analytics: {
        thisMonth: {
          projects: 3,
          deployments: 1,
          savings: 25
        }
      }
    };

    return NextResponse.json({ 
      success: true, 
      data: mockStats,
      fallback: true 
    });
  }
}