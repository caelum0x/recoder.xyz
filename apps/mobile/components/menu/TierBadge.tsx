import * as React from 'react';
import { Image, type ImageSourcePropType, View } from 'react-native';
import type { TierType } from './types';

interface TierBadgeProps {
  tier: TierType;
  size?: 'small' | 'large';
}

/**
 * TierBadge Component
 * 
 * Displays tier badge SVG which includes both icon and tier name.
 * Four variants: Basic (gray), Plus (pink gradient), Pro (orange gradient), Ultra (rainbow gradient).
 * 
 * The SVG badges are pre-designed and contain:
 * - Recoder icon
 * - Tier name text
 * - Background styling
 * 
 * Size variants:
 * - Small: Height 20px (for pricing cards, billing page)
 * - Large: Height 24px (for larger displays)
 */
export function TierBadge({ tier, size = 'small' }: TierBadgeProps) {
  const isSmall = size === 'small';
  
  // SVG badges have fixed aspect ratios:
  // Basic: 50x24, Plus: 59x24, Pro: 55x24, Ultra: 63x24
  // Scale based on desired height
  const height = isSmall ? 20 : 24;
  
  const tierSource: ImageSourcePropType = 
    tier === 'Basic' ? require('@/assets/brand/raster/tiers/basic.png') :
    tier === 'Plus' ? require('@/assets/brand/raster/tiers/plus.png') : 
    tier === 'Pro' ? require('@/assets/brand/raster/tiers/pro.png') : 
    require('@/assets/brand/raster/tiers/ultra.png');

  // Calculate width based on original SVG aspect ratio
  const getWidth = () => {
    const aspectRatios = {
      Basic: 50 / 24,
      Plus: 59 / 24,
      Pro: 55 / 24,
      Ultra: 63 / 24,
    };
    return Math.round(height * aspectRatios[tier]);
  };

  const width = getWidth();

  return (
    <View style={{ height, width }}>
      <Image source={tierSource} style={{ width, height }} resizeMode="contain" />
    </View>
  );
}
