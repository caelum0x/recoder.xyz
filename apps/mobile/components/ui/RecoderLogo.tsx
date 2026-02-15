import * as React from 'react';
import { Image, View, type ImageSourcePropType, type ViewProps, type ViewStyle } from 'react-native';

interface RecoderLogoProps extends Omit<ViewProps, 'style'> {
  size?: number;
  variant?: 'symbol' | 'logomark';
  className?: string;
  style?: ViewStyle;
  color?: 'light' | 'dark';
}

export function RecoderLogo({ 
  size = 24, 
  variant = 'symbol',
  className,
  style,
  color = 'dark',
  ...props 
}: RecoderLogoProps) {
  const symbolSource: ImageSourcePropType =
    color === 'dark'
      ? require('@/assets/images/AppIcon-Light.png')
      : require('@/assets/images/AppIcon-Dark.png');

  const logomarkSource: ImageSourcePropType =
    require('@/assets/brand/raster/recoder-logo-3.png');

  if (variant === 'logomark') {
    const logomarkWidth = Math.round(size * 1.83);
    const logomarkHeight = size;
    
    const containerStyle: ViewStyle = {
      width: logomarkWidth,
      height: logomarkHeight,
      flexShrink: 0,
      ...style,
    };
    return (
      <View 
        className={className}
        style={containerStyle}
        {...props}
      >
        <Image
          source={logomarkSource}
          style={{ width: logomarkWidth, height: logomarkHeight }}
          resizeMode="contain"
        />
      </View>
    );
  }

  const containerStyle: ViewStyle = {
    width: size,
    height: size,
    flexShrink: 0,
    ...style,
  };

  return (
    <View 
      className={className}
      style={containerStyle}
      {...props}
    >
      <Image
        source={symbolSource}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}
