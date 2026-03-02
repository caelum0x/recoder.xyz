/**
 * Vitest Setup File
 * Global test configuration and mocks for the app (Hub) service.
 * Mirrors jest.setup.js but uses vitest globals.
 */

import { vi } from 'vitest';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    };
  },
  usePathname() {
    return '/';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

// Browser-specific mocks — only apply in jsdom environment
if (typeof window !== 'undefined') {
  // Mock matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  };
  Object.defineProperty(global, 'localStorage', { value: localStorageMock });

  // Mock IntersectionObserver
  class MockIntersectionObserver {
    disconnect() {}
    observe() {}
    takeRecords() {
      return [];
    }
    unobserve() {}
  }
  Object.defineProperty(global, 'IntersectionObserver', {
    value: MockIntersectionObserver,
  });

  // Mock ResizeObserver
  class MockResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  }
  Object.defineProperty(global, 'ResizeObserver', {
    value: MockResizeObserver,
  });
}
