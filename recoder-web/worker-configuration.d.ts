interface Env {
  ANTHROPIC_API_KEY: string;
  GITHUB_TOKEN?: string;

  // OpenRouter - ONE API KEY for ALL AI models (recommended!)
  OPENROUTER_API_KEY?: string;

  // Database
  DATABASE_URL?: string;
  DB?: D1Database; // Cloudflare D1 binding for MCP

  // Redis Cache
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;

  // Application URLs
  APP_URL?: string;
  MAIN_SITE_URL?: string;

  // Paddle Payment Provider (US/EU markets)
  PADDLE_VENDOR_ID?: string;
  PADDLE_API_KEY?: string;
  PADDLE_PUBLIC_KEY?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  PADDLE_ENV?: 'sandbox' | 'production';
  PADDLE_ENVIRONMENT?: 'sandbox' | 'production';
  PADDLE_PRICE_PRO?: string;
  PADDLE_PRICE_TEAM?: string;
  PADDLE_PRICE_ENTERPRISE?: string;

  // DodoPay Payment Provider (Asian markets)
  DODOPAY_MERCHANT_ID?: string;
  DODOPAY_API_KEY?: string;
  DODOPAY_API_SECRET?: string;
  DODOPAY_ENV?: 'sandbox' | 'production';

  // Monitoring & Alerts
  SLACK_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
  ALERT_WEBHOOK_URL?: string;

  // Web Scraping
  FIRECRAWL_API_KEY?: string;
}
