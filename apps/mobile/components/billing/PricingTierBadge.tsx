/**
 * Pricing Tier Badge Component
 * 
 * Matches frontend TierBadge component exactly
 * Shows icon badges for pricing cards (24px height for lg size)
 */

import * as React from 'react';
import { Image, type ImageSourcePropType, View } from 'react-native';

interface PricingTierBadgeProps {
  /** Plan name (e.g., 'Basic', 'Plus', 'Pro', 'Ultra') */
  planName: string;
  /** Size variant - matches frontend: xxs, xs, sm, md, lg, xl */
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const sizeConfig = {
  xxs: { height: 12 },
  xs: { height: 14 },
  sm: { height: 16 },
  md: { height: 20 },
  lg: { height: 24 }, // Matches frontend lg size
  xl: { height: 32 }, // Larger size for billing status page
};

/**
 * PricingTierBadge Component
 * 
 * Displays tier icon badge for pricing cards.
 * Matches frontend TierBadge behavior exactly.
 */
export function PricingTierBadge({
  planName,
  size = 'lg',
}: PricingTierBadgeProps) {
  const plan = planName?.toLowerCase();
  const config = sizeConfig[size];

  let tierSource: ImageSourcePropType | null = null;
  
  if (plan?.includes('ultra')) {
    tierSource = require('@/assets/brand/raster/tiers/ultra.png');
  } else if (plan?.includes('pro') || plan?.includes('business') || plan?.includes('enterprise') || plan?.includes('scale') || plan?.includes('max')) {
    tierSource = require('@/assets/brand/raster/tiers/pro.png');
  } else if (plan?.includes('plus')) {
    tierSource = require('@/assets/brand/raster/tiers/plus.png');
  } else if (plan?.includes('free') || plan?.includes('basic')) {
    tierSource = require('@/assets/brand/raster/tiers/basic.png');
  }

  if (!tierSource) {
    return null;
  }

  // Frontend uses height for both width and height, maintaining aspect ratio
  // SVGs have different widths (50, 55, 59, 63) but same height (24)
  // For React Native, we need to calculate width based on aspect ratio
  // Typical SVG aspect ratio is ~2.5:1 (width:height), so we'll use a multiplier
  const aspectRatio = 2.5; // Approximate aspect ratio for tier badges
  const calculatedWidth = config.height * aspectRatio;
  
  return (
    <View style={{ height: config.height, width: calculatedWidth }}>
      <Image source={tierSource} style={{ width: calculatedWidth, height: config.height }} resizeMode="contain" />
    </View>
  );
}
