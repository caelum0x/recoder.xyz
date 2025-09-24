-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dodoProductId" TEXT,
    "stripeProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_features" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_limits" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "monthlyRequests" INTEGER NOT NULL DEFAULT 0,
    "dailyRequests" INTEGER NOT NULL DEFAULT 0,
    "tokensPerRequest" INTEGER NOT NULL DEFAULT 1000,
    "modelsAvailable" JSONB NOT NULL DEFAULT '[]',
    "features" JSONB NOT NULL DEFAULT '[]',
    "costLimitUSD" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_limits_planId_key" ON "subscription_plan_limits"("planId");
CREATE INDEX "subscription_plans_active_idx" ON "subscription_plans"("active");
CREATE INDEX "subscription_plan_features_planId_idx" ON "subscription_plan_features"("planId");
CREATE INDEX "usage_events_userId_idx" ON "usage_events"("userId");
CREATE INDEX "usage_events_timestamp_idx" ON "usage_events"("timestamp");

-- AddForeignKey
ALTER TABLE "subscription_plan_features" ADD CONSTRAINT "subscription_plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_plan_limits" ADD CONSTRAINT "subscription_plan_limits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert default subscription plans
INSERT INTO "subscription_plans" ("id", "name", "description", "price", "currency", "interval", "active", "sortOrder") VALUES
('free', 'Free Plan', 'Basic access to Recoder.xyz with limited features', 0.00, 'USD', 'month', true, 1),
('starter', 'Starter Plan', 'Perfect for individual developers getting started', 9.99, 'USD', 'month', true, 2),
('pro', 'Pro Plan', 'Advanced features for professional developers', 19.99, 'USD', 'month', true, 3),
('enterprise', 'Enterprise Plan', 'Full-featured plan for teams and organizations', 99.99, 'USD', 'month', true, 4);

-- Insert plan limits
INSERT INTO "subscription_plan_limits" ("id", "planId", "monthlyRequests", "dailyRequests", "tokensPerRequest", "modelsAvailable", "costLimitUSD") VALUES
('free-limits', 'free', 100, 10, 1000, '["claude-3-haiku"]', 5.00),
('starter-limits', 'starter', 1000, 100, 5000, '["claude-3-haiku", "claude-3-sonnet"]', 25.00),
('pro-limits', 'pro', 5000, 500, 10000, '["claude-3-haiku", "claude-3-sonnet", "claude-3-opus"]', 100.00),
('enterprise-limits', 'enterprise', 50000, 5000, 50000, '["claude-3-haiku", "claude-3-sonnet", "claude-3-opus", "gpt-4", "gemini-pro"]', 1000.00);

-- Insert plan features
INSERT INTO "subscription_plan_features" ("id", "planId", "name", "description", "included", "sortOrder") VALUES
-- Free Plan Features
('free-feature-1', 'free', 'Access to Claude 3 Haiku', 'Basic AI model for simple tasks', true, 1),
('free-feature-2', 'free', 'Basic code generation', 'Simple code snippets and templates', true, 2),
('free-feature-3', 'free', '100 requests per month', 'Limited monthly usage', true, 3),
('free-feature-4', 'free', 'Community support', 'Access to community forums', true, 4),

-- Starter Plan Features
('starter-feature-1', 'starter', 'Access to Claude 3 Haiku & Sonnet', 'Enhanced AI models for better results', true, 1),
('starter-feature-2', 'starter', 'Advanced code generation', 'Complex code structures and patterns', true, 2),
('starter-feature-3', 'starter', '1,000 requests per month', 'Higher monthly usage limits', true, 3),
('starter-feature-4', 'starter', 'Email support', 'Direct email support channel', true, 4),
('starter-feature-5', 'starter', 'Code analysis', 'Basic code quality analysis', true, 5),

-- Pro Plan Features
('pro-feature-1', 'pro', 'Access to all Claude models', 'Premium AI models including Claude 3 Opus', true, 1),
('pro-feature-2', 'pro', 'Premium code generation', 'Production-ready code with best practices', true, 2),
('pro-feature-3', 'pro', '5,000 requests per month', 'Professional usage limits', true, 3),
('pro-feature-4', 'pro', 'Priority support', 'Faster response times', true, 4),
('pro-feature-5', 'pro', 'Advanced features', 'Custom templates and configurations', true, 5),
('pro-feature-6', 'pro', 'Code quality analysis', 'Advanced static analysis and suggestions', true, 6),
('pro-feature-7', 'pro', 'Team collaboration', 'Share projects with team members', true, 7),

-- Enterprise Plan Features
('enterprise-feature-1', 'enterprise', 'Unlimited model access', 'All available AI models and versions', true, 1),
('enterprise-feature-2', 'enterprise', 'Enterprise code generation', 'Enterprise-grade code with compliance', true, 2),
('enterprise-feature-3', 'enterprise', '50,000 requests per month', 'Enterprise usage limits', true, 3),
('enterprise-feature-4', 'enterprise', 'Dedicated support', '24/7 dedicated support team', true, 4),
('enterprise-feature-5', 'enterprise', 'Custom integrations', 'API access and custom integrations', true, 5),
('enterprise-feature-6', 'enterprise', 'SLA guarantee', '99.9% uptime guarantee', true, 6),
('enterprise-feature-7', 'enterprise', 'Advanced analytics', 'Detailed usage and performance analytics', true, 7),
('enterprise-feature-8', 'enterprise', 'White-label options', 'Customize branding and appearance', true, 8),
('enterprise-feature-9', 'enterprise', 'On-premise deployment', 'Deploy on your own infrastructure', true, 9);