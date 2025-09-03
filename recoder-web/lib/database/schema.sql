-- Complete Social Media & Advertising Platform Database Schema
-- PostgreSQL Schema for Production System

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users and Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user', -- user, admin, agency, enterprise
    subscription_tier VARCHAR(50) DEFAULT 'free', -- free, pro, agency, enterprise
    subscription_status VARCHAR(50) DEFAULT 'active',
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    email_verified BOOLEAN DEFAULT false,
    phone VARCHAR(20),
    timezone VARCHAR(50) DEFAULT 'UTC',
    avatar_url TEXT,
    onboarding_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Teams/Organizations
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    billing_email VARCHAR(255),
    avatar_url TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team members
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- owner, admin, manager, member, viewer
    permissions JSONB DEFAULT '{}',
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active', -- active, pending, disabled
    UNIQUE(team_id, user_id)
);

-- Social Media Accounts
CREATE TABLE social_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- twitter, facebook, instagram, linkedin, youtube, tiktok
    platform_user_id VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    display_name VARCHAR(255),
    profile_image_url TEXT,
    follower_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT false,
    business_account BOOLEAN DEFAULT false,
    access_token TEXT NOT NULL, -- Encrypted
    refresh_token TEXT, -- Encrypted
    token_expires_at TIMESTAMP WITH TIME ZONE,
    permissions TEXT[], -- Array of granted permissions
    account_status VARCHAR(50) DEFAULT 'active', -- active, disconnected, error, limited
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_error TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(platform, platform_user_id, user_id)
);

-- Content Library
CREATE TABLE content_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- post, story, reel, video, image, carousel
    platform_specific JSONB DEFAULT '{}', -- Platform-specific formatting
    tags TEXT[],
    category VARCHAR(100),
    language VARCHAR(10) DEFAULT 'en',
    tone VARCHAR(50), -- professional, casual, funny, urgent
    target_audience VARCHAR(255),
    hashtags TEXT[],
    mentions TEXT[],
    media_urls TEXT[],
    media_metadata JSONB DEFAULT '{}',
    performance_score INTEGER,
    estimated_reach INTEGER,
    estimated_engagement FLOAT,
    status VARCHAR(50) DEFAULT 'draft', -- draft, approved, archived
    created_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaigns
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    objective VARCHAR(100), -- awareness, engagement, traffic, leads, sales
    campaign_type VARCHAR(50), -- organic, paid, mixed
    budget_total DECIMAL(10,2),
    budget_daily DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    timezone VARCHAR(50) DEFAULT 'UTC',
    target_audience JSONB DEFAULT '{}',
    platforms VARCHAR(50)[],
    status VARCHAR(50) DEFAULT 'draft', -- draft, active, paused, completed, archived
    settings JSONB DEFAULT '{}',
    kpi_goals JSONB DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Posts/Content Scheduling
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    content_id UUID REFERENCES content_library(id) ON DELETE SET NULL,
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    media_urls TEXT[],
    hashtags TEXT[],
    mentions TEXT[],
    location VARCHAR(255),
    post_type VARCHAR(50) DEFAULT 'post', -- post, story, reel, video, carousel, thread
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    posted_at TIMESTAMP WITH TIME ZONE,
    platform_post_id VARCHAR(255), -- ID from the social platform
    platform_post_url TEXT,
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, posted, failed, cancelled, draft
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    approval_required BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    performance_data JSONB DEFAULT '{}', -- likes, shares, comments, etc.
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ads System
CREATE TABLE ad_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- facebook, google, linkedin, twitter
    account_id VARCHAR(255) NOT NULL,
    account_name VARCHAR(255),
    currency VARCHAR(3) DEFAULT 'USD',
    timezone VARCHAR(50) DEFAULT 'UTC',
    access_token TEXT NOT NULL, -- Encrypted
    refresh_token TEXT, -- Encrypted
    token_expires_at TIMESTAMP WITH TIME ZONE,
    account_status VARCHAR(50) DEFAULT 'active',
    daily_spend_limit DECIMAL(10,2),
    total_spend_limit DECIMAL(10,2),
    permissions TEXT[],
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(platform, account_id, user_id)
);

CREATE TABLE ad_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    ad_account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    platform_campaign_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    objective VARCHAR(100), -- awareness, traffic, engagement, leads, conversions, sales
    optimization_goal VARCHAR(100),
    bid_strategy VARCHAR(100),
    budget_type VARCHAR(50) DEFAULT 'daily', -- daily, lifetime
    budget_amount DECIMAL(10,2) NOT NULL,
    bid_amount DECIMAL(10,2),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'paused', -- active, paused, deleted, completed
    platform_status VARCHAR(100),
    targeting JSONB DEFAULT '{}',
    placement_settings JSONB DEFAULT '{}',
    special_categories TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ad_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ad_campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    platform_ad_set_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    budget_amount DECIMAL(10,2),
    bid_amount DECIMAL(10,2),
    optimization_goal VARCHAR(100),
    billing_event VARCHAR(100),
    targeting JSONB NOT NULL,
    placement_settings JSONB DEFAULT '{}',
    schedule JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'paused',
    platform_status VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ad_set_id UUID NOT NULL REFERENCES ad_sets(id) ON DELETE CASCADE,
    platform_ad_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    ad_format VARCHAR(100), -- single_image, carousel, video, collection, etc.
    creative_data JSONB NOT NULL, -- images, videos, text, headlines, descriptions
    call_to_action VARCHAR(100),
    destination_url TEXT,
    tracking_params JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'paused',
    platform_status VARCHAR(100),
    review_status VARCHAR(100),
    disapproval_reasons TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics and Performance
