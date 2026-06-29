'use client';

import { useState, useEffect, useRef } from 'react';
import { createUseSmoothText } from './use-smooth-text.impl';

export type { SmoothTextConfig } from './use-smooth-text.impl';

/**
 * Hook for smooth character-by-character text reveal (React binding).
 * Optimized for streaming text - only animates NEW characters when text is appended.
 *
 * For Preact apps that want to avoid `preact/compat`, import the same hook from
 * `@recoder/shared/animations/preact` instead.
 */
export const useSmoothText = createUseSmoothText({ useState, useEffect, useRef });
