// API Authentication for Web Platform
export const apiKeyManager = {
  generateApiKey(userId: string, productType: 'cli' | 'extension' | 'router'): string {
    return `wp_${userId}_${productType}_${Date.now()}`;
  }
};