/**
 * Server-side polyfills for browser APIs
 * These polyfills ensure compatibility when running in Node.js environment
 */

// Polyfill for window object
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: {
      href: 'http://localhost:3001',
      origin: 'http://localhost:3001',
      hostname: 'localhost'
    }
  };
}

// Polyfill for navigator object
if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = {
    userAgent: 'Node.js'
  };
}

// Polyfill for localStorage
if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
}

// Polyfill for document (basic implementation)
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({}),
    body: {}
  };
}
