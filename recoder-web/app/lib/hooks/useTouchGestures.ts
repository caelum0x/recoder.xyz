import { useCallback, useEffect, useRef, useState } from 'react';

export interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface SwipeEvent {
  direction: 'left' | 'right' | 'up' | 'down';
  distance: number;
  velocity: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface PinchEvent {
  scale: number;
  centerX: number;
  centerY: number;
  deltaScale: number;
}

export interface LongPressEvent {
  x: number;
  y: number;
  target: EventTarget | null;
}

export interface TouchGestureOptions {
  /** Minimum distance in pixels to trigger a swipe (default: 50) */
  swipeThreshold?: number;
  /** Minimum velocity in px/ms to trigger a swipe (default: 0.3) */
  swipeVelocityThreshold?: number;
  /** Duration in ms to trigger a long press (default: 500) */
  longPressDuration?: number;
  /** Enable swipe detection (default: true) */
  enableSwipe?: boolean;
  /** Enable pinch/zoom detection (default: true) */
  enablePinch?: boolean;
  /** Enable long press detection (default: true) */
  enableLongPress?: boolean;
  /** Prevent default touch behavior (default: false) */
  preventDefault?: boolean;
}

export interface TouchGestureCallbacks {
  onSwipe?: (event: SwipeEvent) => void;
  onSwipeLeft?: (event: SwipeEvent) => void;
  onSwipeRight?: (event: SwipeEvent) => void;
  onSwipeUp?: (event: SwipeEvent) => void;
  onSwipeDown?: (event: SwipeEvent) => void;
  onPinch?: (event: PinchEvent) => void;
  onPinchStart?: () => void;
  onPinchEnd?: (finalScale: number) => void;
  onLongPress?: (event: LongPressEvent) => void;
  onTap?: (x: number, y: number) => void;
  onDoubleTap?: (x: number, y: number) => void;
}

export interface TouchGestureState {
  isSwiping: boolean;
  isPinching: boolean;
  isLongPressing: boolean;
  swipeProgress: { x: number; y: number } | null;
  pinchScale: number;
}

/**
 * Hook for detecting and handling touch gestures
 *
 * @example
 * ```tsx
 * function SwipeablePanel() {
 *   const { ref, state } = useTouchGestures({
 *     onSwipeLeft: () => navigateNext(),
 *     onSwipeRight: () => navigatePrev(),
 *     onLongPress: (e) => showContextMenu(e.x, e.y),
 *   });
 *
 *   return (
 *     <div ref={ref} style={{ transform: `translateX(${state.swipeProgress?.x || 0}px)` }}>
 *       Content
 *     </div>
 *   );
 * }
 * ```
 */
export function useTouchGestures<T extends HTMLElement = HTMLElement>(
  callbacks: TouchGestureCallbacks = {},
  options: TouchGestureOptions = {}
): {
  ref: React.RefObject<T>;
  state: TouchGestureState;
} {
  const {
    swipeThreshold = 50,
    swipeVelocityThreshold = 0.3,
    longPressDuration = 500,
    enableSwipe = true,
    enablePinch = true,
    enableLongPress = true,
    preventDefault = false,
  } = options;

  const ref = useRef<T>(null);
  const touchStartRef = useRef<TouchPoint | null>(null);
  const touchesRef = useRef<TouchList | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const lastPinchScaleRef = useRef<number>(1);

  const [state, setState] = useState<TouchGestureState>({
    isSwiping: false,
    isPinching: false,
    isLongPressing: false,
    swipeProgress: null,
    pinchScale: 1,
  });

  // Calculate distance between two touch points
  const getDistance = useCallback((touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Calculate center point between two touches
  const getCenter = useCallback((touch1: Touch, touch2: Touch): { x: number; y: number } => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    };
  }, []);

  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (preventDefault) {
        e.preventDefault();
      }

      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: Date.now(),
      };
      touchesRef.current = e.touches;

      // Start long press timer
      if (enableLongPress && e.touches.length === 1) {
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          if (touchStartRef.current) {
            setState((prev) => ({ ...prev, isLongPressing: true }));
            callbacks.onLongPress?.({
              x: touchStartRef.current.x,
              y: touchStartRef.current.y,
              target: e.target,
            });
          }
        }, longPressDuration);
      }

      // Initialize pinch
      if (enablePinch && e.touches.length === 2) {
        clearLongPressTimer();
        initialPinchDistanceRef.current = getDistance(e.touches[0], e.touches[1]);
        lastPinchScaleRef.current = 1;
        setState((prev) => ({ ...prev, isPinching: true, pinchScale: 1 }));
        callbacks.onPinchStart?.();
      }
    },
    [
      preventDefault,
      enableLongPress,
      enablePinch,
      longPressDuration,
      clearLongPressTimer,
      getDistance,
      callbacks,
    ]
  );

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (preventDefault) {
        e.preventDefault();
      }

      const touchStart = touchStartRef.current;
      if (!touchStart) return;

      // Clear long press if moved too far
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - touchStart.x);
        const dy = Math.abs(touch.clientY - touchStart.y);

        if (dx > 10 || dy > 10) {
          clearLongPressTimer();
          setState((prev) => ({ ...prev, isLongPressing: false }));
        }

        // Update swipe progress
        if (enableSwipe) {
          setState((prev) => ({
            ...prev,
            isSwiping: true,
            swipeProgress: {
              x: touch.clientX - touchStart.x,
              y: touch.clientY - touchStart.y,
            },
          }));
        }
      }

      // Handle pinch
      if (enablePinch && e.touches.length === 2 && initialPinchDistanceRef.current !== null) {
        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const scale = currentDistance / initialPinchDistanceRef.current;
        const deltaScale = scale - lastPinchScaleRef.current;
        const center = getCenter(e.touches[0], e.touches[1]);

        lastPinchScaleRef.current = scale;

        setState((prev) => ({ ...prev, pinchScale: scale }));
        callbacks.onPinch?.({
          scale,
          centerX: center.x,
          centerY: center.y,
          deltaScale,
        });
      }
    },
    [
      preventDefault,
      enableSwipe,
      enablePinch,
      clearLongPressTimer,
      getDistance,
      getCenter,
      callbacks,
    ]
  );

  // Handle touch end
  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      clearLongPressTimer();

      const touchStart = touchStartRef.current;
      if (!touchStart) return;

      const touchEnd = e.changedTouches[0];
      const dx = touchEnd.clientX - touchStart.x;
      const dy = touchEnd.clientY - touchStart.y;
      const dt = Date.now() - touchStart.timestamp;

      // Handle pinch end
      if (state.isPinching) {
        callbacks.onPinchEnd?.(lastPinchScaleRef.current);
        initialPinchDistanceRef.current = null;
        setState((prev) => ({ ...prev, isPinching: false, pinchScale: 1 }));
      }

      // Check for tap/double tap
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
        const now = Date.now();
        const lastTap = lastTapRef.current;

        if (
          lastTap &&
          now - lastTap.time < 300 &&
          Math.abs(touchEnd.clientX - lastTap.x) < 20 &&
          Math.abs(touchEnd.clientY - lastTap.y) < 20
        ) {
          // Double tap
          callbacks.onDoubleTap?.(touchEnd.clientX, touchEnd.clientY);
          lastTapRef.current = null;
        } else {
          // Single tap
          callbacks.onTap?.(touchEnd.clientX, touchEnd.clientY);
          lastTapRef.current = {
            time: now,
            x: touchEnd.clientX,
            y: touchEnd.clientY,
          };
        }
      }

      // Check for swipe
      if (enableSwipe && !state.isPinching) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        const velocity = distance / dt;

        if (distance >= swipeThreshold && velocity >= swipeVelocityThreshold) {
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          let direction: SwipeEvent['direction'];

          if (angle >= -45 && angle < 45) {
            direction = 'right';
          } else if (angle >= 45 && angle < 135) {
            direction = 'down';
          } else if (angle >= -135 && angle < -45) {
            direction = 'up';
          } else {
            direction = 'left';
          }

          const swipeEvent: SwipeEvent = {
            direction,
            distance,
            velocity,
            startX: touchStart.x,
            startY: touchStart.y,
            endX: touchEnd.clientX,
            endY: touchEnd.clientY,
          };

          callbacks.onSwipe?.(swipeEvent);

          switch (direction) {
            case 'left':
              callbacks.onSwipeLeft?.(swipeEvent);
              break;
            case 'right':
              callbacks.onSwipeRight?.(swipeEvent);
              break;
            case 'up':
              callbacks.onSwipeUp?.(swipeEvent);
              break;
            case 'down':
              callbacks.onSwipeDown?.(swipeEvent);
              break;
          }
        }
      }

      // Reset state
      touchStartRef.current = null;
      touchesRef.current = null;
      setState({
        isSwiping: false,
        isPinching: false,
        isLongPressing: false,
        swipeProgress: null,
        pinchScale: 1,
      });
    },
    [
      enableSwipe,
      swipeThreshold,
      swipeVelocityThreshold,
      clearLongPressTimer,
      state.isPinching,
      callbacks,
    ]
  );

  // Handle touch cancel
  const handleTouchCancel = useCallback(() => {
    clearLongPressTimer();
    touchStartRef.current = null;
    touchesRef.current = null;
    initialPinchDistanceRef.current = null;
    setState({
      isSwiping: false,
      isPinching: false,
      isLongPressing: false,
      swipeProgress: null,
      pinchScale: 1,
    });
  }, [clearLongPressTimer]);

  // Attach event listeners
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: !preventDefault });
    element.addEventListener('touchmove', handleTouchMove, { passive: !preventDefault });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
      clearLongPressTimer();
    };
  }, [
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    preventDefault,
    clearLongPressTimer,
  ]);

  return { ref, state };
}

