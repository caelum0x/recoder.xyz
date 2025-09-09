import { StyleSheet, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const isIOS = Platform.OS === 'ios';
const isAndroid = Platform.OS === 'android';

// Device type detection
const isTablet = width >= 768;
const isSmallPhone = width < 375;
const isLargePhone = width > 414;

// Platform-specific constants
export const PlatformConstants = {
  isIOS,
  isAndroid,
  isTablet,
  isSmallPhone,
  isLargePhone,
  screenWidth: width,
  screenHeight: height,
  
  // iOS specific
  statusBarHeight: isIOS ? (height >= 812 ? 44 : 20) : 24,
  homeIndicatorHeight: isIOS ? (height >= 812 ? 34 : 0) : 0,
  
  // Navigation
  headerHeight: isIOS ? 44 : 56,
  tabBarHeight: isIOS ? (height >= 812 ? 83 : 49) : 56,
  
  // Common sizes
  borderRadius: {
    small: 4,
    medium: 8,
    large: 12,
    extraLarge: 16,
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  
  // Platform-specific spacing
  safeAreaTop: isIOS ? (height >= 812 ? 44 : 20) : 24,
  safeAreaBottom: isIOS ? (height >= 812 ? 34 : 0) : 0,
};

// Typography scales
export const Typography = {
  // iOS Typography Scale
  ios: {
    largeTitle: {
      fontSize: 34,
      lineHeight: 41,
      fontWeight: '700' as const,
      letterSpacing: 0.37,
    },
    title1: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '700' as const,
      letterSpacing: 0.36,
    },
    title2: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700' as const,
      letterSpacing: 0.35,
    },
    title3: {
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '600' as const,
      letterSpacing: 0.38,
    },
    headline: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600' as const,
      letterSpacing: -0.41,
    },
    body: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '400' as const,
      letterSpacing: -0.41,
    },
    callout: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '400' as const,
      letterSpacing: -0.32,
    },
    subhead: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '400' as const,
      letterSpacing: -0.24,
    },
    footnote: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '400' as const,
      letterSpacing: -0.08,
    },
    caption1: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    caption2: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: '400' as const,
      letterSpacing: 0.07,
    },
  },
  
  // Android Material Design Typography Scale
  android: {
    headline1: {
      fontSize: 96,
      lineHeight: 112,
      fontWeight: '300' as const,
      letterSpacing: -1.5,
    },
    headline2: {
      fontSize: 60,
      lineHeight: 72,
      fontWeight: '300' as const,
      letterSpacing: -0.5,
    },
    headline3: {
      fontSize: 48,
      lineHeight: 56,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    headline4: {
      fontSize: 34,
      lineHeight: 36,
      fontWeight: '400' as const,
      letterSpacing: 0.25,
    },
    headline5: {
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    headline6: {
      fontSize: 20,
      lineHeight: 32,
      fontWeight: '500' as const,
      letterSpacing: 0.15,
    },
    subtitle1: {
      fontSize: 16,
      lineHeight: 28,
      fontWeight: '400' as const,
      letterSpacing: 0.15,
    },
    subtitle2: {
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500' as const,
      letterSpacing: 0.1,
    },
    body1: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '400' as const,
      letterSpacing: 0.5,
    },
    body2: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '400' as const,
      letterSpacing: 0.25,
    },
    button: {
      fontSize: 14,
      lineHeight: 16,
      fontWeight: '500' as const,
      letterSpacing: 1.25,
      textTransform: 'uppercase' as const,
    },
    caption: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '400' as const,
      letterSpacing: 0.4,
    },
    overline: {
      fontSize: 10,
      lineHeight: 16,
      fontWeight: '400' as const,
      letterSpacing: 1.5,
      textTransform: 'uppercase' as const,
    },
  },
};

