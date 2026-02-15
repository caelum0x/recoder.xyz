/**
 * ModeLogo - Displays the Recoder Basic or Advanced raster logo
 * 
 * Uses theme-appropriate variants (dark on light, light on dark)
 */

import React from 'react';
import { Image } from 'react-native';
import { useColorScheme } from 'nativewind';

interface ModeLogoProps {
  mode: 'basic' | 'advanced';
  height?: number;
}

// Aspect ratios from the actual SVG viewBox dimensions
const BASIC_ASPECT = 985 / 144; // ~6.84
const ADVANCED_ASPECT = 1395 / 143; // ~9.76

export function ModeLogo({ mode, height = 14 }: ModeLogoProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Calculate width from aspect ratio
  const aspectRatio = mode === 'advanced' ? ADVANCED_ASPECT : BASIC_ASPECT;
  const width = Math.round(height * aspectRatio);

  // Select theme-appropriate raster variant
  if (mode === 'basic') {
    const source = isDark
      ? require('@/assets/brand/raster/basic-light.png')
      : require('@/assets/brand/raster/basic-dark.png');
    return <Image source={source} style={{ width, height }} resizeMode="contain" />;
  }

  const source = isDark
    ? require('@/assets/brand/raster/advanced-light.png')
    : require('@/assets/brand/raster/advanced-dark.png');
  return <Image source={source} style={{ width, height }} resizeMode="contain" />;
}

export default ModeLogo;
