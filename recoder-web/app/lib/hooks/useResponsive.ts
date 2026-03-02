import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Responsive breakpoint definitions
 * Matches Tailwind CSS default breakpoints
 */
export const BREAKPOINTS = {
  xs: 320,   // Extra small phones
  sm: 640,   // Small phones / large phones in landscape
  md: 768,   // Tablets
  lg: 1024,  // Small laptops / tablets in landscape
  xl: 1280,  // Desktops
  '2xl': 1536, // Large desktops
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface ResponsiveState {
  /** Current viewport width */
  width: number;
  /** Current viewport height */
  height: number;
  /** Current breakpoint name */
  breakpoint: Breakpoint;
  /** Device type based on breakpoint */
  deviceType: DeviceType;
  /** Whether the device is in portrait orientation */
  isPortrait: boolean;
  /** Whether the device is in landscape orientation */
  isLandscape: boolean;
  /** Whether the viewport is mobile-sized (< 640px) */
  isMobile: boolean;
  /** Whether the viewport is tablet-sized (640px - 1024px) */
  isTablet: boolean;
  /** Whether the viewport is desktop-sized (>= 1024px) */
  isDesktop: boolean;
  /** Whether touch is the primary input method */
  isTouchDevice: boolean;
  /** Safe area insets for notched devices */
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/**
 * Get the current breakpoint based on viewport width
 */
function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

/**
 * Get the device type based on viewport width
 */
function getDeviceType(width: number): DeviceType {
  if (width < BREAKPOINTS.sm) return 'mobile';
  if (width < BREAKPOINTS.lg) return 'tablet';
  return 'desktop';
}

/**
 * Parse CSS pixel value from computed style
 */
function parseCssPixelValue(value: string): number {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Get safe area insets from CSS environment variables
 */
function getSafeAreaInsets(): ResponsiveState['safeAreaInsets'] {
  if (typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const style = getComputedStyle(document.documentElement);

  return {
    top: parseCssPixelValue(style.getPropertyValue('--safe-area-inset-top') || '0'),
    right: parseCssPixelValue(style.getPropertyValue('--safe-area-inset-right') || '0'),
    bottom: parseCssPixelValue(style.getPropertyValue('--safe-area-inset-bottom') || '0'),
    left: parseCssPixelValue(style.getPropertyValue('--safe-area-inset-left') || '0'),
  };
}

/**
 * Check if the device supports touch input
 */
function checkTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as Navigator & { msMaxTouchPoints?: number }).msMaxTouchPoints! > 0
  );
}

/**
 * Hook that provides responsive state and utilities
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isMobile, isTablet, isDesktop, deviceType } = useResponsive();
 *
 *   if (isMobile) {
 *     return <MobileLayout />;
 *   }
 *
 *   return <DesktopLayout />;
 * }
 * ```
 */
export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const height = typeof window !== 'undefined' ? window.innerHeight : 768;
    const breakpoint = getBreakpoint(width);
    const deviceType = getDeviceType(width);

    return {
      width,
      height,
      breakpoint,
      deviceType,
      isPortrait: height > width,
      isLandscape: width > height,
      isMobile: deviceType === 'mobile',
      isTablet: deviceType === 'tablet',
      isDesktop: deviceType === 'desktop',
      isTouchDevice: checkTouchDevice(),
      safeAreaInsets: getSafeAreaInsets(),
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const breakpoint = getBreakpoint(width);
      const deviceType = getDeviceType(width);

      setState({
        width,
        height,
        breakpoint,
        deviceType,
        isPortrait: height > width,
        isLandscape: width > height,
        isMobile: deviceType === 'mobile',
        isTablet: deviceType === 'tablet',
        isDesktop: deviceType === 'desktop',
        isTouchDevice: checkTouchDevice(),
        safeAreaInsets: getSafeAreaInsets(),
      });
    };

    // Add event listeners
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Initial update
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return state;
}

/**
 * Hook that returns true if the viewport matches a media query
 *
 * @example
 * ```tsx
 * const isWide = useMediaQuery('(min-width: 1024px)');
 * const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }

    // Legacy browsers
    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
  }, [query]);

  return matches;
}

/**
 * Hook that returns true if the viewport is at least the given breakpoint
 *
 * @example
 * ```tsx
 * const isAtLeastMedium = useBreakpoint('md');
 * const isAtLeastLarge = useBreakpoint('lg');
 * ```
 */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[breakpoint]}px)`);
}

/**
 * Hook that returns the value for the current breakpoint
 *
 * @example
 * ```tsx
 * const columns = useBreakpointValue({
 *   xs: 1,
 *   sm: 2,
 *   md: 3,
 *   lg: 4,
 * });
 * ```
 */
export function useBreakpointValue<T>(values: Partial<Record<Breakpoint, T>>): T | undefined {
  const { breakpoint } = useResponsive();

  return useMemo(() => {
    // Find the value for the current or lower breakpoint
    const breakpointOrder: Breakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];
    const currentIndex = breakpointOrder.indexOf(breakpoint);

    for (let i = currentIndex; i < breakpointOrder.length; i++) {
      const bp = breakpointOrder[i];
      if (values[bp] !== undefined) {
        return values[bp];
      }
    }

    return undefined;
  }, [breakpoint, values]);
}

/**
 * Hook that returns true if user prefers reduced motion
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Hook that returns true if device is in standalone (PWA) mode
 */
export function useIsStandalone(): boolean {
  return useMediaQuery('(display-mode: standalone)');
}