// Platform-specific styles
export const PlatformStyles = StyleSheet.create({
  // Container styles
  container: {
    flex: 1,
    backgroundColor: isIOS ? '#f2f2f7' : '#fafafa',
  },
  
  safeContainer: {
    flex: 1,
    paddingTop: PlatformConstants.safeAreaTop,
    paddingBottom: PlatformConstants.safeAreaBottom,
  },
  
  // Header styles
  header: {
    height: PlatformConstants.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: isIOS ? '#f9f9f9' : '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isIOS ? '#c6c6c8' : '#e0e0e0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 1,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...Platform.select({
      ios: {
        ...Typography.ios.headline,
        fontWeight: '600',
      },
      android: {
        ...Typography.android.headline6,
      },
    }),
  },
  
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Card styles
  card: {
    backgroundColor: '#ffffff',
    borderRadius: PlatformConstants.borderRadius.large,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  
  // Button styles
  primaryButton: {
    backgroundColor: isIOS ? '#007AFF' : '#2196F3',
    borderRadius: PlatformConstants.borderRadius.medium,
    paddingVertical: isIOS ? 12 : 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 2,
      },
    }),
  },
  
  primaryButtonText: {
    color: '#ffffff',
    ...Platform.select({
      ios: {
        ...Typography.ios.headline,
        fontWeight: '600',
      },
      android: {
        ...Typography.android.button,
      },
    }),
  },
  
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: isIOS ? '#007AFF' : '#2196F3',
    borderRadius: PlatformConstants.borderRadius.medium,
    paddingVertical: isIOS ? 11 : 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  secondaryButtonText: {
    color: isIOS ? '#007AFF' : '#2196F3',
    ...Platform.select({
      ios: {
        ...Typography.ios.headline,
        fontWeight: '600',
      },
      android: {
        ...Typography.android.button,
      },
    }),
  },
  
  // Input styles
  inputContainer: {
    marginVertical: 8,
  },
  
  inputLabel: {
    marginBottom: 8,
    ...Platform.select({
      ios: {
        ...Typography.ios.subhead,
        fontWeight: '600',
      },
      android: {
        ...Typography.android.subtitle2,
      },
    }),
  },
  
  textInput: {
    borderWidth: isIOS ? 1 : 0,
    borderColor: isIOS ? '#c6c6c8' : 'transparent',
    borderRadius: PlatformConstants.borderRadius.medium,
    paddingHorizontal: 12,
    paddingVertical: isIOS ? 12 : 16,
    backgroundColor: isIOS ? '#ffffff' : '#f5f5f5',
    ...Platform.select({
      ios: {
        ...Typography.ios.body,
      },
      android: {
        ...Typography.android.body1,
      },
    }),
  },
  
  // List styles
  listContainer: {
    flex: 1,
    backgroundColor: isIOS ? '#f2f2f7' : '#fafafa',
  },
  
  listItem: {
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isIOS ? '#c6c6c8' : '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  listItemTitle: {
    flex: 1,
    ...Platform.select({
      ios: {
        ...Typography.ios.body,
      },
      android: {
        ...Typography.android.body1,
      },
    }),
  },
  
  listItemSubtitle: {
    flex: 1,
    marginTop: 2,
    ...Platform.select({
      ios: {
        ...Typography.ios.footnote,
        color: '#8e8e93',
      },
      android: {
        ...Typography.android.caption,
        color: '#757575',
      },
    }),
  },
  
  // Tab bar styles
  tabBar: {
    backgroundColor: isIOS ? '#f9f9f9' : '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isIOS ? '#c6c6c8' : '#e0e0e0',
    height: PlatformConstants.tabBarHeight,
    paddingBottom: PlatformConstants.homeIndicatorHeight,
    ...Platform.select({
      android: {
        elevation: 8,
      },
    }),
  },
  
  tabBarLabel: {
    ...Platform.select({
      ios: {
        ...Typography.ios.caption1,
        fontWeight: '500',
      },
      android: {
        ...Typography.android.caption,
        fontWeight: '500',
      },
    }),
  },
  
  // Modal styles
  modal: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: isIOS ? 10 : 0,
    borderTopRightRadius: isIOS ? 10 : 0,
    ...Platform.select({
      ios: {
        marginTop: 20,
      },
      android: {
        marginTop: 0,
      },
    }),
  },
  
  modalHeader: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isIOS ? '#c6c6c8' : '#e0e0e0',
  },
  
  modalTitle: {
    ...Platform.select({
      ios: {
        ...Typography.ios.headline,
        fontWeight: '600',
      },
      android: {
        ...Typography.android.headline6,
      },
    }),
  },
  
  // Alert styles
  alertButton: {
    ...Platform.select({
      ios: {
        ...Typography.ios.body,
        color: '#007AFF',
        fontWeight: '400',
      },
      android: {
        ...Typography.android.button,
        color: '#2196F3',
      },
    }),
  },
  
  destructiveButton: {
    ...Platform.select({
      ios: {
        ...Typography.ios.body,
        color: '#FF3B30',
        fontWeight: '400',
      },
      android: {
        ...Typography.android.button,
        color: '#F44336',
      },
    }),
  },
});

