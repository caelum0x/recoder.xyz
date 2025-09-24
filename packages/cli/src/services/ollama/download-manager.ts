/**
 * Download Manager with Progress Tracking and Resume
 * 
 * Robust download manager with resume capability, progress tracking,
 * error recovery, and parallel download optimization for Ollama binaries
 * and models with comprehensive error handling and retry logic.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { EventEmitter } from 'events';
import { Logger } from 'recoder-shared';

export interface DownloadOptions {
  onProgress?: (downloaded: number, total: number, speed: number) => void;
  onStart?: (total: number) => void;
  onComplete?: (filePath: string) => void;
  onError?: (error: Error) => void;
  checksumValidation?: boolean;
  expectedChecksum?: string;
  maxRetries?: number;
  timeout?: number;              // Timeout in ms
  resumeSupport?: boolean;       // Whether to support resume
  headers?: Record<string, string>;
  userAgent?: string;
  maxRedirects?: number;
}

export interface DownloadProgress {
  url: string;
  filePath: string;
  downloaded: number;
  total: number;
  percentage: number;
  speed: number;                 // bytes per second
  eta: number;                   // estimated time remaining in seconds
  startTime: Date;
  elapsedTime: number;           // elapsed time in seconds
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  error?: Error;
}

export interface DownloadSession {
  id: string;
  url: string;
  filePath: string;
  progress: DownloadProgress;
  options: DownloadOptions;
  abortController?: AbortController;
  resumeData?: {
    startByte: number;
    etag?: string;
    lastModified?: string;
  };
}

export class DownloadManager extends EventEmitter {
  private activeSessions: Map<string, DownloadSession> = new Map();
  private config = {
    defaultTimeout: 30000,        // 30 seconds
    defaultMaxRetries: 3,
    defaultUserAgent: 'Recoder-CLI/1.0',
    chunkSize: 64 * 1024,         // 64KB chunks
    speedCalculationWindow: 5,    // 5 second window for speed calculation
    maxConcurrentDownloads: 3,
    retryDelay: 1000,             // 1 second base delay
    maxRetryDelay: 30000          // 30 seconds max delay
  };

  constructor() {
    super();
  }

  /**
   * Download a file with progress tracking and resume support
   */
  async downloadFile(
    url: string,
    filePath: string,
    options: DownloadOptions = {}
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    const session = this.createSession(sessionId, url, filePath, options);
    
    try {
      this.activeSessions.set(sessionId, session);
      
      // Check if file partially exists and resume is supported
      if (options.resumeSupport !== false) {
        await this.checkResumeCapability(session);
      }

      const result = await this.executeDownload(session);
      
      // Validate checksum if required
      if (options.checksumValidation && options.expectedChecksum) {
        await this.validateChecksum(filePath, options.expectedChecksum);
      }

      session.progress.status = 'completed';
      this.emit('downloadComplete', session.progress);
      
      if (options.onComplete) {
        options.onComplete(filePath);
      }

      return result;

    } catch (error) {
      const downloadError = error instanceof Error ? error : new Error(String(error));
      session.progress.status = 'error';
      session.progress.error = downloadError;
      
      this.emit('downloadError', session.progress);
      
      if (options.onError) {
        options.onError(downloadError);
      }

      throw downloadError;

    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Download multiple files concurrently
   */
  async downloadFiles(
    downloads: Array<{ url: string; filePath: string; options?: DownloadOptions }>
  ): Promise<string[]> {
    const maxConcurrent = this.config.maxConcurrentDownloads;
    const results: string[] = [];
    
    // Process downloads in batches
    for (let i = 0; i < downloads.length; i += maxConcurrent) {
      const batch = downloads.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(({ url, filePath, options }) =>
        this.downloadFile(url, filePath, options || {})
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Pause an active download
   */
  async pauseDownload(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (session.abortController) {
      session.abortController.abort();
    }

    session.progress.status = 'paused';
    this.emit('downloadPaused', session.progress);
    
    return true;
  }

  /**
   * Resume a paused download
   */
  async resumeDownload(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.progress.status !== 'paused') {
      return false;
    }

    try {
      await this.executeDownload(session);
      return true;
    } catch (error) {
      Logger.error(`Failed to resume download ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Cancel an active download
   */
  async cancelDownload(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (session.abortController) {
      session.abortController.abort();
    }

    session.progress.status = 'cancelled';
    this.emit('downloadCancelled', session.progress);
    
    // Cleanup partial file
    try {
      await fs.unlink(session.filePath);
    } catch (error) {
      // File might not exist, that's okay
    }

    this.activeSessions.delete(sessionId);
    return true;
  }

  /**
   * Get progress for all active downloads
   */
  getActiveDownloads(): DownloadProgress[] {
    return Array.from(this.activeSessions.values()).map(session => session.progress);
  }

  /**
   * Get progress for a specific download
   */
  getDownloadProgress(sessionId: string): DownloadProgress | null {
    const session = this.activeSessions.get(sessionId);
    return session ? session.progress : null;
  }

  // Private helper methods

  private generateSessionId(): string {
    return `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createSession(
    sessionId: string,
    url: string,
    filePath: string,
    options: DownloadOptions
  ): DownloadSession {
    const progress: DownloadProgress = {
      url,
      filePath,
      downloaded: 0,
      total: 0,
      percentage: 0,
      speed: 0,
      eta: 0,
      startTime: new Date(),
      elapsedTime: 0,
      status: 'pending'
    };

    return {
      id: sessionId,
      url,
      filePath,
      progress,
      options: {
        maxRetries: this.config.defaultMaxRetries,
        timeout: this.config.defaultTimeout,
        userAgent: this.config.defaultUserAgent,
        resumeSupport: true,
        maxRedirects: 5,
        ...options
      }
    };
  }

  private async checkResumeCapability(session: DownloadSession): Promise<void> {
    try {
      const stats = await fs.stat(session.filePath);
      
      if (stats.isFile() && stats.size > 0) {
        // File exists and has content, check if server supports range requests
        const supportsResume = await this.checkRangeSupport(session.url);
        
        if (supportsResume) {
          session.resumeData = {
            startByte: stats.size
          };
          session.progress.downloaded = stats.size;
          Logger.info(`Resume capability detected, starting from byte ${stats.size}`);
        } else {
          // Server doesn't support resume, remove partial file
          await fs.unlink(session.filePath);
        }
      }
    } catch (error) {
      // File doesn't exist or can't be accessed, start fresh
    }
  }

  private async checkRangeSupport(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const req = protocol.request(url, { method: 'HEAD' }, (res) => {
        const acceptRanges = res.headers['accept-ranges'];
        resolve(acceptRanges === 'bytes');
      });

      req.on('error', () => resolve(false));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  private async executeDownload(session: DownloadSession): Promise<string> {
    const { url, filePath, options } = session;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= (options.maxRetries || 0)) {
      try {
        session.abortController = new AbortController();
        
        const result = await this.performDownload(session);
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (attempt <= (options.maxRetries || 0)) {
          const delay = Math.min(
            this.config.retryDelay * Math.pow(2, attempt - 1),
            this.config.maxRetryDelay
          );
          
          Logger.warn(`Download attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Download failed after all retry attempts');
  }

  private async performDownload(session: DownloadSession): Promise<string> {
    const { url, filePath, options, resumeData } = session;

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const headers: Record<string, string> = {
        'User-Agent': options.userAgent || this.config.defaultUserAgent,
        ...options.headers
      };

      // Add range header for resume support
      if (resumeData && resumeData.startByte > 0) {
        headers['Range'] = `bytes=${resumeData.startByte}-`;
      }

      const req = protocol.request(url, { headers }, async (res) => {
        try {
          if (!res.statusCode) {
            reject(new Error('No status code received'));
            return;
          }

          // Handle redirects
          if (res.statusCode >= 300 && res.statusCode < 400) {
            const location = res.headers.location;
            if (location && (options.maxRedirects || 0) > 0) {
              session.url = location;
              if (options.maxRedirects) {
                options.maxRedirects--;
              }
              const result = await this.performDownload(session);
              resolve(result);
              return;
            } else {
              reject(new Error(`Too many redirects or no location header`));
              return;
            }
          }

          // Check for successful response
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            return;
          }

          // Get content length
          const contentLength = parseInt(res.headers['content-length'] || '0');
          const totalSize = resumeData ? contentLength + resumeData.startByte : contentLength;
          
          session.progress.total = totalSize;
          session.progress.status = 'downloading';

          if (options.onStart) {
            options.onStart(totalSize);
          }

          // Create write stream (append mode for resume)
          const writeStream = fsSync.createWriteStream(filePath, {
            flags: resumeData ? 'a' : 'w'
          });

          // Progress tracking
          const speedSamples: Array<{ time: number; bytes: number }> = [];
          let lastProgressUpdate = Date.now();

          const updateProgress = () => {
            const now = Date.now();
            const elapsed = (now - session.progress.startTime.getTime()) / 1000;
            
            session.progress.elapsedTime = elapsed;
            session.progress.percentage = session.progress.total > 0 ? 
              (session.progress.downloaded / session.progress.total) * 100 : 0;

            // Calculate speed using sliding window
            speedSamples.push({ time: now, bytes: session.progress.downloaded });
            
            // Keep only samples from the last window
            const windowStart = now - (this.config.speedCalculationWindow * 1000);
            while (speedSamples.length > 0 && speedSamples[0].time < windowStart) {
              speedSamples.shift();
            }

            if (speedSamples.length >= 2) {
              const timeSpan = (speedSamples[speedSamples.length - 1].time - speedSamples[0].time) / 1000;
              const bytesDiff = speedSamples[speedSamples.length - 1].bytes - speedSamples[0].bytes;
              session.progress.speed = timeSpan > 0 ? bytesDiff / timeSpan : 0;
            }

            // Calculate ETA
            if (session.progress.speed > 0) {
              const remaining = session.progress.total - session.progress.downloaded;
              session.progress.eta = remaining / session.progress.speed;
            }

            // Throttle progress updates to avoid overwhelming
            if (now - lastProgressUpdate >= 100) { // Update every 100ms max
              this.emit('downloadProgress', session.progress);
              
              if (options.onProgress) {
                options.onProgress(
                  session.progress.downloaded,
                  session.progress.total,
                  session.progress.speed
                );
              }
              
              lastProgressUpdate = now;
            }
          };

          // Handle data
          res.on('data', (chunk: Buffer) => {
            if (session.abortController?.signal.aborted) {
              writeStream.destroy();
              req.destroy();
              reject(new Error('Download cancelled'));
              return;
            }

            session.progress.downloaded += chunk.length;
            updateProgress();
          });

          // Handle stream events
          res.pipe(writeStream);

          writeStream.on('finish', () => {
            session.progress.status = 'completed';
            session.progress.percentage = 100;
            updateProgress();
            resolve(filePath);
          });

          writeStream.on('error', (error) => {
            reject(error);
          });

          res.on('error', (error) => {
            writeStream.destroy();
            reject(error);
          });

        } catch (error) {
          reject(error);
        }
      });

      // Handle request errors
      req.on('error', (error) => {
        reject(error);
      });

      // Set timeout
      req.setTimeout(options.timeout || this.config.defaultTimeout, () => {
        req.destroy();
        reject(new Error('Download timeout'));
      });

      // Handle abort signal
      if (session.abortController) {
        session.abortController.signal.addEventListener('abort', () => {
          req.destroy();
          reject(new Error('Download aborted'));
        });
      }

      req.end();
    });
  }

  private async validateChecksum(filePath: string, expectedChecksum: string): Promise<void> {
    const crypto = require('crypto');
    const fileBuffer = await fs.readFile(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    const actualChecksum = hash.digest('hex');

    if (actualChecksum !== expectedChecksum) {
      throw new Error(`Checksum validation failed. Expected: ${expectedChecksum}, Actual: ${actualChecksum}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance  
export const downloadManager = new DownloadManager();