/**
 * Token Management for Unified Auth
 */

import CryptoJS from 'crypto-js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AuthToken, AuthConfig } from './types';

export class TokenManager {
  private storageKey = 'recoder_auth_token';
  private encryptionKey: string;
  
  constructor(private config: AuthConfig) {
    // Generate a consistent encryption key based on client ID
    this.encryptionKey = CryptoJS.SHA256(config.clientId).toString();
  }

  /**
   * Store authentication token securely
   */
  async storeToken(token: AuthToken): Promise<void> {
    try {
      const encrypted = this.encryptToken(token);
      
      switch (this.config.storage) {
        case 'localStorage':
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(this.storageKey, encrypted);
          }
          break;
          
        case 'file':
          await this.storeTokenToFile(encrypted);
          break;
          
        case 'memory':
        default:
          // Store in memory (session-based)
          (globalThis as any).__recoderAuthToken = encrypted;
          break;
      }
    } catch (error) {
      console.error('Failed to store token:', error);
      throw new Error('Token storage failed');
    }
  }

  /**
   * Retrieve authentication token
   */
  async getToken(): Promise<AuthToken | null> {
    try {
      let encrypted: string | null = null;
      
      switch (this.config.storage) {
        case 'localStorage':
          if (typeof window !== 'undefined' && window.localStorage) {
            encrypted = window.localStorage.getItem(this.storageKey);
          }
          break;
          
        case 'file':
          encrypted = await this.getTokenFromFile();
          break;
          
        case 'memory':
        default:
          encrypted = (globalThis as any).__recoderAuthToken || null;
          break;
      }

      if (!encrypted) {
        return null;
      }

      return this.decryptToken(encrypted);
    } catch (error) {
      console.error('Failed to retrieve token:', error);
      return null;
    }
  }

  /**
   * Clear stored authentication token
   */
  async clearToken(): Promise<void> {
    try {
      switch (this.config.storage) {
        case 'localStorage':
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(this.storageKey);
          }
          break;
          
        case 'file':
          await this.clearTokenFile();
          break;
          
        case 'memory':
        default:
          delete (globalThis as any).__recoderAuthToken;
          break;
      }
    } catch (error) {
      console.error('Failed to clear token:', error);
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: AuthToken): boolean {
    const now = new Date();
    const expiresAt = new Date(token.issuedAt.getTime() + token.expiresIn * 1000);
    
    // Add 5-minute buffer before actual expiration
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return now.getTime() > (expiresAt.getTime() - bufferTime);
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: AuthToken): Date {
    return new Date(token.issuedAt.getTime() + token.expiresIn * 1000);
  }

  // Private methods

  private encryptToken(token: AuthToken): string {
    const tokenString = JSON.stringify({
      ...token,
      issuedAt: token.issuedAt.toISOString(),
    });
    
    return CryptoJS.AES.encrypt(tokenString, this.encryptionKey).toString();
  }

  private decryptToken(encrypted: string): AuthToken {
    const decrypted = CryptoJS.AES.decrypt(encrypted, this.encryptionKey);
    const tokenString = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!tokenString) {
      throw new Error('Failed to decrypt token');
    }
    
    const tokenData = JSON.parse(tokenString);
    
    return {
      ...tokenData,
      issuedAt: new Date(tokenData.issuedAt),
    };
  }

  private async storeTokenToFile(encrypted: string): Promise<void> {
    const configDir = join(homedir(), '.recoder');
    const tokenFile = join(configDir, 'auth_token');
    
    try {
      // Ensure config directory exists
      await fs.mkdir(configDir, { recursive: true });
      
      // Write encrypted token to file
      await fs.writeFile(tokenFile, encrypted, { mode: 0o600 }); // Secure permissions
    } catch (error) {
      throw new Error('Failed to store token to file');
    }
  }

  private async getTokenFromFile(): Promise<string | null> {
    const tokenFile = join(homedir(), '.recoder', 'auth_token');
    
    try {
      return await fs.readFile(tokenFile, 'utf8');
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  private async clearTokenFile(): Promise<void> {
    const tokenFile = join(homedir(), '.recoder', 'auth_token');
    
    try {
      await fs.unlink(tokenFile);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}