CREATE TABLE analytics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    ad_id UUID REFERENCES ads(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- organic, paid
    impressions BIGINT DEFAULT 0,
    reach BIGINT DEFAULT 0,
    engagement BIGINT DEFAULT 0,
    likes BIGINT DEFAULT 0,
    comments BIGINT DEFAULT 0,
    shares BIGINT DEFAULT 0,
    saves BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    video_views BIGINT DEFAULT 0,
    profile_visits BIGINT DEFAULT 0,
    website_clicks BIGINT DEFAULT 0,
    followers_gained INTEGER DEFAULT 0,
    followers_lost INTEGER DEFAULT 0,
    spend DECIMAL(10,2) DEFAULT 0,
    cpm DECIMAL(10,4) DEFAULT 0,
    cpc DECIMAL(10,4) DEFAULT 0,
    ctr DECIMAL(8,4) DEFAULT 0,
    frequency DECIMAL(8,2) DEFAULT 0,
    custom_metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date, account_id, post_id, ad_id, platform, metric_type)
);

-- Content Performance Tracking
CREATE TABLE content_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    metrics JSONB NOT NULL, -- All platform-specific metrics
    sentiment_score DECIMAL(3,2), -- -1 to 1
    engagement_rate DECIMAL(5,4),
    reach_rate DECIMAL(5,4),
    click_through_rate DECIMAL(5,4),
    conversion_rate DECIMAL(5,4),
    revenue_generated DECIMAL(10,2),
    cost_per_engagement DECIMAL(10,4),
    roi DECIMAL(8,4),
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audience Insights
CREATE TABLE audience_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    demographic_data JSONB NOT NULL,
    interest_data JSONB NOT NULL,
    behavior_data JSONB NOT NULL,
    geographic_data JSONB NOT NULL,
    device_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(social_account_id, platform, date)
);

-- AI Content Generation
CREATE TABLE ai_generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    generated_content TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    model_used VARCHAR(100) NOT NULL,
    model_version VARCHAR(50),
    parameters JSONB DEFAULT '{}',
    quality_score INTEGER,
    tokens_used INTEGER,
    cost DECIMAL(10,6),
    generation_time_ms INTEGER,
    approved BOOLEAN DEFAULT false,
    used_in_post UUID REFERENCES posts(id),
    feedback_rating INTEGER, -- 1-5
    feedback_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Automation Rules
CREATE TABLE automation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(100) NOT NULL, -- time_based, event_based, performance_based
    trigger_conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    platforms VARCHAR(50)[],
    status VARCHAR(50) DEFAULT 'active', -- active, paused, disabled
    last_executed_at TIMESTAMP WITH TIME ZONE,
    execution_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    read_at TIMESTAMP WITH TIME ZONE,
    action_url TEXT,
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Billing and Subscriptions
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    plan_id VARCHAR(100) NOT NULL,
    plan_name VARCHAR(100) NOT NULL,
    price_monthly DECIMAL(10,2),
    price_yearly DECIMAL(10,2),
    billing_cycle VARCHAR(20), -- monthly, yearly
    status VARCHAR(50) NOT NULL, -- trialing, active, past_due, canceled, unpaid
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    canceled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    resource_type VARCHAR(100) NOT NULL, -- posts, ai_generations, team_members, etc.
    resource_id VARCHAR(255),
    quantity INTEGER DEFAULT 1,
    cost DECIMAL(10,6) DEFAULT 0,
    billing_cycle VARCHAR(20),
    date DATE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Media Assets
CREATE TABLE media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    width INTEGER,
    height INTEGER,
    duration INTEGER, -- For videos in seconds
    storage_provider VARCHAR(50) DEFAULT 'aws_s3',
    storage_path TEXT NOT NULL,
    cdn_url TEXT,
    thumbnail_url TEXT,
    alt_text TEXT,
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    upload_status VARCHAR(50) DEFAULT 'completed',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Keys and Integrations
CREATE TABLE api_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    service_name VARCHAR(100) NOT NULL,
    service_type VARCHAR(50) NOT NULL, -- social, ads, analytics, ai
    credentials JSONB NOT NULL, -- Encrypted API keys, tokens
    scopes TEXT[],
    status VARCHAR(50) DEFAULT 'active',
    last_verified_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Competitors Tracking
CREATE TABLE competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    industry VARCHAR(100),
    social_handles JSONB DEFAULT '{}', -- Platform -> handle mapping
    tracking_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE competitor_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    followers_count INTEGER,
    following_count INTEGER,
    posts_count INTEGER,
    engagement_rate DECIMAL(5,4),
    avg_likes INTEGER,
    avg_comments INTEGER,
    avg_shares INTEGER,
    posting_frequency DECIMAL(4,2),
    top_hashtags TEXT[],
    content_themes TEXT[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(competitor_id, platform, date)
);

-- Indexes for Performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_subscription ON users(subscription_tier, subscription_status);
CREATE INDEX idx_social_accounts_user_platform ON social_accounts(user_id, platform);
CREATE INDEX idx_posts_scheduled_status ON posts(scheduled_for, status);
CREATE INDEX idx_posts_user_campaign ON posts(user_id, campaign_id);
CREATE INDEX idx_analytics_daily_date_account ON analytics_daily(date, account_id);
CREATE INDEX idx_analytics_daily_user_platform ON analytics_daily(user_id, platform);
CREATE INDEX idx_content_library_user_team ON content_library(user_id, team_id);
CREATE INDEX idx_campaigns_user_status ON campaigns(user_id, status);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read_at);
CREATE INDEX idx_usage_tracking_user_date ON usage_tracking(user_id, date);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_social_accounts_updated_at BEFORE UPDATE ON social_accounts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();