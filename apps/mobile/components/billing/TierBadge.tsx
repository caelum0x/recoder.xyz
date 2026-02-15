/**
 * TierBadge Component
 * 
 * Reusable component for displaying tier/plan badges with consistent styling.
 * Matches the frontend TierBadge implementation.
 * 
 * Usage:
 * ```tsx
 * <TierBadge planName="Plus" size="sm" variant="default" />
 * <TierBadge planName="Pro" size="xs" variant="circle" />
 * ```
 */

import * as React from 'react';
import { Image, type ImageSourcePropType, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { getPlanIcon } from '@/lib/billing/plan-utils';

export type TierBadgeSize = 'xxs' | 'xs' | 'sm' | 'md' | 'lg';
export type TierBadgeVariant = 'default' | 'circle';

interface TierBadgeProps {
    /** Plan name (e.g., 'Basic', 'Plus', 'Pro', 'Ultra') */
    planName: string;
    /** Size variant */
    size?: TierBadgeSize;
    /** Visual variant */
    variant?: TierBadgeVariant;
    /** Additional className */
    className?: string;
    /** Local mode flag */
    isLocal?: boolean;
}

const sizeConfig = {
    xxs: {
        height: 16,
        circleSize: 16,
    },
    xs: {
        height: 18,
        circleSize: 20,
    },
    sm: {
        height: 22,
        circleSize: 24,
    },
    md: {
        height: 28,
        circleSize: 32,
    },
    lg: {
        height: 32,
        circleSize: 40,
    },
};

/**
 * TierBadge Component
 * 
 * A reusable component for displaying tier/plan badges with consistent styling.
 */
export function TierBadge({
    planName,
    size = 'sm',
    variant = 'default',
    className,
    isLocal = false,
}: TierBadgeProps) {
    const { colorScheme } = useColorScheme();
    const planIconType = getPlanIcon(planName, isLocal);
    const config = sizeConfig[size];

    // If no icon (shouldn't happen now that Basic has an icon), return null
    if (!planIconType) {
        return null;
    }

    const tierSource: ImageSourcePropType =
        planIconType === 'ultra' ? require('@/assets/brand/raster/tiers/ultra.png') :
            planIconType === 'pro' ? require('@/assets/brand/raster/tiers/pro.png') :
                planIconType === 'plus' ? require('@/assets/brand/raster/tiers/plus.png') :
                    require('@/assets/brand/raster/tiers/basic.png');

    // Circle variant - white circle with icon inside
    if (variant === 'circle') {
        return (
            <View
                className="flex items-center justify-center bg-white rounded-full flex-shrink-0"
                style={{
                    width: config.circleSize,
                    height: config.circleSize,
                }}
            >
                <Image
                    source={tierSource}
                    style={{ width: config.height * 0.6, height: config.height * 0.6 }}
                    resizeMode="contain"
                />
            </View>
        );
    }

    const iconWidths = {
        basic: (50 / 24) * config.height,
        plus: (59 / 24) * config.height,
        pro: (55 / 24) * config.height,
        ultra: (63 / 24) * config.height,
    };
    const typeKey = (planIconType === 'basic' || planIconType === 'plus' || planIconType === 'pro' || planIconType === 'ultra')
        ? planIconType
        : 'basic';
    const width = iconWidths[typeKey];

    return (
        <Image source={tierSource} style={{ width, height: config.height }} resizeMode="contain" />
    );
}
