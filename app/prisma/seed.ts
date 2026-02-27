/**
 * Prisma Seed Script
 * Seeds the database with initial data for development
 * FIXED VERSION - Updated to use correct Prisma models
 */

import { PrismaClient } from '../lib/prisma-client';
import { hashPassword } from '../lib/crypto';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data (development only!)
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Cleaning existing data...');
    await prisma.usage_records.deleteMany();
    await prisma.rag_sessions.deleteMany();
    await prisma.user_quota.deleteMany();
    await prisma.api_keys.deleteMany();
    await prisma.cli_sessions.deleteMany();
    await prisma.deviceCode.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user_preferences.deleteMany();
    await prisma.audit_logs.deleteMany();
    await prisma.invoices.deleteMany();
    await prisma.payment_methods.deleteMany();
    await prisma.subscriptions.deleteMany();
    await prisma.sessions.deleteMany();
    await prisma.integrations.deleteMany();
    await prisma.webhooks.deleteMany();
    // Note: Team models don't exist in schema yet
    // await prisma.team_members.deleteMany();
    // await prisma.invitations.deleteMany();
    // await prisma.teams.deleteMany();
    await prisma.platform_api_keys.deleteMany();
    await prisma.users.deleteMany();
    console.log('✅ Cleaned existing data');
  }

  // Create test users
  console.log('👤 Creating test users...');

  const freeUser = await prisma.users.create({
    data: {
      id: crypto.randomUUID(),
      email: 'free@recoder.xyz',
      name: 'Free User',
      password: await hashPassword('password123'),
      emailVerified: true,
      subscriptionPlan: 'free',
      subscriptionStatus: 'active',
      onboardingStep: 'completed',
      updatedAt: new Date(),
    },
  });

  const proUser = await prisma.users.create({
    data: {
      id: crypto.randomUUID(),
      email: 'pro@recoder.xyz',
      name: 'Pro User',
      password: await hashPassword('password123'),
      emailVerified: true,
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      onboardingStep: 'completed',
      image: 'https://i.pravatar.cc/150?img=1',
      organization: 'Tech Corp',
      updatedAt: new Date(),
    },
  });

  const enterpriseUser = await prisma.users.create({
    data: {
      id: crypto.randomUUID(),
      email: 'enterprise@recoder.xyz',
      name: 'Enterprise User',
      password: await hashPassword('password123'),
      emailVerified: true,
      subscriptionPlan: 'enterprise',
      subscriptionStatus: 'active',
      onboardingStep: 'completed',
      image: 'https://i.pravatar.cc/150?img=2',
      organization: 'Enterprise Inc',
      updatedAt: new Date(),
    },
  });

  console.log('✅ Created 3 test users');

  // Create user quotas
  console.log('📊 Creating user quotas...');

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  await prisma.user_quota.create({
    data: {
      id: crypto.randomUUID(),
      userId: freeUser.id,
      sessionsPerDay: 6,
      sessionsUsedToday: 2,
      tokensPerSession: 10000,
      periodStart: now,
      periodEnd: endOfDay,
      updatedAt: new Date(),
    },
  });

  await prisma.user_quota.create({
    data: {
      id: crypto.randomUUID(),
      userId: proUser.id,
      sessionsPerDay: 20,
      sessionsUsedToday: 5,
      tokensPerSession: 100000,
      periodStart: now,
      periodEnd: endOfDay,
      updatedAt: new Date(),
    },
  });

  await prisma.user_quota.create({
    data: {
      id: crypto.randomUUID(),
      userId: enterpriseUser.id,
      sessionsPerDay: 100,
      sessionsUsedToday: 15,
      tokensPerSession: 500000,
      periodStart: now,
      periodEnd: endOfDay,
      updatedAt: new Date(),
    },
  });

  console.log('✅ Created quotas for all users');

  // Create user preferences
  console.log('⚙️  Creating user preferences...');

  await prisma.user_preferences.create({
    data: {
      id: crypto.randomUUID(),
      userId: freeUser.id,
      themePreferences: { theme: 'system' },
      notificationPreferences: { emailNotifications: true, usageAlerts: true },
      updatedAt: new Date(),
    },
  });

  await prisma.user_preferences.create({
    data: {
      id: crypto.randomUUID(),
      userId: proUser.id,
      themePreferences: { theme: 'dark' },
      notificationPreferences: { 
        emailNotifications: true, 
        usageAlerts: true,
        usageAlertThreshold: 90,
        weeklyDigest: true
      },
      updatedAt: new Date(),
    },
  });

  await prisma.user_preferences.create({
    data: {
      id: crypto.randomUUID(),
      userId: enterpriseUser.id,
      themePreferences: { theme: 'light' },
      notificationPreferences: { 
        emailNotifications: true, 
        usageAlerts: true,
        billingNotifications: true,
        securityNotifications: true,
        monthlyReport: true
      },
      updatedAt: new Date(),
    },
  });

  console.log('✅ Created preferences for all users');

  // Create subscriptions
  console.log('💳 Creating subscriptions...');

  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

  await prisma.subscriptions.create({
    data: {
      id: crypto.randomUUID(),
      userId: proUser.id,
      planId: 'pro',
      status: 'active',
      // providerId: 'sub_paddle_12345', // Field doesn't exist in schema
      currentPeriodStart,
      currentPeriodEnd,
      // amount: 10000, // Field doesn't exist in schema
      // currency: 'USD', // Field doesn't exist in schema
      updatedAt: new Date(),
    },
  });

  await prisma.subscriptions.create({
    data: {
      id: crypto.randomUUID(),
      userId: enterpriseUser.id,
      planId: 'enterprise',
      status: 'active',
      // providerId: 'sub_paddle_67890', // Field doesn't exist in schema
      currentPeriodStart,
      currentPeriodEnd,
      // amount: 50000, // Field doesn't exist in schema
      // currency: 'USD', // Field doesn't exist in schema
      updatedAt: new Date(),
    },
  });

  console.log('✅ Created subscriptions');

  // Create sample invoices
  console.log('🧾 Creating sample invoices...');

  await prisma.invoices.create({
    data: {
      id: crypto.randomUUID(),
      userId: proUser.id,
      status: 'paid',
      amount: 10000,
      currency: 'USD',
      description: 'Monthly Pro Subscription',
      paidAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.invoices.create({
    data: {
      id: crypto.randomUUID(),
      userId: enterpriseUser.id,
      status: 'paid',
      amount: 50000,
      currency: 'USD',
      description: 'Annual Enterprise Subscription',
      paidAt: new Date(),
      updatedAt: new Date(),
    },
  });

  console.log('✅ Created sample invoices');

  // Create sample usage records
  console.log('📈 Creating sample usage records...');

  const users = [freeUser, proUser, enterpriseUser];
  for (const user of users) {
    for (let i = 0; i < 5; i++) {
      await prisma.usage_records.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          type: 'cli',
          requestType: 'cli',
          model: 'claude-3-5-sonnet',
          provider: 'anthropic',
          tokensUsed: Math.floor(Math.random() * 5000) + 1000,
          inputTokens: Math.floor(Math.random() * 2000) + 500,
          outputTokens: Math.floor(Math.random() * 3000) + 500,
          cost: Math.random() * 0.5,
          duration: Math.floor(Math.random() * 3000) + 500,
          platform: 'cli',
          timestamp: new Date(Date.now() - i * 3600000), // Each hour back
        },
      });
    }
  }

  console.log('✅ Created sample usage records');

  // Create platform API keys (for the platform, not user keys)
  console.log('🔑 Creating platform API keys...');

  await prisma.platform_api_keys.create({
    data: {
      id: crypto.randomUUID(),
      userId: proUser.id,
      provider: 'openrouter',
      encryptedKey: 'encrypted_key_1_for_dev',
      keyName: 'OpenRouter Primary',
      quotaUsed: 150000,
      isActive: true,
      updatedAt: new Date(),
    },
  });

  await prisma.platform_api_keys.create({
    data: {
      id: crypto.randomUUID(),
      userId: proUser.id,
      provider: 'openrouter',
      encryptedKey: 'encrypted_key_2_for_dev',
      keyName: 'OpenRouter Secondary',
      quotaUsed: 50000,
      isActive: true,
      updatedAt: new Date(),
    },
  });

  await prisma.platform_api_keys.create({
    data: {
      id: crypto.randomUUID(),
      userId: enterpriseUser.id,
      provider: 'anthropic',
      encryptedKey: 'encrypted_key_3_for_dev',
      keyName: 'Claude Direct',
      quotaUsed: 25000,
      isActive: true,
      updatedAt: new Date(),
    },
  });

  console.log('✅ Created platform API keys');

  // Create a test team
  console.log('👥 Creating test team...');
  console.log('Note: Team models not implemented in schema yet - skipping team creation');

  // TODO: Uncomment when team models are added to schema
  /*
  const team = await prisma.teams.create({
    data: {
      id: crypto.randomUUID(),
      name: 'Dev Team',
      slug: 'dev-team',
      ownerId: enterpriseUser.id,
      plan: 'enterprise',
      description: 'Enterprise development team',
      updatedAt: new Date(),
    },
  });

  await prisma.team_members.create({
    data: {
      id: crypto.randomUUID(),
      teamId: team.id,
      userId: enterpriseUser.id,
      role: 'owner',
      updatedAt: new Date(),
    },
  });

  await prisma.team_members.create({
    data: {
      id: crypto.randomUUID(),
      teamId: team.id,
      userId: proUser.id,
      role: 'admin',
      updatedAt: new Date(),
    },
  });
  */

  console.log('✅ Team creation skipped (models not in schema)');

  // Create audit logs
  console.log('📝 Creating audit logs...');

  await prisma.audit_logs.create({
    data: {
      id: crypto.randomUUID(),
      userId: proUser.id,
      action: 'login',
      resource: 'auth',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0...',
      metadata: {},
    },
  });

  await prisma.audit_logs.create({
    data: {
      id: crypto.randomUUID(),
      userId: enterpriseUser.id,
      action: 'create_api_key',
      resource: 'api_key',
      ipAddress: '192.168.1.2',
      metadata: {},
    },
  });

  console.log('✅ Created audit logs');

  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('Test Users: free@recoder.xyz, pro@recoder.xyz, enterprise@recoder.xyz');
  console.log('Passwords are set via hashPassword() — see seed script source for details.');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
