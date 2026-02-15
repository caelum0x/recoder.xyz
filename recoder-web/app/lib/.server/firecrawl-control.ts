interface RuntimeEnvLike {
  NODE_ENV?: string;
  FIRECRAWL_ENABLED?: string;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isFirecrawlEnabled(context?: unknown): boolean {
  const env = (context as { cloudflare?: { env?: RuntimeEnvLike } } | undefined)?.cloudflare?.env;
  const runtimeEnv: RuntimeEnvLike = {
    NODE_ENV: env?.NODE_ENV || process.env.NODE_ENV,
    FIRECRAWL_ENABLED: env?.FIRECRAWL_ENABLED || process.env.FIRECRAWL_ENABLED,
  };

  return parseBoolean(runtimeEnv.FIRECRAWL_ENABLED);
}

export function firecrawlDisabledError() {
  return {
    success: false,
    error: 'Firecrawl routes are disabled. Set FIRECRAWL_ENABLED=true to enable.',
    code: 'FIRECRAWL_DISABLED',
  };
}
