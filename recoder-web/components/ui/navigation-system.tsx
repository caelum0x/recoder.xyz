/**
 * RECODER.XYZ NAVIGATION COMPONENT SYSTEM
 * Professional, accessible, and comprehensive navigation system
 */

import React, { 
  forwardRef, 
  HTMLAttributes, 
  ReactNode, 
  ButtonHTMLAttributes,
  AnchorHTMLAttributes,
  useState,
  useEffect,
  useRef
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ========================================
// HEADER COMPONENT
// ========================================

const headerVariants = cva(
  [
    'w-full border-b transition-all duration-200',
    'backdrop-blur-md bg-opacity-90',
  ],
  {
    variants: {
      variant: {
        default: 'bg-ds-bg-primary border-ds-border-primary',
        transparent: 'bg-transparent border-transparent',
        glass: 'bg-ds-surface-glass border-ds-border-primary/50',
        elevated: 'bg-ds-bg-elevated border-ds-border-primary shadow-lg',
      },
      size: {
        sm: 'h-14',
        md: 'h-16',
        lg: 'h-20',
      },
      sticky: {
        true: 'sticky top-0 z-50',
        false: 'relative',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      sticky: true,
    },
  }
);

export interface HeaderProps
  extends HTMLAttributes<HTMLElement>,
    VariantProps<typeof headerVariants> {
  logo?: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
}

const Header = forwardRef<HTMLElement, HeaderProps>(
  ({ className, variant, size, sticky, logo, navigation, actions, children, ...props }, ref) => {
    return (
      <header
        ref={ref}
        className={cn(headerVariants({ variant, size, sticky }), className)}
        {...props}
      >
        <div className="container mx-auto px-4 h-full flex items-center justify-between">
          {logo && <div className="flex-shrink-0">{logo}</div>}
          {navigation && <div className="hidden lg:flex flex-1 justify-center">{navigation}</div>}
          {actions && <div className="flex items-center gap-4">{actions}</div>}
          {children}
        </div>
      </header>
    );
  }
);

Header.displayName = 'Header';

// ========================================
// SIDEBAR COMPONENT
// ========================================

const sidebarVariants = cva(
  [
    'h-full border-r bg-ds-bg-primary transition-all duration-300',
    'flex flex-col overflow-hidden',
  ],
  {
    variants: {
      variant: {
        default: 'border-ds-border-primary bg-ds-bg-primary',
        elevated: 'border-ds-border-primary bg-ds-bg-elevated shadow-lg',
        glass: 'border-ds-border-primary/50 bg-ds-surface-glass backdrop-blur-md',
      },
      size: {
        sm: 'w-48',
        md: 'w-64',
        lg: 'w-80',
        xl: 'w-96',
      },
      collapsible: {
        true: 'data-[collapsed=true]:w-16',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      collapsible: false,
    },
  }
);

export interface SidebarProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof sidebarVariants> {
  collapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  header?: ReactNode;
  footer?: ReactNode;
}

const Sidebar = forwardRef<HTMLDivElement, SidebarProps>(
  ({ 
    className, 
    variant, 
    size, 
    collapsible, 
    collapsed = false,
    onToggle,
    header,
    footer,
    children, 
    ...props 
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(sidebarVariants({ variant, size, collapsible }), className)}
        data-collapsed={collapsed}
        {...props}
      >
        {/* Header */}
        {header && (
          <div className="p-4 border-b border-ds-border-primary flex-shrink-0">
            {header}
          </div>
        )}

        {/* Toggle Button */}
        {collapsible && onToggle && (
          <button
            onClick={() => onToggle(!collapsed)}
            className="absolute -right-3 top-6 w-6 h-6 bg-ds-bg-primary border border-ds-border-primary rounded-full flex items-center justify-center shadow-md hover:bg-ds-bg-elevated transition-colors z-10"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className={cn('w-3 h-3 transition-transform', collapsed && 'rotate-180')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-4 border-t border-ds-border-primary flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    );
  }
);

Sidebar.displayName = 'Sidebar';

// ========================================
// NAVIGATION MENU COMPONENT
// ========================================

export interface NavItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean;
  icon?: ReactNode;
  badge?: string | number;
  disabled?: boolean;
}

const NavItem = forwardRef<HTMLAnchorElement, NavItemProps>(
  ({ className, active, icon, badge, disabled, children, ...props }, ref) => {
    return (
      <a
        ref={ref}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
          'text-ds-text-secondary hover:text-ds-text-primary',
          'hover:bg-ds-surface-tint-blue',
          active && 'bg-ds-primary-100 text-ds-primary-700 font-medium',
          disabled && 'opacity-50 pointer-events-none',
          className
        )}
        aria-current={active ? 'page' : undefined}
        {...props}
      >
        {icon && <span className="flex-shrink-0 w-5 h-5">{icon}</span>}
        <span className="flex-1 truncate">{children}</span>
        {badge && (
          <span className="flex-shrink-0 px-2 py-1 text-xs font-medium bg-ds-primary-100 text-ds-primary-700 rounded-full">
            {badge}
          </span>
        )}
      </a>
    );
  }
);

NavItem.displayName = 'NavItem';

export interface NavGroupProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

const NavGroup = forwardRef<HTMLDivElement, NavGroupProps>(
  ({ className, title, collapsible, defaultExpanded = true, children, ...props }, ref) => {
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
      <div ref={ref} className={cn('space-y-1', className)} {...props}>
        {title && (
          <div className="flex items-center justify-between">
            <h4 className="px-3 py-2 text-xs font-semibold text-ds-text-tertiary uppercase tracking-wider">
              {title}
            </h4>
            {collapsible && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1 hover:bg-ds-surface-tint-blue rounded"
                aria-label={expanded ? 'Collapse group' : 'Expand group'}
              >
                <svg
                  className={cn('w-4 h-4 transition-transform', !expanded && '-rotate-90')}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        )}
        {expanded && (
          <div className="space-y-1">
            {children}
          </div>
        )}
      </div>
    );
  }
);

NavGroup.displayName = 'NavGroup';

// ========================================
// BREADCRUMB COMPONENT
// ========================================

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: ReactNode;
}

export interface BreadcrumbProps extends HTMLAttributes<HTMLNavElement> {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  maxItems?: number;
}

const Breadcrumb = forwardRef<HTMLNavElement, BreadcrumbProps>(
  ({ className, items, separator, maxItems = 5, ...props }, ref) => {
    const displayItems = items.length > maxItems 
      ? [
          items[0],
          { label: '...', href: undefined },
          ...items.slice(items.length - maxItems + 2)
        ]
      : items;

    const defaultSeparator = (
      <svg className="w-4 h-4 text-ds-text-tertiary" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
      </svg>
    );

    return (
      <nav ref={ref} className={cn('flex items-center space-x-1', className)} aria-label="Breadcrumb" {...props}>
        <ol className="flex items-center space-x-1">
          {displayItems.map((item, index) => (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <span className="mx-2">
                  {separator || defaultSeparator}
                </span>
              )}
              {item.href ? (
                <a
                  href={item.href}
                  className="flex items-center gap-1 text-ds-text-secondary hover:text-ds-primary-600 transition-colors"
                >
                  {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                  {item.label}
                </a>
              ) : (
                <span 
                  className={cn(
                    'flex items-center gap-1',
                    index === displayItems.length - 1 
                      ? 'text-ds-text-primary font-medium' 
                      : 'text-ds-text-tertiary'
                  )}
                  aria-current={index === displayItems.length - 1 ? 'page' : undefined}
                >
                  {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    );
  }
);

Breadcrumb.displayName = 'Breadcrumb';

// ========================================
// TABS COMPONENT
// ========================================

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
  disabled?: boolean;
}

const tabsVariants = cva(
  ['inline-flex items-center justify-center'],
  {
    variants: {
      variant: {
        default: 'bg-ds-bg-secondary rounded-lg p-1',
        underline: 'border-b border-ds-border-primary',
        pills: 'space-x-2',
        cards: 'bg-transparent border-b border-ds-border-primary',
      },
      size: {
        sm: 'h-9',
        md: 'h-10',
        lg: 'h-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface TabsProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof tabsVariants> {
  items: TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  fullWidth?: boolean;
}

const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  ({ 
    className, 
    variant, 
    size, 
    items, 
    value, 
    onChange, 
    fullWidth = false,
    ...props 
  }, ref) => {
    const [selectedTab, setSelectedTab] = useState(value || items[0]?.id);

    useEffect(() => {
      if (value && value !== selectedTab) {
        setSelectedTab(value);
      }
    }, [value]);

    const handleTabClick = (tabId: string) => {
      setSelectedTab(tabId);
      onChange?.(tabId);
    };

    const getTabButtonClasses = (item: TabItem, isSelected: boolean) => {
      const baseClasses = 'relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ds-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
      
      switch (variant) {
        case 'underline':
          return cn(
            baseClasses,
            'border-b-2 -mb-px',
            isSelected
              ? 'border-ds-primary-500 text-ds-primary-600'
              : 'border-transparent text-ds-text-secondary hover:text-ds-text-primary hover:border-ds-border-secondary'
          );
        case 'pills':
          return cn(
            baseClasses,
            'rounded-lg',
            isSelected
              ? 'bg-ds-primary-500 text-white shadow-sm'
              : 'text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-tint-blue'
          );
        case 'cards':
          return cn(
            baseClasses,
            'border-b-2 -mb-px rounded-t-lg',
            isSelected
              ? 'border-ds-primary-500 bg-ds-bg-primary text-ds-primary-600'
              : 'border-transparent bg-ds-bg-secondary text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-tint-blue'
          );
        default:
          return cn(
            baseClasses,
            'rounded-md',
            isSelected
              ? 'bg-ds-bg-primary text-ds-text-primary shadow-sm'
              : 'text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-tint-blue'
          );
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          tabsVariants({ variant, size }),
          fullWidth && 'w-full',
          className
        )}
        role="tablist"
        {...props}
      >
        {items.map((item) => {
          const isSelected = selectedTab === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={isSelected}
              aria-controls={`tabpanel-${item.id}`}
              disabled={item.disabled}
              className={cn(
                getTabButtonClasses(item, isSelected),
                fullWidth && 'flex-1'
              )}
              onClick={() => !item.disabled && handleTabClick(item.id)}
            >
              {item.icon && <span className="w-4 h-4">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
              {item.badge && (
                <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium bg-ds-primary-100 text-ds-primary-700 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }
);

Tabs.displayName = 'Tabs';

// ========================================
// PAGINATION COMPONENT
// ========================================

export interface PaginationProps extends HTMLAttributes<HTMLNavElement> {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showFirstLast?: boolean;
  showPrevNext?: boolean;
  siblingCount?: number;
  disabled?: boolean;
}

const Pagination = forwardRef<HTMLNavElement, PaginationProps>(
  ({ 
    className,
    currentPage,
    totalPages,
    onPageChange,
    showFirstLast = true,
    showPrevNext = true,
    siblingCount = 1,
    disabled = false,
    ...props
  }, ref) => {
    const generatePageNumbers = () => {
      const pages: (number | string)[] = [];
      const leftSibling = Math.max(currentPage - siblingCount, 1);
      const rightSibling = Math.min(currentPage + siblingCount, totalPages);

      const showLeftDots = leftSibling > 2;
      const showRightDots = rightSibling < totalPages - 1;

      if (!showLeftDots && showRightDots) {
        const leftRange = Array.from({ length: 2 + siblingCount * 2 }, (_, i) => i + 1);
        pages.push(...leftRange, '...', totalPages);
      } else if (showLeftDots && !showRightDots) {
        const rightRange = Array.from(
          { length: 2 + siblingCount * 2 },
          (_, i) => totalPages - (2 + siblingCount * 2) + i + 1
        );
        pages.push(1, '...', ...rightRange);
      } else if (showLeftDots && showRightDots) {
        const middleRange = Array.from(
          { length: rightSibling - leftSibling + 1 },
          (_, i) => leftSibling + i
        );
        pages.push(1, '...', ...middleRange, '...', totalPages);
      } else {
        pages.push(...Array.from({ length: totalPages }, (_, i) => i + 1));
      }

      return pages;
    };

    const pageNumbers = generatePageNumbers();

    const buttonClass = (active = false, isDisabled = false) =>
      cn(
        'relative inline-flex items-center justify-center w-10 h-10 text-sm font-medium transition-all duration-200',
        'border border-ds-border-primary rounded-lg',
        'focus:outline-none focus:ring-2 focus:ring-ds-primary-500 focus:ring-offset-2',
        active
          ? 'bg-ds-primary-500 text-white border-ds-primary-500 shadow-sm'
          : 'bg-ds-bg-primary text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-tint-blue',
        (isDisabled || disabled) && 'opacity-50 cursor-not-allowed pointer-events-none'
      );

    const arrowButtonClass = (isDisabled = false) =>
      cn(
        'relative inline-flex items-center justify-center w-10 h-10 text-sm font-medium transition-all duration-200',
        'border border-ds-border-primary rounded-lg',
        'bg-ds-bg-primary text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-tint-blue',
        'focus:outline-none focus:ring-2 focus:ring-ds-primary-500 focus:ring-offset-2',
        (isDisabled || disabled) && 'opacity-50 cursor-not-allowed pointer-events-none'
      );

    return (
      <nav ref={ref} className={cn('flex items-center justify-center space-x-1', className)} aria-label="Pagination" {...props}>
        {/* First Page */}
        {showFirstLast && (
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1 || disabled}
            className={arrowButtonClass(currentPage === 1)}
            aria-label="First page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Previous Page */}
        {showPrevNext && (
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1 || disabled}
            className={arrowButtonClass(currentPage === 1)}
            aria-label="Previous page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Page Numbers */}
        {pageNumbers.map((page, index) => (
          <React.Fragment key={index}>
            {page === '...' ? (
              <span className="relative inline-flex items-center justify-center w-10 h-10 text-sm text-ds-text-tertiary">
                ...
              </span>
            ) : (
              <button
                onClick={() => onPageChange(page as number)}
                disabled={disabled}
                className={buttonClass(currentPage === page)}
                aria-label={`Page ${page}`}
                aria-current={currentPage === page ? 'page' : undefined}
              >
                {page}
              </button>
            )}
          </React.Fragment>
        ))}

        {/* Next Page */}
        {showPrevNext && (
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || disabled}
            className={arrowButtonClass(currentPage === totalPages)}
            aria-label="Next page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Last Page */}
        {showFirstLast && (
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages || disabled}
            className={arrowButtonClass(currentPage === totalPages)}
            aria-label="Last page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </nav>
    );
  }
);

Pagination.displayName = 'Pagination';

// ========================================
// MOBILE MENU COMPONENT
// ========================================

export interface MobileMenuProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  trigger?: ReactNode;
}

const MobileMenu = forwardRef<HTMLDivElement, MobileMenuProps>(
  ({ className, isOpen, onClose, trigger, children, ...props }, ref) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          onClose();
        }
      };

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onClose();
        }
      };

      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = 'unset';
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
      };
    }, [isOpen, onClose]);

    if (!isOpen) return trigger || null;

    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-ds-bg-backdrop backdrop-blur-sm z-40 lg:hidden" />
        
        {/* Menu */}
        <div
          ref={menuRef}
          className={cn(
            'fixed inset-y-0 left-0 w-64 bg-ds-bg-primary border-r border-ds-border-primary shadow-xl z-50 lg:hidden',
            'transform transition-transform duration-300 ease-in-out',
            isOpen ? 'translate-x-0' : '-translate-x-full',
            className
          )}
          {...props}
        >
          {/* Close Button */}
          <div className="flex items-center justify-between p-4 border-b border-ds-border-primary">
            <h2 className="text-lg font-semibold text-ds-text-primary">Menu</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-ds-surface-tint-blue transition-colors"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {children}
          </div>
        </div>
      </>
    );
  }
);

MobileMenu.displayName = 'MobileMenu';

// ========================================
// EXPORTS
// ========================================

export {
  Header,
  Sidebar,
  NavItem,
  NavGroup,
  Breadcrumb,
  Tabs,
  Pagination,
  MobileMenu,
  headerVariants,
  sidebarVariants,
  tabsVariants,
};

export type {
  HeaderProps,
  SidebarProps,
  NavItemProps,
  NavGroupProps,
  BreadcrumbProps,
  BreadcrumbItem,
  TabsProps,
  TabItem,
  PaginationProps,
  MobileMenuProps,
};