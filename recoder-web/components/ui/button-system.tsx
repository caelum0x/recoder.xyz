/**
 * RECODER.XYZ BUTTON COMPONENT SYSTEM
 * Professional, accessible, and comprehensive button system
 */

import React, { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

// ========================================
// BUTTON VARIANTS SYSTEM
// ========================================

const buttonVariants = cva(
  // Base button styles
  [
    'inline-flex items-center justify-center gap-2',
    'rounded-xl font-semibold transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-border-focus focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-95',
    'select-none whitespace-nowrap',
    'cursor-pointer',
  ],
  {
    variants: {
      // Visual variants
      variant: {
        // Primary - Main brand action
        primary: [
          'bg-gradient-to-r from-ds-primary-600 to-ds-primary-700',
          'text-ds-neutral-0 font-bold',
          'hover:from-ds-primary-700 hover:to-ds-primary-800',
          'hover:shadow-primary hover:scale-105',
          'active:from-ds-primary-800 active:to-ds-primary-900',
          'dark:from-ds-primary-500 dark:to-ds-primary-600',
          'dark:hover:from-ds-primary-600 dark:hover:to-ds-primary-700',
        ],
        
        // Secondary - Important but not primary
        secondary: [
          'bg-gradient-to-r from-ds-secondary-600 to-ds-secondary-700',
          'text-ds-neutral-0 font-bold',
          'hover:from-ds-secondary-700 hover:to-ds-secondary-800',
          'hover:shadow-lg hover:scale-105',
          'active:from-ds-secondary-800 active:to-ds-secondary-900',
          'dark:from-ds-secondary-500 dark:to-ds-secondary-600',
          'dark:hover:from-ds-secondary-600 dark:hover:to-ds-secondary-700',
        ],

        // Success - Positive actions
        success: [
          'bg-gradient-to-r from-ds-success-600 to-ds-success-700',
          'text-ds-neutral-0 font-bold',
          'hover:from-ds-success-700 hover:to-ds-success-800',
          'hover:shadow-success hover:scale-105',
          'active:from-ds-success-800 active:to-ds-success-900',
          'dark:from-ds-success-500 dark:to-ds-success-600',
        ],

        // Warning - Caution actions
        warning: [
          'bg-gradient-to-r from-ds-warning-500 to-ds-warning-600',
          'text-ds-neutral-0 font-bold',
          'hover:from-ds-warning-600 hover:to-ds-warning-700',
          'hover:shadow-warning hover:scale-105',
          'active:from-ds-warning-700 active:to-ds-warning-800',
          'dark:from-ds-warning-400 dark:to-ds-warning-500',
        ],

        // Destructive - Dangerous actions
        destructive: [
          'bg-gradient-to-r from-ds-error-600 to-ds-error-700',
          'text-ds-neutral-0 font-bold',
          'hover:from-ds-error-700 hover:to-ds-error-800',
          'hover:shadow-error hover:scale-105',
          'active:from-ds-error-800 active:to-ds-error-900',
          'dark:from-ds-error-500 dark:to-ds-error-600',
        ],

        // Outline - Subtle with border
        outline: [
          'border-2 border-ds-border-primary bg-transparent',
          'text-ds-text-primary font-semibold',
          'hover:bg-ds-surface-tint-blue hover:border-ds-primary-500',
          'hover:text-ds-primary-700 hover:scale-105',
          'active:bg-ds-primary-50',
          'dark:hover:bg-ds-primary-900/20',
          'dark:hover:text-ds-primary-400',
        ],

        // Ghost - Minimal styling
        ghost: [
          'bg-transparent text-ds-text-primary',
          'hover:bg-ds-surface-tint-blue hover:text-ds-primary-700',
          'hover:scale-105 active:bg-ds-primary-100',
          'dark:hover:bg-ds-primary-900/20',
          'dark:hover:text-ds-primary-400',
        ],

        // Link - Text-like appearance
        link: [
          'bg-transparent text-ds-primary-600 underline-offset-4',
          'hover:underline hover:text-ds-primary-700',
          'font-medium px-0',
          'dark:text-ds-primary-400',
        ],

        // Glass - Glass morphism effect
        glass: [
          'bg-ds-surface-glass backdrop-blur-md',
          'border border-ds-border-primary',
          'text-ds-text-primary font-semibold',
          'hover:bg-ds-surface-glass-strong hover:scale-105',
          'hover:shadow-lg',
        ],

        // Gradient - Special gradient effect
        gradient: [
          'bg-gradient-to-r from-ds-primary-500 via-ds-secondary-500 to-ds-accent-500',
          'text-ds-neutral-0 font-bold',
          'hover:from-ds-primary-600 hover:via-ds-secondary-600 hover:to-ds-accent-600',
          'hover:scale-105 hover:shadow-xl',
          'active:scale-95',
          'background-size-200 animate-gradient',
        ],
      },

      // Size variants
      size: {
        sm: 'h-8 px-3 text-sm min-w-[2rem]',
        md: 'h-10 px-4 text-sm min-w-[2.5rem]',
        lg: 'h-12 px-6 text-base min-w-[3rem]',
        xl: 'h-14 px-8 text-lg min-w-[3.5rem]',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-8 w-8 p-0',
        'icon-lg': 'h-12 w-12 p-0',
        'icon-xl': 'h-14 w-14 p-0',
      },

      // Shape variants
      shape: {
        default: 'rounded-xl',
        rounded: 'rounded-full',
        square: 'rounded-none',
        pill: 'rounded-full',
      },

      // Width variants
      width: {
        auto: 'w-auto',
        full: 'w-full',
        fit: 'w-fit',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      shape: 'default',
      width: 'auto',
    },
  }
);

// ========================================
// BUTTON COMPONENT
// ========================================

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    shape, 
    width, 
    asChild = false, 
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    children,
    ...props 
  }, ref) => {
    const Comp = asChild ? Slot : 'button';
    
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, shape, width, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
        )}
        {!loading && leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </Comp>
    );
  }
);

