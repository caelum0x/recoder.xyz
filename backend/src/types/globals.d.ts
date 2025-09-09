/**
 * Global type declarations for Node.js environment
 * Handles browser API mocks for server-side compatibility
 */

import { Request as ExpressRequest } from 'express';

declare global {
  var window: {
    location: {
      href: string;
      origin: string;
      hostname: string;
    };
  } | undefined;
  
  var navigator: {
    userAgent: string;
  } | undefined;
  
  var localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  } | undefined;
  
  var document: {
    createElement(tagName: string): any;
    body: any;
  } | undefined;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email: string;
      role: string;
      subscriptionPlan?: string;
      subscriptionStatus?: string;
      emailVerified?: boolean;
    };
  }
}