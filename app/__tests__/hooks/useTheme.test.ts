/**
 * useTheme Hook Tests
 * Tests theme management, persistence, and system preference detection
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useTheme } from '@/hooks/useTheme';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('useTheme Hook', () => {
  beforeEach(() => {
    localStorageMock.clear();
    document.documentElement.className = '';
  });

  test('should initialize with system theme by default', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark'); // Based on mock
  });

  test('should load saved theme from localStorage', () => {
    localStorageMock.setItem('recoder-theme', 'light');

    const { result } = renderHook(() => useTheme());

    waitFor(() => {
      expect(result.current.theme).toBe('light');
      expect(result.current.resolvedTheme).toBe('light');
    });
  });

  test('should change theme and persist to localStorage', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(localStorageMock.getItem('recoder-theme')).toBe('dark');
  });

  test('should apply theme class to document element', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    waitFor(() => {
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  test('should resolve system theme correctly', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('system');
    });

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark'); // Based on mock
  });

  test('should provide available themes', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.themes).toEqual(['light', 'dark', 'system']);
  });

  test('should set mounted flag after initialization', () => {
    const { result } = renderHook(() => useTheme());

    waitFor(() => {
      expect(result.current.mounted).toBe(true);
    });
  });

  test('should not override an explicit theme choice when the OS preference flips', () => {
    // Reproduces the stale-closure bug: mount on 'system', user explicitly picks
    // 'light', then the OS flips to dark. The system listener must respect the
    // live preference and leave the explicit 'light' choice intact.
    localStorageMock.setItem('recoder-theme', 'system');

    let changeHandler: ((e: MediaQueryListEvent) => void) | undefined;
    let systemMatches = true; // OS currently in dark mode
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (query: string) => ({
        get matches() {
          return query === '(prefers-color-scheme: dark)' ? systemMatches : false;
        },
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
          changeHandler = cb;
        },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })
    );

    const { result } = renderHook(() => useTheme());

    // User explicitly switches to Light after mount.
    act(() => {
      result.current.setTheme('light');
    });
    expect(result.current.resolvedTheme).toBe('light');

    // OS flips to dark and fires the media-query change event.
    systemMatches = true;
    act(() => {
      changeHandler?.({ matches: true } as MediaQueryListEvent);
    });

    // The explicit Light choice must survive.
    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
  });

  test('should follow the OS when the user switches to system after mount', () => {
    localStorageMock.setItem('recoder-theme', 'light');

    let changeHandler: ((e: MediaQueryListEvent) => void) | undefined;
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
          changeHandler = cb;
        },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })
    );

    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('system');
    });

    // OS flips to light; the app should follow because current preference is 'system'.
    act(() => {
      changeHandler?.({ matches: false } as MediaQueryListEvent);
    });

    expect(result.current.resolvedTheme).toBe('light');
  });

  test('should switch between themes smoothly', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });
    expect(result.current.resolvedTheme).toBe('light');

    act(() => {
      result.current.setTheme('dark');
    });
    expect(result.current.resolvedTheme).toBe('dark');

    act(() => {
      result.current.setTheme('system');
    });
    expect(result.current.theme).toBe('system');
  });
});
