import { useRef, useCallback } from 'preact/hooks';
import { createUseSmoothAnimation } from '../use-smooth-animation.impl';

export type { SmoothAnimationConfig } from '../use-smooth-animation.impl';

/**
 * Preact binding of the smooth animation hook.
 *
 * Imports hook primitives directly from `preact/hooks`, so a Preact app can use
 * this WITHOUT pulling in `preact/compat`. Shares the exact implementation with
 * the React entry (`../use-smooth-animation`).
 */
export const useSmoothAnimation = createUseSmoothAnimation({ useRef, useCallback });