Button.displayName = 'Button';

// ========================================
// SPECIALIZED BUTTON COMPONENTS
// ========================================

// Icon Button - Optimized for icons only
export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  icon: ReactNode;
  'aria-label': string;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = 'icon', ...props }, ref) => {
    return (
      <Button ref={ref} size={size} {...props}>
        {icon}
      </Button>
    );
  }
);

IconButton.displayName = 'IconButton';

// Loading Button - Built-in loading states
export interface LoadingButtonProps extends ButtonProps {
  loadingText?: string;
}

const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ children, loadingText, loading, ...props }, ref) => {
    return (
      <Button ref={ref} loading={loading} {...props}>
        {loading && loadingText ? loadingText : children}
      </Button>
    );
  }
);

LoadingButton.displayName = 'LoadingButton';

// Button Group - For grouped buttons
export interface ButtonGroupProps {
  children: ReactNode;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
  spacing?: 'none' | 'sm' | 'md' | 'lg';
}

const ButtonGroup = ({ 
  children, 
  className, 
  orientation = 'horizontal', 
  spacing = 'sm' 
}: ButtonGroupProps) => {
  const spacingClasses = {
    none: '',
    sm: orientation === 'horizontal' ? 'space-x-2' : 'space-y-2',
    md: orientation === 'horizontal' ? 'space-x-4' : 'space-y-4',
    lg: orientation === 'horizontal' ? 'space-x-6' : 'space-y-6',
  };

  return (
    <div 
      className={cn(
        'flex',
        orientation === 'horizontal' ? 'flex-row items-center' : 'flex-col',
        spacingClasses[spacing],
        className
      )}
    >
      {children}
    </div>
  );
};

ButtonGroup.displayName = 'ButtonGroup';