// Responsive utilities
export const ResponsiveStyles = {
  // Responsive dimensions
  dimensions: {
    screenWidth: width,
    screenHeight: height,
    isTablet,
    isSmallPhone,
    isLargePhone,
    
    // Responsive breakpoints
    xs: width < 375,  // Small phones
    sm: width >= 375 && width < 414,  // Medium phones
    md: width >= 414 && width < 768,  // Large phones
    lg: width >= 768 && width < 1024, // Tablets
    xl: width >= 1024, // Large tablets
  },
  
  // Responsive spacing
  spacing: (multiplier: number = 1) => ({
    xs: PlatformConstants.spacing.xs * multiplier,
    sm: PlatformConstants.spacing.sm * multiplier,
    md: PlatformConstants.spacing.md * multiplier,
    lg: PlatformConstants.spacing.lg * multiplier,
    xl: PlatformConstants.spacing.xl * multiplier,
    xxl: PlatformConstants.spacing.xxl * multiplier,
  }),
  
  // Responsive font sizes
  fontSize: (baseSize: number, scale: number = 0.1) => {
    if (isSmallPhone) return baseSize - scale * baseSize;
    if (isLargePhone) return baseSize + scale * baseSize;
    if (isTablet) return baseSize + scale * baseSize * 2;
    return baseSize;
  },
  
  // Container width utilities
  containerWidth: (percentage: number = 1) => {
    const maxWidth = isTablet ? 600 : width;
    return maxWidth * percentage;
  },
};

// Theme-aware styles generator
export const createThemeStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  
  surface: {
    backgroundColor: theme.colors.surface,
  },
  
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: PlatformConstants.borderRadius.large,
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  
  primaryText: {
    color: theme.colors.text,
    ...Platform.select({
      ios: Typography.ios.body,
      android: Typography.android.body1,
    }),
  },
  
  secondaryText: {
    color: theme.colors.textSecondary,
    ...Platform.select({
      ios: Typography.ios.footnote,
      android: Typography.android.caption,
    }),
  },
  
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: PlatformConstants.borderRadius.medium,
    paddingVertical: isIOS ? 12 : 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 2,
      },
    }),
  },
  
  primaryButtonText: {
    color: theme.colors.onPrimary,
    ...Platform.select({
      ios: {
        ...Typography.ios.headline,
        fontWeight: '600',
      },
      android: Typography.android.button,
    }),
  },
  
  input: {
    borderWidth: isIOS ? 1 : 0,
    borderColor: theme.colors.border,
    borderRadius: PlatformConstants.borderRadius.medium,
    paddingHorizontal: 12,
    paddingVertical: isIOS ? 12 : 16,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    ...Platform.select({
      ios: Typography.ios.body,
      android: Typography.android.body1,
    }),
  },
  
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
});

// Animation configurations
export const AnimationConfig = {
  // Spring animations (iOS-style)
  spring: {
    damping: 15,
    stiffness: 150,
    mass: 1,
  },
  
  // Timing animations
  timing: {
    duration: Platform.select({
      ios: 300,
      android: 250,
    }),
  },
  
  // Layout animation presets
  layout: {
    create: {
      type: Platform.select({
        ios: 'spring',
        android: 'easeInEaseOut',
      }),
      property: 'opacity',
      springDamping: 0.7,
    },
    update: {
      type: Platform.select({
        ios: 'spring',
        android: 'easeInEaseOut',
      }),
      springDamping: 0.7,
    },
    delete: {
      type: Platform.select({
        ios: 'spring',
        android: 'easeInEaseOut',
      }),
      property: 'opacity',
      springDamping: 0.7,
    },
  },
};

// Accessibility helpers
export const AccessibilityHelpers = {
  // Screen reader labels
  getAccessibilityLabel: (label: string, value?: string) => {
    return value ? `${label}, ${value}` : label;
  },
  
  // Touch target minimum sizes
  touchTarget: {
    minWidth: 44,
    minHeight: 44,
  },
  
  // Accessibility traits
  traits: {
    button: 'button',
    header: 'header',
    link: 'link',
    image: 'image',
    text: 'text',
    adjustable: 'adjustable',
  },
};

export default {
  PlatformConstants,
  Typography,
  PlatformStyles,
  ResponsiveStyles,
  createThemeStyles,
  AnimationConfig,
  AccessibilityHelpers,
};