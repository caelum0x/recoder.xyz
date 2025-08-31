/**
 * RECODER.XYZ FEEDBACK COMPONENT SYSTEM
 * Professional, accessible, and comprehensive feedback system
 */

import React, { 
  forwardRef, 
  HTMLAttributes, 
  ReactNode, 
  ButtonHTMLAttributes,
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  Fragment
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ========================================
// ALERT COMPONENT
// ========================================

const alertVariants = cva(
  [
    'relative w-full rounded-xl border px-4 py-3',
    'flex items-start gap-3',
    'transition-all duration-200',
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-ds-bg-secondary border-ds-border-primary text-ds-text-primary',
        ],
        success: [
          'bg-ds-success-50 border-ds-success-200 text-ds-success-800',
          'dark:bg-ds-success-950 dark:border-ds-success-800 dark:text-ds-success-200',
        ],
        warning: [
          'bg-ds-warning-50 border-ds-warning-200 text-ds-warning-800',
          'dark:bg-ds-warning-950 dark:border-ds-warning-800 dark:text-ds-warning-200',
        ],
        error: [
          'bg-ds-error-50 border-ds-error-200 text-ds-error-800',
          'dark:bg-ds-error-950 dark:border-ds-error-800 dark:text-ds-error-200',
        ],
        info: [
          'bg-ds-primary-50 border-ds-primary-200 text-ds-primary-800',
          'dark:bg-ds-primary-950 dark:border-ds-primary-800 dark:text-ds-primary-200',
        ],
      },
      size: {
        sm: 'text-sm py-2 px-3',
        md: 'text-sm py-3 px-4',
        lg: 'text-base py-4 px-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: ReactNode;
  title?: string;
  description?: string;
  onClose?: () => void;
  closable?: boolean;
}

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ 
    className, 
    variant, 
    size, 
    icon, 
    title, 
    description, 
    onClose, 
    closable = false,
    children,
    ...props 
  }, ref) => {
    const [isVisible, setIsVisible] = useState(true);

    const handleClose = () => {
      setIsVisible(false);
      setTimeout(() => onClose?.(), 200);
    };

    if (!isVisible) return null;

    const defaultIcons = {
      success: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ),
      warning: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      ),
      error: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      ),
      info: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      ),
    };

    return (
      <div
        ref={ref}
        className={cn(alertVariants({ variant, size }), className)}
        role="alert"
        {...props}
      >
        {(icon || variant !== 'default') && (
          <div className="flex-shrink-0">
            {icon || (variant !== 'default' ? defaultIcons[variant as keyof typeof defaultIcons] : null)}
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="font-medium mb-1">{title}</h4>
          )}
          {description && (
            <p className="text-sm opacity-90">{description}</p>
          )}
          {children}
        </div>

        {closable && (
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Close alert"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }
);

Alert.displayName = 'Alert';

// ========================================
// TOAST SYSTEM
// ========================================

export interface ToastData {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  onClose?: () => void;
}

const ToastContext = createContext<{
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, 'id'>) => void;
  removeToast: (id: string) => void;
}>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = (toast: Omit<ToastData, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id };
    setToasts(prev => [...prev, newToast]);

    if (toast.duration !== 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration || 5000);
    }
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onClose={() => {
            toast.onClose?.();
            removeToast(toast.id);
          }}
        />
      ))}
    </div>
  );
};

const Toast = forwardRef<HTMLDivElement, ToastData>(
  ({ title, description, variant = 'default', action, onClose, ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);

    useEffect(() => {
      requestAnimationFrame(() => setIsVisible(true));
    }, []);

    const handleClose = () => {
      setIsLeaving(true);
      setTimeout(() => onClose?.(), 200);
    };

    return (
      <div
        ref={ref}
        className={cn(
          'relative bg-ds-bg-elevated border border-ds-border-primary rounded-xl shadow-lg p-4',
          'transform transition-all duration-200 ease-out',
          isVisible && !isLeaving 
            ? 'translate-x-0 opacity-100' 
            : 'translate-x-full opacity-0',
          variant === 'success' && 'border-ds-success-200',
          variant === 'warning' && 'border-ds-warning-200',
          variant === 'error' && 'border-ds-error-200',
          variant === 'info' && 'border-ds-primary-200'
        )}
        role="alert"
        {...props}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            {title && (
              <h4 className="font-medium text-ds-text-primary mb-1">{title}</h4>
            )}
            {description && (
              <p className="text-sm text-ds-text-secondary">{description}</p>
            )}
          </div>

          <button
            onClick={handleClose}
            className="flex-shrink-0 p-1 rounded-md text-ds-text-tertiary hover:text-ds-text-primary hover:bg-ds-surface-tint-blue transition-colors"
            aria-label="Close notification"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {action && (
          <div className="mt-3 pt-3 border-t border-ds-border-primary">
            <button
              onClick={action.onClick}
              className="text-sm font-medium text-ds-primary-600 hover:text-ds-primary-700 transition-colors"
            >
              {action.label}
            </button>
          </div>
        )}
      </div>
    );
  }
);

