/**
 * CDN Utilities - Unified CDN URL management
 *
 * Provides centralized CDN URL handling for both frontend and backend environments
 */

/**
 * Environment detection for CDN URL configuration
 */
const isClientEnvironment = typeof window !== 'undefined';
const DEFAULT_CDN_URL = 'http://localhost:3004';

/**
 * Get CDN base URL from environment variables
 * Supports both frontend (NEXT_PUBLIC_CDN_URL) and backend (CDN_URL) environments
 */
function getCdnBaseUrl(): string {
  // Client-side environment (browser)
  if (isClientEnvironment) {
    // In browser, try to get from window or fall back to env
    const windowEnv = (window as { ENV?: { CDN_URL?: string } }).ENV;
    if (windowEnv?.CDN_URL) {
      return windowEnv.CDN_URL;
    }
  }

  // Try environment variables (works in both client with bundled env and server)
  if (typeof process !== 'undefined' && process.env) {
    return (
      process.env.NEXT_PUBLIC_CDN_URL ||
      process.env.CDN_URL ||
      process.env.VITE_CDN_URL ||
      DEFAULT_CDN_URL
    );
  }

  return DEFAULT_CDN_URL;
}

/**
 * CDN Utilities Class
 * Provides centralized methods for CDN URL operations
 */
export class CDNUtils {
  private static baseUrlCache: string | null = null;

  /**
   * Get the base CDN URL (cached)
   */
  static getBaseUrl(): string {
    if (!this.baseUrlCache) {
      this.baseUrlCache = getCdnBaseUrl();
    }
    return this.baseUrlCache;
  }

  /**
   * Clear the cached base URL (useful for testing)
   */
  static clearCache(): void {
    this.baseUrlCache = null;
  }

  /**
   * Set a custom base URL (useful for testing or dynamic configuration)
   */
  static setBaseUrl(url: string): void {
    this.baseUrlCache = url;
  }

  /**
   * Get image URL by key
   * @param key - Image key from CDN
   * @returns Full image URL
   */
  static getImageUrl(key: string): string {
    const baseUrl = this.getBaseUrl();
    return `${baseUrl}/image/${key}`;
  }

  /**
   * Get file URL by planId
   * @param planId - Plan ID for file access
   * @returns Full file URL
   */
  static getFileUrl(planId: string): string {
    const baseUrl = this.getBaseUrl();
    return `${baseUrl}/file/${planId}`;
  }

  /**
   * Get upload endpoint URL
   * @returns Upload endpoint URL
   */
  static getUploadUrl(): string {
    const baseUrl = this.getBaseUrl();
    return `${baseUrl}/upload`;
  }

  /**
   * Get screenshot URL by planId
   * @param planId - Plan ID for screenshot access
   * @returns Full screenshot URL
   */
  static getScreenshotUrl(planId: string): string {
    const baseUrl = this.getBaseUrl();
    return `${baseUrl}/screenshot/${planId}`;
  }

  /**
   * Get screenshot upload endpoint URL
   * @returns Screenshot upload endpoint URL
   */
  static getScreenshotUploadUrl(): string {
    const baseUrl = this.getBaseUrl();
    return `${baseUrl}/screenshot`;
  }

  /**
   * Get static asset URL
   * @param assetPath - Path to static asset (e.g., 'notification.wav', 'badge.js')
   * @returns Full static asset URL
   */
  static getStaticAssetUrl(assetPath: string): string {
    const baseUrl = this.getBaseUrl();
    // Remove leading slash if present to avoid double slashes
    const cleanPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
    return `${baseUrl}/${cleanPath}`;
  }

  /**
   * Get project files URL
   * @param projectId - Project ID
   * @param path - Optional file path within project
   * @returns Full project files URL
   */
  static getProjectFilesUrl(projectId: string, path?: string): string {
    const baseUrl = this.getBaseUrl();
    let url = `${baseUrl}/projects/${projectId}/files`;
    if (path) {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      url += `/${cleanPath}`;
    }
    return url;
  }

  /**
   * Get thumbnail URL
   * @param key - Thumbnail key
   * @param width - Optional width
   * @param height - Optional height
   * @returns Full thumbnail URL with size parameters
   */
  static getThumbnailUrl(key: string, width?: number, height?: number): string {
    const baseUrl = this.getBaseUrl();
    const url = new URL(`${baseUrl}/thumbnail/${key}`);
    if (width) url.searchParams.set('w', width.toString());
    if (height) url.searchParams.set('h', height.toString());
    return url.toString();
  }

  /**
   * Build a URL with query parameters
   * @param path - URL path
   * @param params - Query parameters
   * @returns Full URL with query parameters
   */
  static buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
    const baseUrl = this.getBaseUrl();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${baseUrl}${cleanPath}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }
}

/**
 * Convenience function for getting base CDN URL
 * Maintains backward compatibility with existing getCdnUrl functions
 */
export const getCdnUrl = (): string => CDNUtils.getBaseUrl();

/**
 * Export individual utility functions for direct usage
 */
export const getCdnImageUrl = (key: string): string => CDNUtils.getImageUrl(key);
export const getCdnFileUrl = (planId: string): string => CDNUtils.getFileUrl(planId);
export const getCdnUploadUrl = (): string => CDNUtils.getUploadUrl();
export const getCdnScreenshotUrl = (planId: string): string => CDNUtils.getScreenshotUrl(planId);
export const getCdnScreenshotUploadUrl = (): string => CDNUtils.getScreenshotUploadUrl();
export const getCdnStaticAssetUrl = (assetPath: string): string =>
  CDNUtils.getStaticAssetUrl(assetPath);
export const getCdnProjectFilesUrl = (projectId: string, path?: string): string =>
  CDNUtils.getProjectFilesUrl(projectId, path);
export const getCdnThumbnailUrl = (key: string, width?: number, height?: number): string =>
  CDNUtils.getThumbnailUrl(key, width, height);
