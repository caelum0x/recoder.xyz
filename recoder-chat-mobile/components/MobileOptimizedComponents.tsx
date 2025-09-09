import React, { useState, useRef, useEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  RefreshControl,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { HapticService } from '../services/MobileNativeModules';

const { width, height } = Dimensions.get('window');
const isIOS = Platform.OS === 'ios';

// Mobile-optimized Card Component
interface MobileCardProps {
  children: React.ReactNode;
  style?: any;
  onPress?: () => void;
  elevation?: number;
  blur?: boolean;
  gradient?: boolean;
  loading?: boolean;
}

export const MobileCard: React.FC<MobileCardProps> = memo(({
  children,
  style,
  onPress,
  elevation = 2,
  blur = false,
  gradient = false,
  loading = false,
}) => {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
    HapticService.light();
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const CardContent = () => (
    <View style={[
      styles.card,
      {
        backgroundColor: theme.colors.surface,
        shadowColor: theme.colors.shadow,
        elevation: isIOS ? 0 : elevation,
        shadowOffset: { width: 0, height: elevation },
        shadowOpacity: 0.1,
        shadowRadius: elevation * 2,
      },
      style
    ]}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}
      {children}
    </View>
  );

  if (blur) {
    return (
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
        disabled={loading}
      >
        <Animated.View style={animatedStyle}>
          <BlurView intensity={80} style={[styles.card, style]}>
            {children}
          </BlurView>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  if (gradient) {
    return (
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
        disabled={loading}
      >
        <Animated.View style={animatedStyle}>
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.secondary]}
            style={[styles.card, style]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {children}
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return onPress ? (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.8}
      disabled={loading}
    >
      <Animated.View style={animatedStyle}>
        <CardContent />
      </Animated.View>
    </TouchableOpacity>
  ) : (
    <CardContent />
  );
});

// Mobile-optimized Button Component
interface MobileButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: any;
  haptic?: boolean;
}

export const MobileButton: React.FC<MobileButtonProps> = memo(({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  icon,
  style,
  haptic = true,
}) => {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getButtonStyle = () => {
    const baseStyle = {
      ...styles.button,
      ...styles[`button${size.charAt(0).toUpperCase() + size.slice(1)}`],
    };

    switch (variant) {
      case 'primary':
        return {
          ...baseStyle,
          backgroundColor: theme.colors.primary,
        };
      case 'secondary':
        return {
          ...baseStyle,
          backgroundColor: theme.colors.secondary,
        };
      case 'outline':
        return {
          ...baseStyle,
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: theme.colors.primary,
        };
      case 'ghost':
        return {
          ...baseStyle,
          backgroundColor: 'transparent',
        };
      default:
        return baseStyle;
    }
  };

  const getTextStyle = () => {
    const baseStyle = {
      ...styles.buttonText,
      ...styles[`buttonText${size.charAt(0).toUpperCase() + size.slice(1)}`],
    };

    switch (variant) {
      case 'primary':
      case 'secondary':
        return {
          ...baseStyle,
          color: theme.colors.onPrimary,
        };
      case 'outline':
      case 'ghost':
        return {
          ...baseStyle,
          color: theme.colors.primary,
        };
      default:
        return baseStyle;
    }
  };

  const handlePress = () => {
    if (haptic) HapticService.medium();
    onPress();
  };

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      <Animated.View style={[animatedStyle, getButtonStyle(), style, disabled && styles.disabledButton]}>
        {loading ? (
          <ActivityIndicator size="small" color={getTextStyle().color} />
        ) : (
          <View style={styles.buttonContent}>
            {icon && (
              <Ionicons
                name={icon as any}
                size={getTextStyle().fontSize + 2}
                color={getTextStyle().color}
                style={styles.buttonIcon}
              />
            )}
            <Text style={[getTextStyle(), disabled && styles.disabledText]}>
              {title}
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
});

// Mobile-optimized Input Component
interface MobileInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  keyboardType?: any;
  autoCapitalize?: any;
  autoCorrect?: boolean;
  secureTextEntry?: boolean;
  maxLength?: number;
  style?: any;
  error?: string;
  label?: string;
  icon?: string;
  onIconPress?: () => void;
  editable?: boolean;
  clearable?: boolean;
}

export const MobileInput: React.FC<MobileInputProps> = memo(({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  numberOfLines = 1,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoCorrect = true,
  secureTextEntry = false,
  maxLength,
  style,
  error,
  label,
  icon,
  onIconPress,
  editable = true,
  clearable = false,
}) => {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleClear = () => {
    onChangeText('');
    HapticService.light();
  };

  return (
    <View style={[styles.inputContainer, style]}>
      {label && (
        <Text style={[styles.inputLabel, { color: theme.colors.text }]}>
          {label}
        </Text>
      )}
      
      <View style={[
        styles.inputWrapper,
        {
          backgroundColor: theme.colors.surface,
          borderColor: error ? theme.colors.error : 
                       isFocused ? theme.colors.primary : theme.colors.border,
        }
      ]}>
        {icon && (
          <TouchableOpacity
            onPress={onIconPress}
            style={styles.inputIcon}
          >
            <Ionicons
              name={icon as any}
              size={20}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        )}
        
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSecondary}
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          editable={editable}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[
            styles.textInput,
            {
              color: theme.colors.text,
              height: multiline ? numberOfLines * 20 + 20 : 44,
            }
          ]}
        />
        
        {clearable && value.length > 0 && (
          <TouchableOpacity
            onPress={handleClear}
            style={styles.clearButton}
          >
            <Ionicons
              name="close-circle"
              size={18}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      
      {error && (
        <Text style={[styles.errorText, { color: theme.colors.error }]}>
          {error}
        </Text>
      )}
      
      {maxLength && (
        <Text style={[styles.counterText, { color: theme.colors.textSecondary }]}>
          {value.length}/{maxLength}
        </Text>
      )}
    </View>
  );
});

// Mobile-optimized List Component
interface MobileListProps<T> {
  data: T[];
  renderItem: ({ item, index }: { item: T; index: number }) => React.ReactElement;
  keyExtractor?: (item: T, index: number) => string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  horizontal?: boolean;
  numColumns?: number;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  style?: any;
  contentContainerStyle?: any;
  ListEmptyComponent?: React.ReactElement;
  ListHeaderComponent?: React.ReactElement;
  ListFooterComponent?: React.ReactElement;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}

export const MobileList = <T,>({
  data,
  renderItem,
  keyExtractor,
  onRefresh,
  refreshing = false,
  onEndReached,
  onEndReachedThreshold = 0.5,
  horizontal = false,
  numColumns = 1,
  showsVerticalScrollIndicator = false,
  showsHorizontalScrollIndicator = false,
  style,
  contentContainerStyle,
  ListEmptyComponent,
  ListHeaderComponent,
  ListFooterComponent,
  loading = false,
  error,
  onRetry,
}: MobileListProps<T>) => {
  const { theme } = useTheme();

  const defaultKeyExtractor = useMemo(() => 
    keyExtractor || ((item: any, index: number) => 
      item?.id?.toString() || index.toString()
    ), [keyExtractor]
  );

  const renderFooter = () => {
    if (loading) {
      return (
        <View style={styles.listFooter}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      );
    }
    return ListFooterComponent || null;
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.listEmpty}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            Loading...
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.listEmpty}>
          <Ionicons name="alert-circle" size={48} color={theme.colors.error} />
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
            Something went wrong
          </Text>
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            {error}
          </Text>
          {onRetry && (
            <MobileButton
              title="Retry"
              onPress={onRetry}
              size="small"
              style={styles.retryButton}
            />
          )}
        </View>
      );
    }

    return ListEmptyComponent || (
      <View style={styles.listEmpty}>
        <Ionicons name="list" size={48} color={theme.colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
          No items found
        </Text>
        <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
          Try refreshing or adjusting your filters
        </Text>
      </View>
    );
  };

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={defaultKeyExtractor}
      horizontal={horizontal}
      numColumns={numColumns}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        ) : undefined
      }
      ListEmptyComponent={renderEmpty}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={renderFooter}
      style={[styles.list, style]}
      contentContainerStyle={[
        styles.listContent,
        data.length === 0 && styles.listContentEmpty,
        contentContainerStyle,
      ]}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={21}
      initialNumToRender={10}
    />
  );
};

