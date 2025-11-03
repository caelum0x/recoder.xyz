-- Sample Data for Bolt.new Database
-- Creates test users and subscriptions for development

-- Create sample users (using UUID function)
INSERT INTO users (id, email, name) VALUES
  (gen_random_uuid(), 'free@example.com', 'Free User'),
  (gen_random_uuid(), 'pro@example.com', 'Pro User'),
  (gen_random_uuid(), 'team@example.com', 'Team User'),
  (gen_random_uuid(), 'enterprise@example.com', 'Enterprise User')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

-- Get user IDs for subscriptions
DO $$
DECLARE
  user_free_id UUID;
  user_pro_id UUID;
  user_team_id UUID;
  user_ent_id UUID;
BEGIN
  -- Get user IDs
  SELECT id INTO user_free_id FROM users WHERE email = 'free@example.com';
  SELECT id INTO user_pro_id FROM users WHERE email = 'pro@example.com';
  SELECT id INTO user_team_id FROM users WHERE email = 'team@example.com';
  SELECT id INTO user_ent_id FROM users WHERE email = 'enterprise@example.com';

  -- Create subscriptions
  INSERT INTO subscriptions (
    user_id, provider, subscription_id, customer_id, plan_id, status,
    current_period_start, current_period_end, generations_limit, generations_used
  ) VALUES
    (user_free_id, 'paddle', 'sub_free_demo', 'cus_free_demo', 'free', 'active',
     NOW(), NOW() + INTERVAL '30 days', 5, 2),
    (user_pro_id, 'paddle', 'sub_pro_demo', 'cus_pro_demo', 'pro', 'active',
     NOW(), NOW() + INTERVAL '30 days', 100, 45),
    (user_team_id, 'dodopay', 'sub_team_demo', 'cus_team_demo', 'team', 'active',
     NOW(), NOW() + INTERVAL '30 days', 500, 187),
    (user_ent_id, 'paddle', 'sub_ent_demo', 'cus_ent_demo', 'enterprise', 'active',
     NOW(), NOW() + INTERVAL '30 days', 2000, 823)
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    generations_limit = EXCLUDED.generations_limit,
    generations_used = EXCLUDED.generations_used;

  -- Create sample usage logs
  INSERT INTO usage_logs (user_id, action_type, tokens_used, cost_estimated, model_used, optimization_strategy)
  SELECT
    user_pro_id,
    'generation',
    (RANDOM() * 5000 + 1000)::INTEGER,
    (RANDOM() * 0.05)::DECIMAL(10,4),
    (ARRAY['deepseek-r1', 'gemini-2.5-flash', 'claude-sonnet-4', 'mistral-small'])[FLOOR(RANDOM() * 4 + 1)],
    (ARRAY['template-based', 'model-routed', 'free-tier'])[FLOOR(RANDOM() * 3 + 1)]
  FROM generate_series(1, 15);

  INSERT INTO usage_logs (user_id, action_type, tokens_used, cost_estimated, model_used, optimization_strategy)
  SELECT
    user_team_id,
    'generation',
    (RANDOM() * 5000 + 1000)::INTEGER,
    (RANDOM() * 0.05)::DECIMAL(10,4),
    (ARRAY['deepseek-r1', 'gemini-2.5-flash', 'claude-sonnet-4'])[FLOOR(RANDOM() * 3 + 1)],
    (ARRAY['template-based', 'model-routed'])[FLOOR(RANDOM() * 2 + 1)]
  FROM generate_series(1, 25);

  -- Create payment transactions
  INSERT INTO payment_transactions (user_id, provider, transaction_id, amount, currency, status, payment_method, created_at) VALUES
    (user_pro_id, 'paddle', 'txn_pro_001', 20.00, 'USD', 'succeeded', 'card', NOW() - INTERVAL '60 days'),
    (user_pro_id, 'paddle', 'txn_pro_002', 20.00, 'USD', 'succeeded', 'card', NOW() - INTERVAL '30 days'),
    (user_pro_id, 'paddle', 'txn_pro_003', 20.00, 'USD', 'succeeded', 'card', NOW()),
    (user_team_id, 'dodopay', 'txn_team_001', 50.00, 'USD', 'succeeded', 'card', NOW() - INTERVAL '60 days'),
    (user_team_id, 'dodopay', 'txn_team_002', 50.00, 'USD', 'succeeded', 'alipay', NOW() - INTERVAL '30 days'),
    (user_team_id, 'dodopay', 'txn_team_003', 50.00, 'USD', 'succeeded', 'card', NOW()),
    (user_ent_id, 'paddle', 'txn_ent_001', 200.00, 'USD', 'succeeded', 'card', NOW() - INTERVAL '60 days'),
    (user_ent_id, 'paddle', 'txn_ent_002', 200.00, 'USD', 'succeeded', 'card', NOW() - INTERVAL '30 days'),
    (user_ent_id, 'paddle', 'txn_ent_003', 200.00, 'USD', 'succeeded', 'card', NOW());

END $$;

-- Display summary
SELECT
  'Database seeded successfully!' as message,
  (SELECT COUNT(*) FROM users) as users_count,
  (SELECT COUNT(*) FROM subscriptions) as subscriptions_count,
  (SELECT COUNT(*) FROM usage_logs) as usage_logs_count,
  (SELECT COUNT(*) FROM payment_transactions) as transactions_count;

-- Show sample users
SELECT email, name FROM users ORDER BY email;
