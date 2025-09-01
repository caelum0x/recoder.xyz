import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';

export async function POST() {
  try {
    const prisma = getPrisma();
    
    console.log('🤖 Creating test router and usage data...');
    
    // Get or create test user
    const testUser = await prisma.user.findFirst({
      where: { email: 'test@example.com' }
    });
    
    if (!testUser) {
      return NextResponse.json({
        error: 'Test user not found. Please run /api/test-api-key-seed first'
      }, { status: 400 });
    }
    
    // Create test router
    const testRouter = await prisma.router.upsert({
      where: { routerId: 'test-router-123' },
      update: { lastUsed: new Date() },
      create: {
        routerId: 'test-router-123',
        userId: testUser.id,
        name: 'Test CLI Router',
        version: '1.0.0',
        status: 'active',
        metadata: {
          source: 'test-seed',
          location: 'local',
          created_for_testing: true
        }
      }
    });
    
    // Generate realistic router usage data
    const usageData = [];
    const now = new Date();
    
    // Create usage data for the last 24 hours
    for (let i = 0; i < 50; i++) {
      const timestamp = new Date(now.getTime() - (i * 30 * 60 * 1000)); // Every 30 minutes
      
      const providers = ['openai', 'anthropic', 'groq', 'google'];
      const models = {
        'openai': ['gpt-4o-mini', 'gpt-4o'],
        'anthropic': ['claude-3-haiku', 'claude-3.5-sonnet'],
        'groq': ['llama-3.1-8b', 'mixtral-8x7b'],
        'google': ['gemini-flash', 'gemini-pro']
      };
      
      const provider = providers[Math.floor(Math.random() * providers.length)];
      const modelOptions = models[provider as keyof typeof models];
      const model = modelOptions[Math.floor(Math.random() * modelOptions.length)];
      
      // Realistic cost calculations
      const tokens = Math.floor(Math.random() * 2000) + 500;
      const costPerToken = {
        'gpt-4o-mini': 0.00001,
        'gpt-4o': 0.0001,
        'claude-3-haiku': 0.00002,
        'claude-3.5-sonnet': 0.0001,
        'llama-3.1-8b': 0.000005,
        'mixtral-8x7b': 0.00001,
        'gemini-flash': 0.000008,
        'gemini-pro': 0.00005
      };
      
      const cost = tokens * (costPerToken[model as keyof typeof costPerToken] || 0.00001);
      const responseTime = Math.floor(Math.random() * 3000) + 500;
      const success = Math.random() > 0.05; // 95% success rate
      
      usageData.push({
        routerId: 'test-router-123',
        timestamp: timestamp,
        provider: provider,
        model: model,
        tokens: tokens,
        cost: cost,
        success: success,
        responseTime: responseTime,
        metadata: {
          source: 'test-seed',
          request_type: 'code_generation'
        }
      });
    }
    
    // Bulk insert usage data
    const createdUsage = await prisma.routerUsage.createMany({
      data: usageData
    });
    
    // Create analytics entry
    const analyticsEntry = await prisma.routerAnalytics.create({
      data: {
        routerId: 'test-router-123',
        analyticsData: {
          total_requests: createdUsage.count,
          total_cost: usageData.reduce((sum, record) => sum + record.cost, 0),
          top_models: ['gpt-4o-mini', 'claude-3-haiku', 'llama-3.1-8b'],
          efficiency_score: 78.4,
          source: 'test-seed'
        },
        timestamp: new Date()
      }
    });
    
    console.log(`✅ Created test router with ${createdUsage.count} usage records`);
    
    return NextResponse.json({
      success: true,
      message: 'Test router and usage data created successfully',
      router: {
        routerId: testRouter.routerId,
        name: testRouter.name,
        status: testRouter.status
      },
      usage_records: createdUsage.count,
      analytics_created: true,
      test_endpoints: [
        `/api/router/${testRouter.routerId}/cost-analytics`,
        `/api/router/${testRouter.routerId}/real-time-insights`
      ]
    });
    
  } catch (error) {
    console.error('❌ Error creating test router data:', error);
    return NextResponse.json(
      { error: 'Failed to create test router data', details: error.message },
      { status: 500 }
    );
  }
}