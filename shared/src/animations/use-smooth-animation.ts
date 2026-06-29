'use client';

import { useRef, useCallback } from 'react';
import { createUseSmoothAnimation } from './use-smooth-animation.impl';

export type { SmoothAnimationConfig } from './use-smooth-animation.impl';

/**
 * Hook for smooth character-by-character text reveal animation (React binding).
 * Optimized for performance with requestAnimationFrame.
 *
 * For Preact apps that want to avoid `preact/compat`, import the same hook from
 * `@recoder/shared/animations/preact` instead.
 */
export const useSmoothAnimation = createUseSmoothAnimation({ useRef, useCallback });
