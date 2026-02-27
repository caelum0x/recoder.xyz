#!/usr/bin/env node

/**
 * Seed Platform API Keys
 * Adds OpenRouter API keys to platform_api_keys table for Pro/Enterprise tiers
 *
 * Usage:
 *   node seed-platform-keys.js
 *
 * Make sure DATABASE_URL is set in your environment
 */

const { Client } = require('pg');
const crypto = require('crypto');

// User's OpenRouter API key — must be set in environment
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY environment variable is required');
  process.exit(1);
}

// Database connection from environment
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

// Encryption function (same as used in user-service)
function encryptApiKey(apiKey) {
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

async function seedPlatformKeys() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!\n');

    // Check if table exists
    console.log('📋 Checking platform_api_keys table...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'platform_api_keys'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Table platform_api_keys does not exist!');
      console.log('Please run database migrations first.');
      process.exit(1);
    }
    console.log('✅ Table exists\n');

    // Encrypt the API key
    console.log('🔐 Encrypting API key...');
    const encryptedKey = encryptApiKey(OPENROUTER_API_KEY);
    console.log('✅ API key encrypted\n');

    // Check if we already have keys for each tier
    const existingKeys = await client.query(
      'SELECT tier, COUNT(*) as count FROM "platform_api_keys" GROUP BY tier'
    );

    console.log('📊 Existing platform keys:');
    if (existingKeys.rows.length === 0) {
      console.log('  (none)');
    } else {
      existingKeys.rows.forEach(row => {
        console.log(`  ${row.tier}: ${row.count} key(s)`);
      });
    }
    console.log('');

    // Seed keys for Pro tier
    console.log('💼 Adding Pro tier key...');
    const proResult = await client.query(`
      INSERT INTO "platform_api_keys" (
        id,
        tier,
        provider,
        "keyEncrypted",
        "keyName",
        "quotaLimit",
        "quotaUsed",
        "isActive",
        priority,
        "lastUsedAt",
        "createdAt"
      ) VALUES (
        gen_random_uuid()::text,
        'pro',
        'openrouter',
        $1,
        'Pro Tier Key #1',
        50000,
        0,
        true,
        1,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id;
    `, [encryptedKey]);

    if (proResult.rows.length > 0) {
      console.log(`✅ Pro key added: ${proResult.rows[0].id}`);
    } else {
      console.log('⚠️  Pro key already exists or conflict occurred');
    }

    // Seed keys for Enterprise tier
    console.log('🏢 Adding Enterprise tier key...');
    const enterpriseResult = await client.query(`
      INSERT INTO "platform_api_keys" (
        id,
        tier,
        provider,
        "keyEncrypted",
        "keyName",
        "quotaLimit",
        "quotaUsed",
        "isActive",
        priority,
        "lastUsedAt",
        "createdAt"
      ) VALUES (
        gen_random_uuid()::text,
        'enterprise',
        'openrouter',
        $1,
        'Enterprise Tier Key #1',
        1000000,
        0,
        true,
        1,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id;
    `, [encryptedKey]);

    if (enterpriseResult.rows.length > 0) {
      console.log(`✅ Enterprise key added: ${enterpriseResult.rows[0].id}`);
    } else {
      console.log('⚠️  Enterprise key already exists or conflict occurred');
    }

    // Show final status
    console.log('\n📊 Final platform keys status:');
    const finalKeys = await client.query(`
      SELECT tier, "keyName", "quotaLimit", "isActive"
      FROM "platform_api_keys"
      ORDER BY tier, priority;
    `);

    if (finalKeys.rows.length === 0) {
      console.log('  (none - something went wrong!)');
    } else {
      finalKeys.rows.forEach(key => {
        const status = key.isActive ? '✅' : '❌';
        console.log(`  ${status} ${key.tier}: ${key.keyName} (${key.quotaLimit.toLocaleString()} requests)`);
      });
    }

    console.log('\n🎉 Platform API keys seeded successfully!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('  1. Pro users will automatically use platform keys');
    console.log('  2. Enterprise users will use dedicated keys');
    console.log('  3. Free users will still need to provide their own keys');
    console.log('');

  } catch (error) {
    console.error('❌ Error seeding platform keys:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the seeder
seedPlatformKeys().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
