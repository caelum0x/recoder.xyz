/**
 * Prisma Seed Script
 * Seeds the database with initial data for development
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data (development only!)
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Cleaning existing data...');
    await prisma.usageRecord.deleteMany();
    await prisma.workSession.deleteMany();
    await prisma.userQuota.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.cLISession.deleteMany();
    await prisma.deviceCode.deleteMany();
    await prisma.authCode.deleteMany();
    await prisma.emailVerification.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.userPreferences.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.paymentMethod.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.session.deleteMany();
    await prisma.integration.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.teamMember.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.team.deleteMany();
    await prisma.platformApiKey.deleteMany();
    await prisma.user.deleteMany();
    console.log('✅ Cleaned existing data');
  }

  // Create test users
  console.log('👤 Creating test users...');

  const freeUser = await prisma.user.create({
    data: {
      email: 'free@recoder.xyz',
      name: 'Free User',
      passwordHash: await hashPassword('password123'),
      emailVerified: true,
      subscriptionPlan: 'free',
      subscriptionStatus: 'active',
      onboardingStep: 'completed',
    },
  });

  const proUser = await prisma.user.create({
    data: {
      email: 'pro@recoder.xyz',
      name: 'Pro User',
      passwordHash: await hashPassword('password123'),
      emailVerified: true,
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      onboardingStep: 'completed',
      avatar: 'https://i.pravatar.cc/150?img=1',
      bio: 'Professional developer using Recoder',
      company: 'Tech Corp',
    },
  });

  const enterpriseUser = await prisma.user.create({
    data: {
      email: 'enterprise@recoder.xyz',
      name: 'Enterprise User',
      passwordHash: await hashPassword('password123'),
      emailVerified: true,
      subscriptionPlan: 'enterprise',
      subscriptionStatus: 'active',
      onboardingStep: 'completed',
      avatar: 'https://i.pravatar.cc/150?img=2',
      bio: 'Enterprise developer',
      company: 'Enterprise Inc',
    },
  });

  console.log('✅ Created 3 test users');

  // Create user quotas
  console.log('📊 Creating user quotas...');

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  await prisma.userQuota.create({
    data: {
      userId: freeUser.id,
      sessionsPerDay: 6,
      sessionsUsedToday: 2,
      tokensPerSession: 10000,
      periodStart: now,
      periodEnd: endOfDay,
    },
  });

  await prisma.userQuota.create({
    data: {
      userId: proUser.id,
      sessionsPerDay: 20,
      sessionsUsedToday: 5,
      tokensPerSession: 100000,
      monthlyLimit: 10000,
      monthlyUsed: 1500,
      periodStart: now,
      periodEnd: endOfDay,
    },
  });

  await prisma.userQuota.create({
    data: {
      userId: enterpriseUser.id,
      sessionsPerDay: 100,
      sessionsUsedToday: 15,
      tokensPerSession: 500000,
      monthlyLimit: 100000,
      monthlyUsed: 25000,
      periodStart: now,
      periodEnd: endOfDay,
    },
  });

  console.log('✅ Created quotas for all users');

  // Create user preferences
  console.log('⚙️  Creating user preferences...');

  await prisma.userPreferences.create({
    data: {
      userId: freeUser.id,
      theme: 'system',
      emailNotifications: true,
      usageAlerts: true,
    },
  });

  await prisma.userPreferences.create({
    data: {
      userId: proUser.id,
      theme: 'dark',
      emailNotifications: true,
      usageAlerts: true,
      usageAlertThreshold: 90,
      weeklyDigest: true,
    },
  });

  await prisma.userPreferences.create({
    data: {
      userId: enterpriseUser.id,
      theme: 'light',
      emailNotifications: true,
      usageAlerts: true,
      billingNotifications: true,
      securityNotifications: true,
      monthlyReport: true,
    },
  });

  console.log('✅ Created preferences for all users');

  // Create subscriptions
  console.log('💳 Creating subscriptions...');

  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

  await prisma.subscription.create({
    data: {
      userId: proUser.id,
      plan: 'pro',
      status: 'active',
      provider: 'paddle',
      providerId: 'sub_paddle_12345',
      currentPeriodStart,
      currentPeriodEnd,
      amount: 10000, // $100
      currency: 'USD',
      interval: 'month',
    },
  });

  await prisma.subscription.create({
    data: {
      userId: enterpriseUser.id,
      plan: 'enterprise',
      status: 'active',
      provider: 'paddle',
      providerId: 'sub_paddle_67890',
      currentPeriodStart,
      currentPeriodEnd,
      amount: 50000, // $500
      currency: 'USD',
      interval: 'month',
    },
  });

  console.log('✅ Created subscriptions');

  // Create sample invoices
  console.log('🧾 Creating sample invoices...');

  await prisma.invoice.create({
    data: {
      userId: proUser.id,
      invoiceNumber: 'INV-2024-001',
      status: 'paid',
      subtotal: 10000,
      tax: 0,
      total: 10000,
      amountPaid: 10000,
      amountDue: 0,
      invoiceDate: new Date(),
      paidAt: new Date(),
      provider: 'paddle',
      providerId: 'inv_paddle_001',
      paymentMethod: 'card',
    },
  });

  await prisma.invoice.create({
    data: {
      userId: enterpriseUser.id,
      invoiceNumber: 'INV-2024-002',
      status: 'paid',
      subtotal: 50000,
      tax: 0,
      total: 50000,
      amountPaid: 50000,
      amountDue: 0,
      invoiceDate: new Date(),
      paidAt: new Date(),
      provider: 'paddle',
      providerId: 'inv_paddle_002',
      paymentMethod: 'card',
    },
  });

  console.log('✅ Created sample invoices');

  // Create sample usage records
  console.log('📈 Creating sample usage records...');

  const users = [freeUser, proUser, enterpriseUser];
  for (const user of users) {
    for (let i = 0; i < 5; i++) {
      await prisma.usageRecord.create({
        data: {
          userId: user.id,
          requestType: 'cli',
          model: 'claude-3-5-sonnet',
          provider: 'anthropic',
          tokensUsed: Math.floor(Math.random() * 5000) + 1000,
          inputTokens: Math.floor(Math.random() * 2000) + 500,
          outputTokens: Math.floor(Math.random() * 3000) + 500,
          cost: Math.random() * 0.5,
          duration: Math.floor(Math.random() * 3000) + 500,
          success: true,
          platform: 'cli',
          timestamp: new Date(Date.now() - i * 3600000), // Each hour back
        },
      });
    }
  }

  console.log('✅ Created sample usage records');

  // Create platform API keys (for premium users)
  console.log('🔑 Creating platform API keys...');

  await prisma.platformApiKey.create({
    data: {
      provider: 'openrouter',
      keyEncrypted: 'encrypted_key_1_for_dev',
      keyName: 'OpenRouter Primary',
      quotaLimit: 1000000,
      quotaUsed: 150000,
      isActive: true,
      priority: 1,
    },
  });

  await prisma.platformApiKey.create({
    data: {
      provider: 'openrouter',
      keyEncrypted: 'encrypted_key_2_for_dev',
      keyName: 'OpenRouter Secondary',
      quotaLimit: 1000000,
      quotaUsed: 50000,
      isActive: true,
      priority: 2,
    },
  });

  await prisma.platformApiKey.create({
    data: {
      provider: 'anthropic',
      keyEncrypted: 'encrypted_key_3_for_dev',
      keyName: 'Claude Direct',
      quotaLimit: 500000,
      quotaUsed: 25000,
      isActive: true,
      priority: 1,
    },
  });

  console.log('✅ Created platform API keys');

  // Create a test team
  console.log('👥 Creating test team...');

  const team = await prisma.team.create({
    data: {
      name: 'Dev Team',
      slug: 'dev-team',
      ownerId: enterpriseUser.id,
      plan: 'enterprise',
      description: 'Enterprise development team',
    },
  });

  await prisma.teamMember.create({
    data: {
      teamId: team.id,
      userId: enterpriseUser.id,
      role: 'owner',
    },
  });

  await prisma.teamMember.create({
    data: {
      teamId: team.id,
      userId: proUser.id,
      role: 'admin',
    },
  });

  console.log('✅ Created test team');

  // Create audit logs
  console.log('📝 Creating audit logs...');

  await prisma.auditLog.create({
    data: {
      userId: proUser.id,
      action: 'login',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0...',
      success: true,
      timestamp: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: enterpriseUser.id,
      action: 'create_api_key',
      resource: 'api_key',
      ipAddress: '192.168.1.2',
      success: true,
      timestamp: new Date(),
    },
  });

  console.log('✅ Created audit logs');

  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('Test Users:');
  console.log('  Free:       free@recoder.xyz / password123');
  console.log('  Pro:        pro@recoder.xyz / password123');
  console.log('  Enterprise: enterprise@recoder.xyz / password123');
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
