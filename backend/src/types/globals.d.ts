/**
 * Global type declarations for Node.js environment
 * Handles browser API mocks for server-side compatibility
 */

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