// Mobile-optimized Modal Component
interface MobileModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  animationType?: 'slide' | 'fade' | 'none';
  presentationStyle?: 'fullScreen' | 'pageSheet' | 'formSheet' | 'overFullScreen';
  showCloseButton?: boolean;
  onShow?: () => void;
  style?: any;
}

export const MobileModal: React.FC<MobileModalProps> = ({
  visible,
  onClose,
  title,
  children,
  animationType = 'slide',
  presentationStyle = 'pageSheet',
  showCloseButton = true,
  onShow,
  style,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(height);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0);
      opacity.value = withTiming(1);
      onShow?.();
    } else {
      translateY.value = withSpring(height);
      opacity.value = withTiming(0);
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <Animated.View style={[styles.modalBackdrop, backdropStyle]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
        />
      </Animated.View>

      <Animated.View style={[
        styles.modalContainer,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        animatedStyle,
        style,
      ]}>
        {(title || showCloseButton) && (
          <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.modalHeaderContent}>
              {title && (
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                  {title}
                </Text>
              )}
              {showCloseButton && (
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.modalCloseButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.modalBody}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
};

// Mobile-optimized ActionSheet Component
interface MobileActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  options: Array<{
    title: string;
    onPress: () => void;
    destructive?: boolean;
    disabled?: boolean;
    icon?: string;
  }>;
  cancelButtonText?: string;
}

export const MobileActionSheet: React.FC<MobileActionSheetProps> = ({
  visible,
  onClose,
  title,
  message,
  options,
  cancelButtonText = 'Cancel',
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const showActionSheet = () => {
    if (isIOS) {
      const iosOptions = options.map(option => option.title);
      iosOptions.push(cancelButtonText);

      const destructiveButtonIndex = options.findIndex(option => option.destructive);
      const cancelButtonIndex = iosOptions.length - 1;

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: iosOptions,
          cancelButtonIndex,
          destructiveButtonIndex: destructiveButtonIndex >= 0 ? destructiveButtonIndex : undefined,
          title,
          message,
        },
        (buttonIndex) => {
          if (buttonIndex < options.length) {
            options[buttonIndex].onPress();
          }
          onClose();
        }
      );
    }
  };

  useEffect(() => {
    if (visible && isIOS) {
      showActionSheet();
    }
  }, [visible]);

  if (isIOS) return null;

  return (
    <MobileModal
      visible={visible}
      onClose={onClose}
      presentationStyle="overFullScreen"
      showCloseButton={false}
    >
      <View style={[styles.actionSheet, { paddingBottom: insets.bottom }]}>
        {(title || message) && (
          <View style={[styles.actionSheetHeader, { borderBottomColor: theme.colors.border }]}>
            {title && (
              <Text style={[styles.actionSheetTitle, { color: theme.colors.text }]}>
                {title}
              </Text>
            )}
            {message && (
              <Text style={[styles.actionSheetMessage, { color: theme.colors.textSecondary }]}>
                {message}
              </Text>
            )}
          </View>
        )}

        {options.map((option, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => {
              option.onPress();
              onClose();
            }}
            disabled={option.disabled}
            style={[
              styles.actionSheetOption,
              { borderBottomColor: theme.colors.border },
              option.disabled && styles.actionSheetOptionDisabled,
            ]}
          >
            <View style={styles.actionSheetOptionContent}>
              {option.icon && (
                <Ionicons
                  name={option.icon as any}
                  size={20}
                  color={option.destructive ? theme.colors.error : theme.colors.text}
                  style={styles.actionSheetOptionIcon}
                />
              )}
              <Text style={[
                styles.actionSheetOptionText,
                {
                  color: option.destructive ? theme.colors.error :
                         option.disabled ? theme.colors.textSecondary : theme.colors.text
                }
              ]}>
                {option.title}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          onPress={onClose}
          style={[
            styles.actionSheetCancel,
            { backgroundColor: theme.colors.surface }
          ]}
        >
          <Text style={[styles.actionSheetCancelText, { color: theme.colors.primary }]}>
            {cancelButtonText}
          </Text>
        </TouchableOpacity>
      </View>
    </MobileModal>
  );
};

// Mobile-optimized SafeArea Component
interface MobileSafeAreaProps {
  children: React.ReactNode;
  style?: any;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  backgroundColor?: string;
}

export const MobileSafeArea: React.FC<MobileSafeAreaProps> = ({
  children,
  style,
  edges = ['top', 'bottom'],
  backgroundColor,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const safeAreaStyle = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
    backgroundColor: backgroundColor || theme.colors.background,
  };

  return (
    <View style={[styles.safeArea, safeAreaStyle, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  // Card styles
  card: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 4,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },

  // Button styles
  button: {
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  buttonSmall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonMedium: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonLarge: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  buttonText: {
    fontWeight: '600',
  },
  buttonTextSmall: {
    fontSize: 14,
  },
  buttonTextMedium: {
    fontSize: 16,
  },
  buttonTextLarge: {
    fontSize: 18,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.7,
  },

  // Input styles
  inputContainer: {
    marginVertical: 8,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  clearButton: {
    marginLeft: 8,
  },
  errorText: {
    fontSize: 14,
    marginTop: 4,
  },
  counterText: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },

  // List styles
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    padding: 16,
  },
  listContentEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  listEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  listFooter: {
    padding: 16,
    alignItems: 'center',
  },
  retryButton: {
    marginTop: 16,
  },

  // Modal styles
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: height * 0.1,
  },
  modalHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    flex: 1,
  },

  // ActionSheet styles
  actionSheet: {
    padding: 16,
  },
  actionSheetHeader: {
    borderBottomWidth: 1,
    paddingBottom: 16,
    marginBottom: 8,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  actionSheetMessage: {
    fontSize: 14,
    textAlign: 'center',
  },
  actionSheetOption: {
    borderBottomWidth: 1,
    paddingVertical: 16,
  },
  actionSheetOptionDisabled: {
    opacity: 0.5,
  },
  actionSheetOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionSheetOptionIcon: {
    marginRight: 12,
  },
  actionSheetOptionText: {
    fontSize: 16,
    flex: 1,
  },
  actionSheetCancel: {
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionSheetCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // SafeArea styles
  safeArea: {
    flex: 1,
  },
});

export {
  MobileCard,
  MobileButton,
  MobileInput,
  MobileList,
  MobileModal,
  MobileActionSheet,
  MobileSafeArea,
};