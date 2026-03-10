function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export const featureFlags = {
  /**
   * When true, hide any mobile app download / install advertising across the web app.
   *
   * Default: false (shown)
   * Set NEXT_PUBLIC_DISABLE_MOBILE_ADVERTISING=true to hide.
   */
  disableMobileAdvertising: parseEnvBoolean(
    process.env.NEXT_PUBLIC_DISABLE_MOBILE_ADVERTISING,
    false,
  ),
  /**
   * Optional Vercel analytics loader.
   *
   * Default: false
   * Set NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS=true when the deployment is actually configured for it.
   */
  enableVercelAnalytics: parseEnvBoolean(
    process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS,
    false,
  ),
  /**
   * Optional Vercel Speed Insights loader.
   *
   * Default: false
   * Set NEXT_PUBLIC_ENABLE_VERCEL_SPEED_INSIGHTS=true when the deployment is actually configured for it.
   */
  enableVercelSpeedInsights: parseEnvBoolean(
    process.env.NEXT_PUBLIC_ENABLE_VERCEL_SPEED_INSIGHTS,
    false,
  ),
} as const;
