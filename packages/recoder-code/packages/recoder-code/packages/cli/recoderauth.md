1- making sure with the first authentication via recoder.xyz  when users install recoder-code 2- users need to be added to dataabase to track them  and add them as user to our database 3- we need to ask openrouter api keys so that they can use  4th sstep are after adding payment, subscription and our api connection after that we need to track users if they are our premium user we do not need to ask them api keys but we need to track their usage and limit their usages    🎯 Core Understanding

   Your system is a multi-platform AI code generation service (like
   Bolt.new/OpenAI's model) with these key components:

   1. Platform Architecture

     * recoder.xyz - Marketing website with authentication
     * web.recoder.xyz - Bolt-like web IDE (to be built)
     * recoder-code - CLI/VS Code extension (already exists)
     * All platforms authenticate against the same backend database

   2. User Tier System

   Free Tier (Bring Your Own Key):

     * Must provide their own OpenRouter API key
     * 1,000 requests/month limit
     * They pay OpenRouter directly for usage
     * After signup, prompted to add API key
     * Key is encrypted (AES-256-GCM) and stored in database

   Pro Tier ($29/month):

     * Platform provides API keys (rotating pool)
     * 50,000 requests/month
     * No API key prompt needed
     * Platform pays for their usage
     * Higher rate limits

   Enterprise Tier ($299/month):

     * Dedicated API keys
     * 1M requests/month
     * Custom features and SLA

   3. Authentication Flows

   Web OAuth (Primary for desktop):

     * Opens browser to recoder.xyz
     * User signs in (GitHub/Google/Email)
     * Redirects to localhost:8080 with auth code
     * CLI/Extension exchanges code for tokens
     * Tokens stored in VS Code Secrets API

   Device Flow (For SSH/headless):

     * Request device code from API
     * Show user code (e.g., ABCD-1234)
     * User visits recoder.xyz/device on another device
     * Enters code and authorizes
     * CLI polls until approved
     * Receives tokens

   API Key Auth (For automation):

     * User generates long-lived key on website
     * Uses key directly in CLI
     * Good for CI/CD pipelines

   4. Critical Flow for Free Users

     1. User authenticates (any method)
     2. Backend creates/finds user in database
     3. Check subscription_plan === "free"
     4. If has_own_api_key === false
        └─> Prompt for OpenRouter API key
        └─> Validate format (sk-or-v1-...)
        └─> Encrypt with AES-256-GCM
        └─> Store in database
        └─> Set has_own_api_key = true
     5. Ready to use!

   5. Usage Tracking

   Every AI request:

     1. Check quota before request
     2. Get appropriate API key (user's or platform's)
     3. Make request to OpenRouter
     4. Track usage: requestsUsed++, tokensUsed += X
     5. Update quota in database
     6. If quota exceeded → show upgrade prompt

   6. Current Implementation Status

   ✅ Already Built:

     * CLI authentication service (all 4 methods)
     * Token storage (VS Code secrets)
     * Session management
     * Cross-platform sync architecture
     * UI components on recoder.xyz

   ❌ Missing (Critical):

     * Database not connected (using mocks)
     * No user persistence
     * No OpenRouter API key collection flow
     * No usage tracking implementation
     * No premium vs free distinction in behavior
     * Payment integration (Paddle/DODO Pay)

   7. Key Technical Details

   Token Format:

     * Access tokens: rct_xxx (30-day expiry)
     * Refresh tokens: rcr_xxx (used for renewal)
     * API keys: rcli_{userId}_{timestamp}_{random}_{checksum}

   Security:

     * API keys encrypted with AES-256-GCM
     * Passwords hashed with bcrypt
     * CSRF protection (state parameter in OAuth)
     * VS Code Secrets API for local storage
     * File permissions 0600 for ~/.recoder/auth.json

   Database Tables Needed:

     * users (with encrypted openRouterApiKey)
     * user_quotas (tracking usage)
     * usage_records (detailed logs)
     * subscriptions (payment info)
     * auth_codes (temporary OAuth codes)
     * device_codes (device flow)
     * platform_api_keys (for premium users)

   8. The Complete User Journey

   Free User:

     1. Visits recoder.xyz → Signs up
     2. Redirected to onboarding → "Add your OpenRouter API key"
     3. Visits openrouter.ai, creates account, gets key
     4. Pastes key into recoder.xyz
     5. Key encrypted and saved
     6. Can now use web.recoder.xyz and CLI
     7. Usage tracked against 1K/month limit

   Premium User:

     1. Visits recoder.xyz → Signs up
     2. Clicks "Upgrade to Pro" → Pays via Paddle/DODO
     3. Webhook updates subscription_plan to "pro"
     4. NO API key prompt (skipped)
     5. Can immediately use all features
     6. Platform keys used automatically
     7. Usage tracked against 50K/month limit


