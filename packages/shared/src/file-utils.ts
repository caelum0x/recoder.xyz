/**
 * File system utilities for recoder.xyz
 */

import { promises as fs } from 'fs';
import * as path from 'path';

// Stub implementation for getCacheDirectoryPath
export async function getCacheDirectoryPath(storagePath: string): Promise<string> {
  const cacheDir = path.join(storagePath, 'cache');
  try {
    await fs.mkdir(cacheDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
  return cacheDir;
}

// Stub implementation for fileExistsAtPath
export async function fileExistsAtPath(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Stub implementation for getKiloBaseUriFromToken
export function getKiloBaseUriFromToken(token: string): string {
  // This is a stub implementation
  // The actual implementation would parse the token and extract the base URI
  return 'https://api.kilocode.com';
}

// Safe JSON writing utility
export async function safeWriteJson(filePath: string, data: any): Promise<void> {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonString, 'utf8');
  } catch (error) {
    console.error('Failed to write JSON file:', error);
    throw error;
  }
}

// Token counting utility (stub implementation)
export function countTokens(content: any): number {
  // This is a stub implementation
  // Actual implementation would use tiktoken or similar
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }
  return 0;
}

// XML Matcher utility (stub implementation)
export class XmlMatcher {
  private tagName: string;
  private callback: Function;
  
  constructor(tagName?: string, callback?: Function) {
    // Stub implementation that accepts optional parameters
    this.tagName = tagName || '';
    this.callback = callback || (() => {});
  }
  
  update(text: string) {
    // Stub implementation
    // Return the callback result if provided, otherwise undefined
    if (this.callback && text) {
      try {
        return this.callback({ matched: false, data: text });
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  
  final() {
    // Stub implementation
    return [];
  }
}

// Internationalization function (stub)
export function t(key: string, params?: any): string {
  // This is a stub implementation
  // In a real implementation, this would perform i18n translation with parameter substitution
  if (params && typeof params === 'object') {
    // Simple parameter replacement for error messages
    let message = key;
    Object.keys(params).forEach(param => {
      message = message.replace(`{${param}}`, String(params[param]));
    });
    return message;
  }
  return key;
}

// Context proxy stub
export class ContextProxy {
  static instance = new ContextProxy();
  
  globalStorageUri = {
    fsPath: process.cwd() + '/.cache'
  };
}

// Constants and functions are now properly exported from reasoning.ts - removing duplicates