Toast.displayName = 'Toast';

// ========================================
// MODAL COMPONENT
// ========================================

export interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
}

const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ 
    isOpen,
    onClose,
    title,
    description,
    size = 'md',
    showCloseButton = true,
    closeOnBackdropClick = true,
    closeOnEscape = true,
    className,
    children,
    ...props
  }, ref) => {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!isOpen) return;

      const handleEscape = (event: KeyboardEvent) => {
        if (closeOnEscape && event.key === 'Escape') {
          onClose();
        }
      };

      const handleBackdropClick = (event: MouseEvent) => {
        if (
          closeOnBackdropClick &&
          modalRef.current &&
          !modalRef.current.contains(event.target as Node)
        ) {
          onClose();
        }
      };

      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleBackdropClick);
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('mousedown', handleBackdropClick);
        document.body.style.overflow = 'unset';
      };
    }, [isOpen, onClose, closeOnBackdropClick, closeOnEscape]);

    if (!isOpen) return null;

    const sizeClasses = {
      sm: 'max-w-md',
      md: 'max-w-lg',
      lg: 'max-w-2xl',
      xl: 'max-w-4xl',
      full: 'max-w-full m-4',
    };

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-ds-bg-backdrop backdrop-blur-sm transition-opacity" />
        
        {/* Modal Container */}
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            ref={modalRef}
            className={cn(
              'relative bg-ds-bg-primary rounded-xl border border-ds-border-primary shadow-xl',
              'transform transition-all duration-200',
              sizeClasses[size],
              className
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            aria-describedby={description ? 'modal-description' : undefined}
            {...props}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between p-6 border-b border-ds-border-primary">
                <div>
                  {title && (
                    <h2 id="modal-title" className="text-lg font-semibold text-ds-text-primary">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p id="modal-description" className="mt-1 text-sm text-ds-text-secondary">
                      {description}
                    </p>
                  )}
                </div>
                
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg text-ds-text-tertiary hover:text-ds-text-primary hover:bg-ds-surface-tint-blue transition-colors"
                    aria-label="Close modal"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="p-6">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

Modal.displayName = 'Modal';

// ========================================
// TOOLTIP COMPONENT
// ========================================

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  disabled?: boolean;
}

const Tooltip: React.FC<TooltipProps> = ({ 
  content, 
  children, 
  position = 'top',
  delay = 300,
  disabled = false 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const showTooltip = () => {
    if (disabled) return;
    setIsHovered(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (isHovered) setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    setIsHovered(false);
    clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-ds-neutral-800',
    bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-ds-neutral-800',
    left: 'left-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-ds-neutral-800',
    right: 'right-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-ds-neutral-800',
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      
      {isVisible && (
        <div
          className={cn(
            'absolute z-50 px-3 py-2 text-sm text-white bg-ds-neutral-800 rounded-lg shadow-lg',
            'transition-opacity duration-200',
            'max-w-xs break-words',
            positionClasses[position]
          )}
          role="tooltip"
        >
          {content}
          <div
            className={cn(
              'absolute w-0 h-0 border-4',
              arrowClasses[position]
            )}
          />
        </div>
      )}
    </div>
  );
};

Tooltip.displayName = 'Tooltip';

// ========================================
// LOADING COMPONENTS
// ========================================

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'primary' | 'secondary';
}

const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  ({ size = 'md', variant = 'default', className, ...props }, ref) => {
    const sizeClasses = {
      sm: 'w-4 h-4 border-2',
      md: 'w-6 h-6 border-2',
      lg: 'w-8 h-8 border-3',
      xl: 'w-12 h-12 border-4',
    };

    const variantClasses = {
      default: 'border-ds-border-primary border-t-ds-text-primary',
      primary: 'border-ds-primary-200 border-t-ds-primary-600',
      secondary: 'border-ds-secondary-200 border-t-ds-secondary-600',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'animate-spin rounded-full',
          sizeClasses[size],
          variantClasses[variant],
          className
        )}
        role="status"
        aria-label="Loading"
        {...props}
      />
    );
  }
);

