#!/usr/bin/env node

/**
 * Fix Prisma imports across all route files
 * Replace old models imports with centralized Prisma instance
 */

const fs = require('fs');
const path = require('path');

const routesDir = '/Users/arhansubasi/recoder.xyz/backend/src/routes';
const files = [
  'projects.js', 'templates.js', 'devices.js', 'oauth.js', 
  'analytics.js', 'cli-auth.js', 'sync.js', 'ai-providers.js', 'agents.js'
];

function fixFile(filePath) {
  console.log(`Fixing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace models import with prisma import
  content = content.replace(
    /const\s+\{[^}]+\}\s+=\s+require\(['"]\.\.\/models['"]\);?/g,
    "const { prisma } = require('../database/prisma');"
  );
  
  // Replace model usage patterns (e.g., User.findMany -> prisma.user.findMany)
  const modelMappings = {
    'User\\.': 'prisma.user.',
    'Project\\.': 'prisma.project.', 
    'Template\\.': 'prisma.template.',
    'Agent\\.': 'prisma.agent.',
    'UsageRecord\\.': 'prisma.usageRecord.',
    'Subscription\\.': 'prisma.subscription.',
    'Invoice\\.': 'prisma.invoice.',
    'PaymentMethod\\.': 'prisma.paymentMethod.',
    'Integration\\.': 'prisma.integration.',
    'ApiKey\\.': 'prisma.apiKey.',
    'AuditLog\\.': 'prisma.auditLog.',
    'Configuration\\.': 'prisma.configuration.',
    'NotificationSettings\\.': 'prisma.notificationSettings.',
    'FileUpload\\.': 'prisma.fileUpload.',
    'Webhook\\.': 'prisma.webhook.',
    'WebhookDelivery\\.': 'prisma.webhookDelivery.',
    'OAuthAccount\\.': 'prisma.oAuthAccount.',
    'UserDevice\\.': 'prisma.userDevice.',
    'SyncState\\.': 'prisma.syncState.',
    'AIProviderStatus\\.': 'prisma.aIProviderStatus.',
    'UsageAnalytics\\.': 'prisma.usageAnalytics.'
  };
  
  Object.entries(modelMappings).forEach(([oldPattern, newPattern]) => {
    const regex = new RegExp(oldPattern, 'g');
    content = content.replace(regex, newPattern);
  });
  
  fs.writeFileSync(filePath, content);
  console.log(`✅ Fixed ${filePath}`);
}

// Fix all route files
files.forEach(file => {
  const filePath = path.join(routesDir, file);
  if (fs.existsSync(filePath)) {
    try {
      fixFile(filePath);
    } catch (error) {
      console.error(`❌ Error fixing ${filePath}:`, error.message);
    }
  } else {
    console.log(`⚠️ File not found: ${filePath}`);
  }
});

console.log('🎉 All route files fixed!');