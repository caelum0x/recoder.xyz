interface Env {
  ANTHROPIC_API_KEY: string;
  GITHUB_TOKEN?: string;

  // OpenRouter - ONE API KEY for ALL AI models (recommended!)
  OPENROUTER_API_KEY?: string;

  // Database
  DATABASE_URL?: string;
  DB?: D1Database; // Cloudflare D1 binding for MCP

  // Paddle Payment Provider (US/EU markets)
  PADDLE_VENDOR_ID?: string;
  PADDLE_API_KEY?: string;
  PADDLE_PUBLIC_KEY?: string;
  PADDLE_ENV?: 'sandbox' | 'production';

  // DodoPay Payment Provider (Asian markets)
  DODOPAY_MERCHANT_ID?: string;
  DODOPAY_API_KEY?: string;
  DODOPAY_API_SECRET?: string;
  DODOPAY_ENV?: 'sandbox' | 'production';
}