Spinner.displayName = 'Spinner';

export interface LoadingOverlayProps extends HTMLAttributes<HTMLDivElement> {
  isLoading: boolean;
  title?: string;
  description?: string;
  spinnerSize?: 'sm' | 'md' | 'lg' | 'xl';
}

const LoadingOverlay = forwardRef<HTMLDivElement, LoadingOverlayProps>(
  ({ isLoading, title, description, spinnerSize = 'lg', className, children, ...props }, ref) => {
    if (!isLoading && !children) return null;

    return (
      <div ref={ref} className={cn('relative', className)} {...props}>
        {children}
        
        {isLoading && (
          <div className="absolute inset-0 bg-ds-bg-backdrop backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
            <div className="text-center">
              <Spinner size={spinnerSize} variant="primary" className="mx-auto mb-4" />
              {title && (
                <h3 className="text-lg font-medium text-ds-text-primary mb-2">{title}</h3>
              )}
              {description && (
                <p className="text-sm text-ds-text-secondary">{description}</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

LoadingOverlay.displayName = 'LoadingOverlay';

// ========================================
// PROGRESS COMPONENT
// ========================================

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
  label?: string;
}

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ 
    value, 
    max = 100, 
    size = 'md', 
    variant = 'default', 
    showLabel = false,
    label,
    className, 
    ...props 
  }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    const sizeClasses = {
      sm: 'h-1',
      md: 'h-2',
      lg: 'h-3',
    };

    const variantClasses = {
      default: 'bg-ds-primary-500',
      success: 'bg-ds-success-500',
      warning: 'bg-ds-warning-500',
      error: 'bg-ds-error-500',
    };

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {(showLabel || label) && (
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-ds-text-primary">
              {label || 'Progress'}
            </span>
            <span className="text-sm text-ds-text-secondary">
              {Math.round(percentage)}%
            </span>
          </div>
        )}
        
        <div className={cn(
          'w-full bg-ds-bg-secondary rounded-full overflow-hidden',
          sizeClasses[size]
        )}>
          <div
            className={cn(
              'h-full transition-all duration-300 ease-out rounded-full',
              variantClasses[variant]
            )}
            style={{ width: `${percentage}%` }}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={max}
          />
        </div>
      </div>
    );
  }
);

Progress.displayName = 'Progress';

// ========================================
// SKELETON COMPONENT
// ========================================

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ variant = 'text', width, height, lines = 1, className, ...props }, ref) => {
    const baseClasses = 'animate-pulse bg-ds-bg-secondary';
    
    const variantClasses = {
      text: 'rounded',
      rectangular: 'rounded-lg',
      circular: 'rounded-full',
    };

    const defaultSizes = {
      text: { width: '100%', height: '1rem' },
      rectangular: { width: '100%', height: '8rem' },
      circular: { width: '3rem', height: '3rem' },
    };

    const style = {
      width: width || defaultSizes[variant].width,
      height: height || defaultSizes[variant].height,
    };

    if (variant === 'text' && lines > 1) {
      return (
        <div ref={ref} className={cn('space-y-2', className)} {...props}>
          {Array.from({ length: lines }).map((_, index) => (
            <div
              key={index}
              className={cn(baseClasses, variantClasses[variant])}
              style={{
                ...style,
                width: index === lines - 1 ? '75%' : style.width,
              }}
            />
          ))}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(baseClasses, variantClasses[variant], className)}
        style={style}
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

// ========================================
// EXPORTS
// ========================================

export {
  Alert,
  Toast,
  ToastProvider,
  useToast,
  Modal,
  Tooltip,
  Spinner,
  LoadingOverlay,
  Progress,
  Skeleton,
  alertVariants,
};

export type {
  AlertProps,
  ToastData,
  ModalProps,
  TooltipProps,
  SpinnerProps,
  LoadingOverlayProps,
  ProgressProps,
  SkeletonProps,
};