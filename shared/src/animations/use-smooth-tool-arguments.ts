'use client';

import { useState, useEffect, useRef } from 'react';
import { createUseSmoothToolField } from './use-smooth-tool-arguments.impl';

export type { SmoothToolConfig } from './use-smooth-tool-arguments.impl';

/**
 * Hook for smooth progressive reveal of tool call arguments (React binding).
 * Reveals one field at a time with smooth transitions.
 *
 * For Preact apps that want to avoid `preact/compat`, import the same hook from
 * `@recoder/shared/animations/preact` instead.
 */
export const useSmoothToolField = createUseSmoothToolField({ useState, useEffect, useRef });
