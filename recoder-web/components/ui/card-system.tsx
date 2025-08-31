/**
 * RECODER.XYZ CARD COMPONENT SYSTEM
 * Professional, versatile, and comprehensive card system
 */

import React, { forwardRef, HTMLAttributes, ReactNode, ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ========================================
// CARD VARIANTS SYSTEM
// ========================================

const cardVariants = cva(
  [
    'rounded-xl border bg-ds-bg-elevated transition-all duration-200',
    'overflow-hidden relative',
    'shadow-base',
  ],
  {
    variants: {
      variant: {
        default: [
          'border-ds-border-primary bg-ds-bg-elevated',
          'hover:shadow-lg hover:-translate-y-1',
        ],
        elevated: [
          'border-ds-border-primary bg-ds-bg-primary',
          'shadow-lg',
          'hover:shadow-xl hover:-translate-y-2',
        ],
        outline: [
          'border-2 border-ds-border-primary bg-transparent',
          'hover:border-ds-primary-500 hover:bg-ds-surface-tint-blue',
        ],
        ghost: [
          'border-transparent bg-transparent',
          'hover:bg-ds-surface-tint-blue hover:border-ds-border-primary',
        ],
        glass: [
          'border-ds-border-primary/50 bg-ds-surface-glass backdrop-blur-md',
          'hover:bg-ds-surface-glass-strong hover:border-ds-border-primary',
        ],
        gradient: [
          'border-transparent bg-gradient-to-br',
          'from-ds-primary-50 via-ds-secondary-50 to-ds-accent-50',
          'hover:from-ds-primary-100 hover:via-ds-secondary-100 hover:to-ds-accent-100',
          'dark:from-ds-primary-950 dark:via-ds-secondary-950 dark:to-ds-accent-950',
        ],
        feature: [
          'border-ds-primary-200 bg-gradient-to-br',
          'from-ds-bg-primary via-ds-primary-50 to-ds-secondary-50',
          'hover:shadow-primary hover:-translate-y-2',
          'dark:from-ds-bg-primary dark:via-ds-primary-950 dark:to-ds-secondary-950',
        ],
        interactive: [
          'border-ds-border-primary bg-ds-bg-elevated cursor-pointer',
          'hover:shadow-lg hover:-translate-y-1 hover:border-ds-primary-300',
          'active:scale-98 active:shadow-md',
          'focus:outline-none focus:ring-2 focus:ring-ds-primary-500 focus:ring-offset-2',
        ],
      },
      size: {
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
        xl: 'p-10',
      },
      rounded: {
        none: 'rounded-none',
        sm: 'rounded-lg',
        md: 'rounded-xl',
        lg: 'rounded-2xl',
        xl: 'rounded-3xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      rounded: 'md',
    },
  }
);

// ========================================
// BASE CARD COMPONENT
// ========================================

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, size, rounded, asChild = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, size, rounded }), className)}
        {...props}
      />
    );
  }
);

Card.displayName = 'Card';

// ========================================
// CARD HEADER COMPONENT
// ========================================

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, bordered = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col space-y-1.5 p-6 pb-6',
          bordered && 'border-b border-ds-border-primary',
          className
        )}
        {...props}
      />
    );
  }
);

CardHeader.displayName = 'CardHeader';

// ========================================
// CARD TITLE COMPONENT
// ========================================

export interface CardTitleProps extends HTMLAttributes<HTMLDivElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

const CardTitle = forwardRef<HTMLDivElement, CardTitleProps>(
  ({ className, level = 3, children, ...props }, ref) => {
    const Component = `h${level}` as keyof JSX.IntrinsicElements;
    
    return (
      <Component
        ref={ref as any}
        className={cn(
          'text-lg font-semibold leading-none tracking-tight text-ds-text-primary',
          level === 1 && 'text-3xl font-bold',
          level === 2 && 'text-2xl font-bold',
          level === 3 && 'text-lg font-semibold',
          level === 4 && 'text-base font-semibold',
          level === 5 && 'text-sm font-medium',
          level === 6 && 'text-xs font-medium',
          className
        )}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

CardTitle.displayName = 'CardTitle';

// ========================================
// CARD DESCRIPTION COMPONENT
// ========================================

export interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn('text-sm text-ds-text-secondary leading-relaxed', className)}
        {...props}
      />
    );
  }
);

CardDescription.displayName = 'CardDescription';

// ========================================
// CARD CONTENT COMPONENT
// ========================================

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('p-6 pt-0', className)}
        {...props}
      />
    );
  }
);

CardContent.displayName = 'CardContent';

// ========================================
// CARD FOOTER COMPONENT
// ========================================

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
}

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, bordered = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center p-6 pt-0',
          bordered && 'border-t border-ds-border-primary pt-6',
          className
        )}
        {...props}
      />
    );
  }
);

