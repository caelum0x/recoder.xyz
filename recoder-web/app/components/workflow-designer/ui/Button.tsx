'use client';

import { forwardRef } from 'react';
import classNames from 'classnames';
import { SpinnerIcon } from '../icons';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      className,
      children,
      loading,
      disabled,
      leftIcon,
      rightIcon,
      ...props
    },
    ref
  ) {
    const isDisabled = disabled || loading;

    return (
      <button
        className={classNames(
          'rounded-lg font-medium inline-flex items-center justify-center gap-2 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bolt-elements-background-depth-1',
          // Variants
          {
            'bg-accent-500 text-white hover:bg-accent-600 focus:ring-accent-500':
              variant === 'primary',
            'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:ring-gray-500':
              variant === 'secondary',
            'bg-transparent text-bolt-elements-textPrimary border border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3 focus:ring-gray-500':
              variant === 'outline',
            'bg-transparent text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:ring-gray-500':
              variant === 'ghost',
            'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500':
              variant === 'danger',
          },
          // Sizes
          {
            'text-xs px-2 py-1': size === 'sm',
            'text-sm px-3 py-1.5': size === 'md',
            'text-base px-4 py-2': size === 'lg',
          },
          // States
          {
            'opacity-60 cursor-not-allowed': isDisabled,
          },
          className
        )}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <SpinnerIcon className="w-4 h-4" />
        ) : leftIcon ? (
          <span className="flex-shrink-0">{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && !loading && (
          <span className="flex-shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);
