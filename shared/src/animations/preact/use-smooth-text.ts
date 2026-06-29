import { useState, useEffect, useRef } from 'preact/hooks';
import { createUseSmoothText } from '../use-smooth-text.impl';

export type { SmoothTextConfig } from '../use-smooth-text.impl';

/**
 * Preact binding of the smooth text reveal hook.
 *
 * Imports hook primitives directly from `preact/hooks`, so a Preact app can use
 * this WITHOUT pulling in `preact/compat`. Shares the exact implementation with
 * the React entry (`../use-smooth-text`).
 */
export const useSmoothText = createUseSmoothText({ useState, useEffect, useRef });
