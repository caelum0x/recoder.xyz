'use client';

import { useEffect } from 'react';
import { captureUTMParams } from '@/lib/utm';

/**
 * Invisible client component that captures UTM parameters from the URL
 * on first render and stores them in sessionStorage for later use during signup.
 */
export default function UTMCapture() {
  useEffect(() => {
    captureUTMParams();
  }, []);

  return null;
}
