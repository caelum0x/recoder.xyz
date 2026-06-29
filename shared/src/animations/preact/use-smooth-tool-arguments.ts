import { useState, useEffect, useRef } from 'preact/hooks';
import { createUseSmoothToolField } from '../use-smooth-tool-arguments.impl';

export type { SmoothToolConfig } from '../use-smooth-tool-arguments.impl';

/**
 * Preact binding of the smooth tool-argument reveal hook.
 *
 * Imports hook primitives directly from `preact/hooks`, so a Preact app can use
 * this WITHOUT pulling in `preact/compat`. Shares the exact implementation with
 * the React entry (`../use-smooth-tool-arguments`).
 */
export const useSmoothToolField = createUseSmoothToolField({ useState, useEffect, useRef });
