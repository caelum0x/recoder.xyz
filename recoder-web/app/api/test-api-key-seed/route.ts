import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import bcrypt from 'bcrypt';

export async function POST() {
  try {
    const prisma = getPrisma();
    
    console.log('🔑 Creating test API keys...');
    
    // Create a test user first
    const testUser = await prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {},
      create: {
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser'
      }
    });
    
    // Generate test API keys
    const apiKeys = [
      {
        keyId: 'rck_test_key_123456789',
        name: 'Test API Key 1',
        hashedKey: await bcrypt.hash('rck_test_key_123456789', 10),
        scopes: ['api:read', 'api:write'],
        restrictions: { 
          rateLimit: 100,
          ipWhitelist: [],
          source: 'test-seed'
        }
      },
      {
        keyId: 'rck_demo_key_987654321',
        name: 'Demo API Key',
        hashedKey: await bcrypt.hash('rck_demo_key_987654321', 10),
        scopes: ['api:read'],
        restrictions: { 
          rateLimit: 50,
          ipWhitelist: [],
          source: 'test-seed'
        }
      }
    ];
    
    const createdKeys = await Promise.all(
      apiKeys.map(keyData => 
        prisma.apiKey.upsert({
          where: { keyId: keyData.keyId },
          update: { lastUsed: new Date() },
          create: {
            ...keyData,
            userId: testUser.id,
            active: true
          }
        })
      )
    );
    
    console.log(`✅ Created ${createdKeys.length} test API keys`);
    
    return NextResponse.json({
      success: true,
      message: 'Test API keys created successfully',
      keys: apiKeys.map(key => ({
        keyId: key.keyId,
        name: key.name,
        scopes: key.scopes
      })),
      testInstructions: {
        usage: 'Add header: x-api-key: rck_test_key_123456789',
        endpoints: [
          '/api/test-rate-limit',
          '/api/auth/cli (POST with action: validate_token)'
        ]
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating test API keys:', error);
    return NextResponse.json(
      { error: 'Failed to create test API keys', details: error.message },
      { status: 500 }
    );
  }
}