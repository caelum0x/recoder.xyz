/**
 * Pricing Tiers API for Recoder.xyz
 * 
 * Returns available pricing plans and tier information
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // In production, this would come from the PricingManager
    // For now, return the pricing structure directly
    
    const pricingTiers = [
      {
        id: 'free',
        name: 'Free',
        price: {
          monthly: 0,
          yearly: 0,
          currency: 'USD'
        },
        limits: {
          monthlyRequests: 100,
          monthlyTokens: 50000,
          costBudget: 0,
          concurrentSessions: 1,
          contextCacheSize: 10, // 10MB
          reasoningSessions: 5,
          agentWorkflows: 2
        },
        features: {
          models: ['ollama/llama3.2', 'ollama/codellama'],
          agents: ['basic-analysis'],
          reasoning: false,
          contextCaching: true,
          costOptimization: false,
          prioritySupport: false,
          customIntegrations: false,
          teamCollaboration: false,
          analytics: false,
          apiAccess: false,
          whiteLabel: false,
          sla: null
        },
        restrictions: {
          modelAccess: 'basic',
          responseTime: 'standard',
          support: 'community'
        },
        metadata: {
          popular: false,
          targetMargin: 1.0, // 100% margin (no costs)
          estimatedCost: 0,
          description: 'Perfect for getting started with local AI models',
          cta: 'Start Free'
        }
      },
      {
        id: 'pro',
        name: 'Pro',
        price: {
          monthly: 20,
          yearly: 200, // 2 months free
          currency: 'USD'
        },
        limits: {
          monthlyRequests: 5000,
          monthlyTokens: 2000000, // 2M tokens
          costBudget: 13.00, // Target $13 cost for 65% margin
          concurrentSessions: 3,
          contextCacheSize: 500, // 500MB
          reasoningSessions: 100,
          agentWorkflows: 50
        },
        features: {
          models: [
            'meta-llama/llama-3.3-70b-instruct',
            'qwen/qwen-3-coder-480b',
            'moonshot/kimi-k2',
            'deepseek/deepseek-r1',
            'anthropic/claude-3.5-sonnet'
          ],
          agents: [
            'code-analysis',
            'research',
            'code-generation',
            'decision-making'
          ],
          reasoning: true,
          contextCaching: true,
          costOptimization: true,
          prioritySupport: true,
          customIntegrations: true,
          teamCollaboration: false,
          analytics: true,
          apiAccess: true,
          whiteLabel: false,
          sla: '99.5% uptime'
        },
        restrictions: {
          modelAccess: 'standard',
          responseTime: 'priority',
          support: 'email'
        },
        metadata: {
          popular: true,
          targetMargin: 0.65, // 65% margin
          estimatedCost: 13.00,
          description: 'Full AI power with all models and advanced features',
          cta: 'Start Pro Trial'
        }
      },
      {
        id: 'pro-plus',
        name: 'Pro+',
        price: {
          monthly: 49,
          yearly: 490,
          currency: 'USD'
        },
        limits: {
          monthlyRequests: 15000,
          monthlyTokens: 6000000, // 6M tokens
          costBudget: 35.00,
          concurrentSessions: 5,
          contextCacheSize: 1500, // 1.5GB
          reasoningSessions: 300,
          agentWorkflows: 150
        },
        features: {
          models: [
            'meta-llama/llama-3.3-70b-instruct',
            'qwen/qwen-3-coder-480b',
            'moonshot/kimi-k2',
            'deepseek/deepseek-r1',
            'anthropic/claude-3.5-sonnet',
            'anthropic/claude-3-opus'
          ],
          agents: [
            'code-analysis',
            'research',
            'code-generation',
            'decision-making',
            'repository-analysis'
          ],
          reasoning: true,
          contextCaching: true,
          costOptimization: true,
          prioritySupport: true,
          customIntegrations: true,
          teamCollaboration: true,
          analytics: true,
          apiAccess: true,
          whiteLabel: false,
          sla: '99.7% uptime'
        },
        restrictions: {
          modelAccess: 'standard',
          responseTime: 'priority',
          support: 'priority'
        },
        metadata: {
          popular: false,
          targetMargin: 0.71, // 71% margin
          estimatedCost: 35.00,
          description: 'Higher limits for power users and small teams',
          cta: 'Upgrade to Pro+'
        }
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: {
          monthly: 199,
          yearly: 1990, // 2 months free
          currency: 'USD'
        },
        limits: {
          monthlyRequests: -1, // Unlimited
          monthlyTokens: -1, // Unlimited
          costBudget: 150.00, // Much higher budget
          concurrentSessions: 10,
          contextCacheSize: 5000, // 5GB
          reasoningSessions: -1, // Unlimited
          agentWorkflows: -1 // Unlimited
        },
        features: {
          models: [
            'meta-llama/llama-3.3-70b-instruct',
            'qwen/qwen-3-coder-480b',
            'moonshot/kimi-k2',
            'deepseek/deepseek-r1',
            'anthropic/claude-3.5-sonnet',
            'anthropic/claude-3-opus',
            'openai/gpt-4',
            'google/gemini-pro'
          ],
          agents: [
            'code-analysis',
            'research',
            'code-generation',
            'decision-making',
            'repository-analysis',
            'multi-agent-coordinator'
          ],
          reasoning: true,
          contextCaching: true,
          costOptimization: true,
          prioritySupport: true,
          customIntegrations: true,
          teamCollaboration: true,
          analytics: true,
          apiAccess: true,
          whiteLabel: true,
          sla: '99.9% uptime'
        },
        restrictions: {
          modelAccess: 'full',
          responseTime: 'enterprise',
          support: 'dedicated'
        },
        metadata: {
          popular: false,
          targetMargin: 0.75, // 75% margin
          estimatedCost: 150.00,
          description: 'Unlimited AI power for teams with enterprise support',
          cta: 'Contact Sales'
        }
      }
    ];

    return NextResponse.json(pricingTiers);

  } catch (error) {
    console.error('Error fetching pricing tiers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, tierId, userId } = body;

    switch (action) {
      case 'subscribe':
        // Handle subscription logic
        return NextResponse.json({
          success: true,
          message: `Subscribed to ${tierId} plan`,
          subscriptionId: `sub_${Date.now()}`,
          redirectUrl: '/dashboard'
        });

      case 'upgrade':
        // Handle plan upgrade
        return NextResponse.json({
          success: true,
          message: `Upgraded to ${tierId} plan`,
          effectiveDate: new Date().toISOString()
        });

      case 'downgrade':
        // Handle plan downgrade
        return NextResponse.json({
          success: true,
          message: `Downgrade to ${tierId} plan scheduled for next billing cycle`,
          effectiveDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error processing pricing action:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}