// ========================================
// SPECIALIZED VARIANTS
// ========================================

// Social Media Buttons
const socialButtonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'rounded-xl font-semibold transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-95 hover:scale-105',
    'text-white',
  ],
  {
    variants: {
      provider: {
        github: [
          'bg-gray-900 hover:bg-gray-800',
          'focus-visible:ring-gray-900',
        ],
        google: [
          'bg-white text-gray-900 border border-gray-300',
          'hover:bg-gray-50',
          'focus-visible:ring-blue-500',
        ],
        twitter: [
          'bg-blue-400 hover:bg-blue-500',
          'focus-visible:ring-blue-400',
        ],
        discord: [
          'bg-indigo-600 hover:bg-indigo-700',
          'focus-visible:ring-indigo-600',
        ],
        linkedin: [
          'bg-blue-700 hover:bg-blue-800',
          'focus-visible:ring-blue-700',
        ],
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      provider: 'github',
      size: 'md',
    },
  }
);

interface SocialButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof socialButtonVariants> {
  icon?: ReactNode;
}

const SocialButton = forwardRef<HTMLButtonElement, SocialButtonProps>(
  ({ className, provider, size, icon, children, ...props }, ref) => {
    return (
      <button
        className={cn(socialButtonVariants({ provider, size, className }))}
        ref={ref}
        {...props}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </button>
    );
  }
);

SocialButton.displayName = 'SocialButton';

// ========================================
// FLOATING ACTION BUTTON
// ========================================

interface FabProps extends Omit<ButtonProps, 'shape' | 'size'> {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  size?: 'md' | 'lg' | 'xl';
  extended?: boolean;
}

const Fab = forwardRef<HTMLButtonElement, FabProps>(
  ({ 
    position = 'bottom-right', 
    size = 'lg', 
    extended = false,
    className,
    children,
    ...props 
  }, ref) => {
    const positionClasses = {
      'bottom-right': 'bottom-6 right-6',
      'bottom-left': 'bottom-6 left-6',
      'top-right': 'top-6 right-6',
      'top-left': 'top-6 left-6',
    };

    const sizeClasses = {
      md: extended ? 'h-12 px-6' : 'h-12 w-12',
      lg: extended ? 'h-14 px-8' : 'h-14 w-14',
      xl: extended ? 'h-16 px-10' : 'h-16 w-16',
    };

    return (
      <Button
        ref={ref}
        className={cn(
          'fixed z-50 shadow-2xl',
          positionClasses[position],
          sizeClasses[size],
          'rounded-full',
          className
        )}
        {...props}
      >
        {children}
      </Button>
    );
  }
);

Fab.displayName = 'Fab';

// ========================================
// TOGGLE BUTTON
// ========================================

interface ToggleButtonProps extends Omit<ButtonProps, 'variant'> {
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  pressedVariant?: ButtonProps['variant'];
  unpressedVariant?: ButtonProps['variant'];
}

const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(
  ({ 
    pressed = false,
    onPressedChange,
    pressedVariant = 'primary',
    unpressedVariant = 'outline',
    onClick,
    ...props 
  }, ref) => {
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onPressedChange?.(!pressed);
      onClick?.(event);
    };

    return (
      <Button
        ref={ref}
        variant={pressed ? pressedVariant : unpressedVariant}
        onClick={handleClick}
        aria-pressed={pressed}
        {...props}
      />
    );
  }
);

ToggleButton.displayName = 'ToggleButton';

// ========================================
// EXPORTS
// ========================================

export {
  Button,
  IconButton,
  LoadingButton,
  ButtonGroup,
  SocialButton,
  Fab,
  ToggleButton,
  buttonVariants,
  socialButtonVariants,
};

export type {
  ButtonProps,
  IconButtonProps,
  LoadingButtonProps,
  ButtonGroupProps,
  SocialButtonProps,
  FabProps,
  ToggleButtonProps,
};