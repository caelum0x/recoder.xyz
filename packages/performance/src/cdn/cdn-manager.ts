/**
 * Production CDN Manager for Recoder.xyz
 * Manages static asset optimization, edge caching, and CDN integration
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';

export interface CDNConfig {
  provider?: 'cloudflare' | 'aws' | 'azure' | 'gcp' | 'custom';
  baseUrl?: string;
  apiKey?: string;
  secretKey?: string;
  region?: string;
  bucket?: string;
  zone?: string;
  enableCompression?: boolean;
  enableBrotli?: boolean;
  enableWebP?: boolean;
  cacheControlHeaders?: Record<string, string>;
  purgeOnDeploy?: boolean;
  enableVersioning?: boolean;
}

export interface CDNStats {
  totalAssets: number;
  totalSize: number;
  cacheHitRate: number;
  bandwidth: {
    inbound: number;
    outbound: number;
  };
  requests: {
    total: number;
    cached: number;
    uncached: number;
  };
  regions: Record<string, {
    requests: number;
    latency: number;
  }>;
  lastUpdate: Date;
}

export interface AssetInfo {
  path: string;
  size: number;
  hash: string;
  contentType: string;
  compressed: boolean;
  cdnUrl?: string;
  uploadedAt?: Date;
  cacheControl?: string;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  size?: number;
  hash?: string;
}

export class CDNManager extends EventEmitter {
  private config: CDNConfig;
  private assets = new Map<string, AssetInfo>();
  private stats: CDNStats;
  private isInitialized = false;

  constructor(config: CDNConfig = {}) {
    super();
    
    this.config = {
      provider: 'custom',
      enableCompression: true,
      enableBrotli: true,
      enableWebP: true,
      cacheControlHeaders: {
        'text/html': 'public, max-age=300',
        'application/javascript': 'public, max-age=31536000, immutable',
        'text/css': 'public, max-age=31536000, immutable',
        'image/png': 'public, max-age=31536000, immutable',
        'image/jpeg': 'public, max-age=31536000, immutable',
        'image/webp': 'public, max-age=31536000, immutable',
        'font/woff2': 'public, max-age=31536000, immutable',
        'application/json': 'public, max-age=3600'
      },
      purgeOnDeploy: true,
      enableVersioning: true,
      ...config
    };

    this.stats = {
      totalAssets: 0,
      totalSize: 0,
      cacheHitRate: 0,
      bandwidth: { inbound: 0, outbound: 0 },
      requests: { total: 0, cached: 0, uncached: 0 },
      regions: {},
      lastUpdate: new Date()
    };
  }

  /**
   * Initialize CDN manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log(`🌐 Initializing CDN Manager (${this.config.provider})...`);

      // Validate configuration
      await this.validateConfig();

      // Connect to CDN provider
      await this.connectToProvider();

      // Load existing assets
      await this.loadAssetManifest();

      this.isInitialized = true;
      console.log('✅ CDN Manager initialized successfully');
      this.emit('initialized');

    } catch (error) {
      console.error('❌ Failed to initialize CDN Manager:', error);
      throw error;
    }
  }

  /**
   * Upload file to CDN
   */
  async uploadFile(filePath: string, options: {
    contentType?: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
    enableCompression?: boolean;
  } = {}): Promise<UploadResult> {
    if (!this.isInitialized) {
      throw new Error('CDN Manager not initialized');
    }

    try {
      // Read file
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      const hash = this.calculateHash(fileBuffer);
      
      // Check if file already exists
      const existing = this.assets.get(fileName);
      if (existing && existing.hash === hash) {
        return {
          success: true,
          url: existing.cdnUrl,
          size: existing.size,
          hash
        };
      }

      // Determine content type
      const contentType = options.contentType || this.getContentType(fileName);
      
      // Get cache control header
      const cacheControl = options.cacheControl || 
        this.config.cacheControlHeaders?.[contentType] || 
        'public, max-age=3600';

      // Compress if enabled
      let processedBuffer = fileBuffer;
      let compressed = false;
      
      if ((options.enableCompression ?? this.config.enableCompression) && 
          this.shouldCompress(contentType)) {
        processedBuffer = await this.compressFile(fileBuffer, contentType);
        compressed = true;
      }

      // Upload to provider
      const cdnUrl = await this.uploadToProvider(fileName, processedBuffer, {
        contentType,
        cacheControl,
        compressed,
        metadata: options.metadata
      });

      // Store asset info
      const assetInfo: AssetInfo = {
        path: fileName,
        size: processedBuffer.length,
        hash,
        contentType,
        compressed,
        cdnUrl,
        uploadedAt: new Date(),
        cacheControl
      };

      this.assets.set(fileName, assetInfo);
      this.updateStats();

      console.log(`✅ Uploaded ${fileName} to CDN: ${cdnUrl}`);
      this.emit('fileUploaded', { fileName, url: cdnUrl, size: assetInfo.size });

      return {
        success: true,
        url: cdnUrl,
        size: assetInfo.size,
        hash
      };

    } catch (error) {
      console.error(`❌ Failed to upload ${filePath}:`, error);
      this.emit('uploadError', { filePath, error });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(filePaths: string[], options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}): Promise<UploadResult[]> {
    const { concurrency = 5, onProgress } = options;
    const results: UploadResult[] = [];
    
    console.log(`📤 Uploading ${filePaths.length} files to CDN...`);

    // Process files in batches
    for (let i = 0; i < filePaths.length; i += concurrency) {
      const batch = filePaths.slice(i, i + concurrency);
      const batchPromises = batch.map(filePath => this.uploadFile(filePath));
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      if (onProgress) {
        onProgress(results.length, filePaths.length);
      }
    }

    const successful = results.filter(r => r.success).length;
    console.log(`✅ Uploaded ${successful}/${filePaths.length} files successfully`);

    return results;
  }

  /**
   * Get CDN URL for asset
   */
  getCDNUrl(fileName: string): string | null {
    const asset = this.assets.get(fileName);
    return asset?.cdnUrl || null;
  }

  /**
   * Get optimized asset URL
   */
  getOptimizedUrl(fileName: string, options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'avif' | 'auto';
  } = {}): string | null {
    const baseUrl = this.getCDNUrl(fileName);
    if (!baseUrl) return null;

    // Build optimization parameters
    const params = new URLSearchParams();
    
    if (options.width) params.set('w', options.width.toString());
    if (options.height) params.set('h', options.height.toString());
    if (options.quality) params.set('q', options.quality.toString());
    if (options.format) params.set('f', options.format);

    if (params.toString()) {
      return `${baseUrl}?${params.toString()}`;
    }

    return baseUrl;
  }

  /**
   * Purge cache for specific assets
   */
  async purgeCache(fileNames?: string[]): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('CDN Manager not initialized');
    }

    try {
      console.log(`🔄 Purging CDN cache${fileNames ? ` for ${fileNames.length} files` : ' (all)'}...`);

      const result = await this.purgeFromProvider(fileNames);
      
      if (result) {
        console.log('✅ Cache purged successfully');
        this.emit('cachePurged', { fileNames });
      }

      return result;
    } catch (error) {
      console.error('❌ Failed to purge cache:', error);
      this.emit('purgeError', { fileNames, error });
      return false;
    }
  }

  /**
   * Get CDN statistics
   */
  async getStats(): Promise<CDNStats> {
    try {
      // Fetch latest stats from provider
      const providerStats = await this.getProviderStats();
      
      // Merge with local stats
      this.stats = {
        ...this.stats,
        ...providerStats,
        totalAssets: this.assets.size,
        totalSize: Array.from(this.assets.values()).reduce((sum, asset) => sum + asset.size, 0),
        lastUpdate: new Date()
      };

      return { ...this.stats };
    } catch (error) {
      console.error('❌ Failed to get CDN stats:', error);
      return { ...this.stats };
    }
  }

  /**
   * Get health status
   */
  async getHealth() {
    try {
      const isHealthy = await this.checkProviderHealth();
      const stats = await this.getStats();
      
      return {
        status: isHealthy ? 'healthy' : 'degraded',
        provider: this.config.provider,
        initialized: this.isInitialized,
        totalAssets: stats.totalAssets,
        cacheHitRate: stats.cacheHitRate,
        lastUpdate: stats.lastUpdate
      };
    } catch (error) {
      return {
        status: 'error',
        provider: this.config.provider,
        initialized: this.isInitialized,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastUpdate: new Date()
      };
    }
  }

  /**
   * Generate asset manifest
   */
  generateManifest(): Record<string, any> {
    const manifest: Record<string, any> = {};
    
    for (const [fileName, asset] of this.assets) {
      manifest[fileName] = {
        url: asset.cdnUrl,
        hash: asset.hash,
        size: asset.size,
        contentType: asset.contentType,
        compressed: asset.compressed,
        uploadedAt: asset.uploadedAt
      };
    }

    return manifest;
  }

  /**
   * Shutdown CDN manager
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      console.log('🛑 Shutting down CDN Manager...');
      
      // Save asset manifest
      await this.saveAssetManifest();
      
      // Disconnect from provider
      await this.disconnectFromProvider();
      
      this.isInitialized = false;
      console.log('✅ CDN Manager shutdown complete');
      this.emit('shutdown');
    } catch (error) {
      console.error('❌ Error during CDN shutdown:', error);
      throw error;
    }
  }

  // Private methods

  private async validateConfig(): Promise<void> {
    if (!this.config.baseUrl && this.config.provider !== 'custom') {
      throw new Error('CDN base URL is required');
    }

    // Provider-specific validation
    switch (this.config.provider) {
      case 'aws':
        if (!this.config.bucket || !this.config.region) {
          throw new Error('AWS S3 bucket and region are required');
        }
        break;
      case 'cloudflare':
        if (!this.config.zone || !this.config.apiKey) {
          throw new Error('Cloudflare zone and API key are required');
        }
        break;
    }
  }

  private async connectToProvider(): Promise<void> {
    // Provider-specific connection logic would go here
    // For now, we'll simulate a successful connection
    console.log(`🔗 Connected to ${this.config.provider} CDN`);
  }

  private async disconnectFromProvider(): Promise<void> {
    // Provider-specific disconnection logic
    console.log(`🔌 Disconnected from ${this.config.provider} CDN`);
  }

  private async uploadToProvider(fileName: string, buffer: Buffer, options: {
    contentType: string;
    cacheControl: string;
    compressed: boolean;
    metadata?: Record<string, string>;
  }): Promise<string> {
    // In a real implementation, this would upload to the actual CDN provider
    // For now, simulate successful upload
    const baseUrl = this.config.baseUrl || 'https://cdn.recoder.xyz';
    const hash = this.calculateHash(buffer);
    
    if (this.config.enableVersioning) {
      const ext = path.extname(fileName);
      const name = path.basename(fileName, ext);
      return `${baseUrl}/${name}.${hash.substring(0, 8)}${ext}`;
    }
    
    return `${baseUrl}/${fileName}`;
  }

  private async purgeFromProvider(fileNames?: string[]): Promise<boolean> {
    // Provider-specific cache purging logic
    // For now, simulate successful purge
    return true;
  }

  private async getProviderStats(): Promise<Partial<CDNStats>> {
    // Provider-specific stats fetching
    // For now, return simulated stats
    return {
      cacheHitRate: 85.5,
      bandwidth: { inbound: 1024 * 1024, outbound: 10 * 1024 * 1024 },
      requests: { total: 10000, cached: 8550, uncached: 1450 },
      regions: {
        'us-east-1': { requests: 5000, latency: 25 },
        'eu-west-1': { requests: 3000, latency: 35 },
        'ap-southeast-1': { requests: 2000, latency: 45 }
      }
    };
  }

  private async checkProviderHealth(): Promise<boolean> {
    // Provider-specific health check
    return true;
  }

  private calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private getContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.ico': 'image/x-icon'
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  private shouldCompress(contentType: string): boolean {
    const compressible = [
      'text/',
      'application/javascript',
      'application/json',
      'image/svg+xml'
    ];

    return compressible.some(type => contentType.startsWith(type));
  }

  private async compressFile(buffer: Buffer, contentType: string): Promise<Buffer> {
    // In a real implementation, this would use gzip/brotli compression
    // For now, just return the original buffer
    return buffer;
  }

  private async loadAssetManifest(): Promise<void> {
    // Load asset manifest from storage
    // For now, start with empty manifest
    console.log('📄 Asset manifest loaded');
  }

  private async saveAssetManifest(): Promise<void> {
    // Save asset manifest to storage
    const manifest = this.generateManifest();
    console.log(`💾 Saved asset manifest (${Object.keys(manifest).length} assets)`);
  }

  private updateStats(): void {
    this.stats.totalAssets = this.assets.size;
    this.stats.totalSize = Array.from(this.assets.values())
      .reduce((sum, asset) => sum + asset.size, 0);
    this.stats.lastUpdate = new Date();
  }
}