CardFooter.displayName = 'CardFooter';

// ========================================
// SPECIALIZED CARD COMPONENTS
// ========================================

// Product Card Component
export interface ProductCardProps extends Omit<CardProps, 'children'> {
  image?: string;
  imageAlt?: string;
  title: string;
  description?: string;
  price?: string;
  originalPrice?: string;
  badge?: string;
  badgeVariant?: 'default' | 'success' | 'warning' | 'error';
  rating?: number;
  reviewCount?: number;
  onAddToCart?: () => void;
  onViewProduct?: () => void;
  isLoading?: boolean;
}

const ProductCard = forwardRef<HTMLDivElement, ProductCardProps>(
  ({
    className,
    image,
    imageAlt,
    title,
    description,
    price,
    originalPrice,
    badge,
    badgeVariant = 'default',
    rating,
    reviewCount,
    onAddToCart,
    onViewProduct,
    isLoading = false,
    ...props
  }, ref) => {
    const badgeColors = {
      default: 'bg-ds-neutral-100 text-ds-neutral-700',
      success: 'bg-ds-success-100 text-ds-success-700',
      warning: 'bg-ds-warning-100 text-ds-warning-700',
      error: 'bg-ds-error-100 text-ds-error-700',
    };

    return (
      <Card
        ref={ref}
        className={cn('group overflow-hidden', className)}
        variant="interactive"
        {...props}
      >
        {/* Image Section */}
        {image && (
          <div className="relative aspect-[4/3] overflow-hidden">
            <img
              src={image}
              alt={imageAlt || title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {badge && (
              <div
                className={cn(
                  'absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-medium',
                  badgeColors[badgeVariant]
                )}
              >
                {badge}
              </div>
            )}
          </div>
        )}

        <CardContent className="space-y-3">
          {/* Title */}
          <CardTitle className="line-clamp-2">{title}</CardTitle>

          {/* Description */}
          {description && (
            <CardDescription className="line-clamp-3">{description}</CardDescription>
          )}

          {/* Rating */}
          {rating && (
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <svg
                    key={i}
                    className={cn(
                      'w-4 h-4',
                      i < Math.floor(rating)
                        ? 'text-ds-warning-400 fill-current'
                        : 'text-ds-neutral-300'
                    )}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              {reviewCount && (
                <span className="text-xs text-ds-text-secondary">
                  ({reviewCount} reviews)
                </span>
              )}
            </div>
          )}

          {/* Price */}
          {price && (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-ds-text-primary">{price}</span>
              {originalPrice && (
                <span className="text-sm text-ds-text-tertiary line-through">
                  {originalPrice}
                </span>
              )}
            </div>
          )}
        </CardContent>

        {/* Actions */}
        {(onAddToCart || onViewProduct) && (
          <CardFooter className="gap-2">
            {onViewProduct && (
              <button
                onClick={onViewProduct}
                className="flex-1 px-4 py-2 text-sm font-medium text-ds-text-primary border border-ds-border-primary rounded-lg hover:bg-ds-surface-tint-blue transition-colors"
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : 'View Details'}
              </button>
            )}
            {onAddToCart && (
              <button
                onClick={onAddToCart}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-ds-primary-500 rounded-lg hover:bg-ds-primary-600 transition-colors"
                disabled={isLoading}
              >
                {isLoading ? 'Adding...' : 'Add to Cart'}
              </button>
            )}
          </CardFooter>
        )}
      </Card>
    );
  }
);

ProductCard.displayName = 'ProductCard';

// Feature Card Component
export interface FeatureCardProps extends Omit<CardProps, 'children'> {
  icon?: ReactNode;
  title: string;
  description: string;
  link?: {
    text: string;
    href: string;
    onClick?: () => void;
  };
  highlight?: boolean;
}