/**
 * Simple hook for detecting horizontal swipes
 *
 * @example
 * ```tsx
 * const ref = useHorizontalSwipe({
 *   onSwipeLeft: () => nextPage(),
 *   onSwipeRight: () => prevPage(),
 * });
 *
 * return <div ref={ref}>Swipeable content</div>;
 * ```
 */
export function useHorizontalSwipe<T extends HTMLElement = HTMLElement>(
  callbacks: Pick<TouchGestureCallbacks, 'onSwipeLeft' | 'onSwipeRight'>
): React.RefObject<T> {
  const { ref } = useTouchGestures<T>(callbacks, {
    enablePinch: false,
    enableLongPress: false,
  });

  return ref;
}

/**
 * Hook for detecting pinch/zoom gestures
 *
 * @example
 * ```tsx
 * const { ref, scale } = usePinchZoom({
 *   onPinch: (e) => console.log('Pinch scale:', e.scale),
 * });
 *
 * return (
 *   <div ref={ref} style={{ transform: `scale(${scale})` }}>
 *     Zoomable content
 *   </div>
 * );
 * ```
 */
export function usePinchZoom<T extends HTMLElement = HTMLElement>(
  callbacks: Pick<TouchGestureCallbacks, 'onPinch' | 'onPinchStart' | 'onPinchEnd'>
): {
  ref: React.RefObject<T>;
  scale: number;
} {
  const { ref, state } = useTouchGestures<T>(callbacks, {
    enableSwipe: false,
    enableLongPress: false,
    preventDefault: true,
  });

  return { ref, scale: state.pinchScale };
}
