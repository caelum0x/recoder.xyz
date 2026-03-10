/**
 * File system utilities for recoder.xyz
 */

import { promises as fs } from 'fs';
import * as path from 'path';

// Ensures cache directory exists and returns its path
export async function getCacheDirectoryPath(storagePath: string): Promise<string> {
  const cacheDir = path.join(storagePath, 'cache');
  try {
    await fs.mkdir(cacheDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
  return cacheDir;
}

// Checks whether a file exists at the given path
export async function fileExistsAtPath(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Extracts base URI from a JWT token's payload (baseUri or iss field), with fallback
const DEFAULT_KILO_BASE_URI = 'https://api.kilocode.com';

export function getKiloBaseUriFromToken(token: string): string {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return DEFAULT_KILO_BASE_URI;
    }
    // Base64url decode the payload (second segment)
    const payload = parts[1]!;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    const claims = JSON.parse(decoded);

    if (typeof claims.baseUri === 'string' && claims.baseUri) {
      return claims.baseUri;
    }
    if (typeof claims.iss === 'string' && claims.iss) {
      return claims.iss;
    }
    return DEFAULT_KILO_BASE_URI;
  } catch {
    return DEFAULT_KILO_BASE_URI;
  }
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

// Estimates token count using the ~4 characters per token heuristic (reasonable for English text with LLM tokenizers)
export function countTokens(content: any): number {
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }
  return 0;
}

// Streaming XML tag matcher — buffers text across update() calls, finds <tagName>...</tagName> matches
export class XmlMatcher {
  private tagName: string;
  private callback: (match: { matched: boolean; data: string }) => void;
  private buffer: string;
  private matches: string[];

  constructor(tagName?: string, callback?: (match: { matched: boolean; data: string }) => void) {
    this.tagName = tagName || '';
    this.callback = callback || (() => {});
    this.buffer = '';
    this.matches = [];
  }

  update(text: string) {
    if (!this.tagName) {
      return undefined;
    }

    this.buffer += text;

    // Scan for complete <tagName>...</tagName> pairs in the buffer
    const pattern = new RegExp(
      `<${this.escapeRegex(this.tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)</${this.escapeRegex(this.tagName)}>`,
      'g'
    );

    let match: RegExpExecArray | null;
    let lastMatchEnd = 0;

    while ((match = pattern.exec(this.buffer)) !== null) {
      const content = match[1]!;
      this.matches.push(content);
      lastMatchEnd = match.index + match[0].length;

      try {
        this.callback({ matched: true, data: content });
      } catch {
        // Callback errors should not break matching
      }
    }

    // Keep only the unmatched tail (which may contain a partial opening tag)
    if (lastMatchEnd > 0) {
      this.buffer = this.buffer.slice(lastMatchEnd);
    }

    return undefined;
  }

  final(): string[] {
    // Flush: run one last scan on whatever remains in the buffer
    if (this.buffer && this.tagName) {
      const pattern = new RegExp(
        `<${this.escapeRegex(this.tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)</${this.escapeRegex(this.tagName)}>`,
        'g'
      );
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(this.buffer)) !== null) {
        const content = match[1]!;
        this.matches.push(content);
        try {
          this.callback({ matched: true, data: content });
        } catch {
          // Callback errors should not break matching
        }
      }
      this.buffer = '';
    }
    return this.matches;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// i18n fallback — uses the key as the message and substitutes {param} placeholders
export function t(key: string, params?: any): string {
  if (params && typeof params === 'object') {
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