const FeatureCard = forwardRef<HTMLDivElement, FeatureCardProps>(
  ({
    className,
    icon,
    title,
    description,
    link,
    highlight = false,
    ...props
  }, ref) => {
    return (
      <Card
        ref={ref}
        className={cn(
          'text-center group',
          highlight && 'ring-2 ring-ds-primary-500 ring-opacity-20',
          className
        )}
        variant={highlight ? 'feature' : 'default'}
        {...props}
      >
        {icon && (
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-ds-primary-100 rounded-xl flex items-center justify-center text-ds-primary-600 group-hover:bg-ds-primary-200 transition-colors">
              {icon}
            </div>
          </div>
        )}

        <CardTitle className="mb-3 text-center">{title}</CardTitle>
        <CardDescription className="text-center mb-4">{description}</CardDescription>

        {link && (
          <div className="mt-auto">
            {link.href ? (
              <a
                href={link.href}
                className="inline-flex items-center text-sm font-medium text-ds-primary-600 hover:text-ds-primary-700 transition-colors"
                onClick={link.onClick}
              >
                {link.text}
                <svg
                  className="ml-1 w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </a>
            ) : (
              <button
                onClick={link.onClick}
                className="inline-flex items-center text-sm font-medium text-ds-primary-600 hover:text-ds-primary-700 transition-colors"
              >
                {link.text}
                <svg
                  className="ml-1 w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </Card>
    );
  }
);

FeatureCard.displayName = 'FeatureCard';

// Stats Card Component
export interface StatsCardProps extends Omit<CardProps, 'children'> {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'increase' | 'decrease' | 'neutral';
  icon?: ReactNode;
  description?: string;
}

const StatsCard = forwardRef<HTMLDivElement, StatsCardProps>(
  ({
    className,
    title,
    value,
    change,
    changeType = 'neutral',
    icon,
    description,
    ...props
  }, ref) => {
    const changeColors = {
      increase: 'text-ds-success-600',
      decrease: 'text-ds-error-600',
      neutral: 'text-ds-text-tertiary',
    };

    const changeIcons = {
      increase: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      ),
      decrease: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ),
      neutral: null,
    };

    return (
      <Card
        ref={ref}
        className={cn('relative overflow-hidden', className)}
        {...props}
      >
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-ds-text-secondary">{title}</div>
            {icon && (
              <div className="w-8 h-8 bg-ds-primary-100 rounded-lg flex items-center justify-center text-ds-primary-600">
                {icon}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-2xl font-bold text-ds-text-primary">{value}</div>
            {change && (
              <div className={cn('flex items-center text-sm', changeColors[changeType])}>
                {changeIcons[changeType]}
                <span className="ml-1">{change}</span>
              </div>
            )}
          </div>

          {description && (
            <p className="text-xs text-ds-text-tertiary">{description}</p>
          )}
        </CardContent>
      </Card>
    );
  }
);

StatsCard.displayName = 'StatsCard';

// Profile Card Component
export interface ProfileCardProps extends Omit<CardProps, 'children'> {
  avatar?: string;
  name: string;
  title?: string;
  description?: string;
  stats?: Array<{
    label: string;
    value: string | number;
  }>;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }>;
  verified?: boolean;
}

const ProfileCard = forwardRef<HTMLDivElement, ProfileCardProps>(
  ({
    className,
    avatar,
    name,
    title,
    description,
    stats,
    actions,
    verified = false,
    ...props
  }, ref) => {
    return (
      <Card
        ref={ref}
        className={cn('text-center', className)}
        {...props}
      >
        <CardContent className="space-y-4">
          {/* Avatar */}
          <div className="flex justify-center">
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-ds-border-primary"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-ds-primary-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-ds-primary-600">
                  {name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Name and Title */}
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <CardTitle className="text-center">{name}</CardTitle>
              {verified && (
                <svg className="w-5 h-5 text-ds-primary-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            {title && <CardDescription>{title}</CardDescription>}
          </div>

          {/* Description */}
          {description && (
            <CardDescription className="text-center">{description}</CardDescription>
          )}

          {/* Stats */}
          {stats && stats.length > 0 && (
            <div className="flex justify-center gap-8 py-4 border-y border-ds-border-primary">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-lg font-semibold text-ds-text-primary">
                    {stat.value}
                  </div>
                  <div className="text-xs text-ds-text-secondary">{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {actions && actions.length > 0 && (
            <div className="flex gap-2">
              {actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.onClick}
                  className={cn(
                    'flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                    action.variant === 'primary'
                      ? 'text-white bg-ds-primary-500 hover:bg-ds-primary-600'
                      : 'text-ds-text-primary border border-ds-border-primary hover:bg-ds-surface-tint-blue'
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

ProfileCard.displayName = 'ProfileCard';

// ========================================
// CARD GROUP COMPONENT
// ========================================

export interface CardGroupProps extends HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
}

const CardGroup = forwardRef<HTMLDivElement, CardGroupProps>(
  ({ className, columns = 3, gap = 'md', children, ...props }, ref) => {
    const columnClasses = {
      1: 'grid-cols-1',
      2: 'grid-cols-1 md:grid-cols-2',
      3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    };

    const gapClasses = {
      sm: 'gap-4',
      md: 'gap-6',
      lg: 'gap-8',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'grid',
          columnClasses[columns],
          gapClasses[gap],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardGroup.displayName = 'CardGroup';

// ========================================
// EXPORTS
// ========================================

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  ProductCard,
  FeatureCard,
  StatsCard,
  ProfileCard,
  CardGroup,
  cardVariants,
};

export type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps,
  CardFooterProps,
  ProductCardProps,
  FeatureCardProps,
  StatsCardProps,
  ProfileCardProps,
  CardGroupProps,
};