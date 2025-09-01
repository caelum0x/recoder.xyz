/**
 * RECODER.XYZ FORM COMPONENT SYSTEM
 * Professional, accessible, and comprehensive form system
 */

import React, { 
  forwardRef, 
  InputHTMLAttributes, 
  TextareaHTMLAttributes, 
  SelectHTMLAttributes,
  ReactNode,
  useState,
  useId,
  useEffect
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ========================================
// INPUT VARIANTS SYSTEM
// ========================================

const inputVariants = cva(
  [
    'w-full rounded-xl border bg-ds-bg-primary px-4 py-3',
    'text-ds-text-primary placeholder:text-ds-text-placeholder',
    'transition-all duration-200 ease-out',
    'focus:outline-none focus:ring-2 focus:ring-ds-border-focus focus:ring-offset-1',
    'focus:border-ds-border-focus',
    'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-ds-bg-secondary',
    'file:border-0 file:bg-transparent file:text-sm file:font-medium',
  ],
  {
    variants: {
      variant: {
        default: [
          'border-ds-border-primary',
          'hover:border-ds-border-secondary',
          'focus:bg-ds-bg-elevated',
        ],
        filled: [
          'bg-ds-bg-secondary border-transparent',
          'hover:bg-ds-bg-tertiary',
          'focus:bg-ds-bg-primary focus:border-ds-border-focus',
        ],
        outline: [
          'bg-transparent border-2 border-ds-border-primary',
          'hover:border-ds-primary-500',
          'focus:border-ds-primary-600',
        ],
        ghost: [
          'bg-transparent border-transparent',
          'hover:bg-ds-surface-tint-blue',
          'focus:bg-ds-bg-primary focus:border-ds-border-focus',
        ],
        glass: [
          'bg-ds-surface-glass backdrop-blur-md border-ds-border-primary/50',
          'hover:bg-ds-surface-glass-strong',
          'focus:border-ds-border-focus',
        ],
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-sm',
        lg: 'h-13 px-6 text-base',
        xl: 'h-15 px-8 text-lg',
      },
      state: {
        default: '',
        success: 'border-ds-success-500 focus:ring-ds-success-500',
        warning: 'border-ds-warning-500 focus:ring-ds-warning-500',
        error: 'border-ds-error-500 focus:ring-ds-error-500',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      state: 'default',
    },
  }
);

// ========================================
// BASE INPUT COMPONENT
// ========================================

export interface InputProps
  extends InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  label?: string;
  description?: string;
  error?: string;
  success?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({
    className,
    variant,
    size,
    state,
    type = 'text',
    label,
    description,
    error,
    success,
    leftIcon,
    rightIcon,
    leftAddon,
    rightAddon,
    id: propId,
    'aria-describedby': ariaDescribedBy,
    ...props
  }, ref) => {
    const generatedId = useId();
    const id = propId || generatedId;
    const descriptionId = description ? `${id}-description` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const successId = success ? `${id}-success` : undefined;

    // Determine state based on props
    const computedState = error ? 'error' : success ? 'success' : state;

    const describedBy = [
      ariaDescribedBy,
      descriptionId,
      errorId,
      successId,
    ].filter(Boolean).join(' ') || undefined;

    const inputElement = (
      <input
        id={id}
        ref={ref}
        type={type}
        className={cn(
          inputVariants({ variant, size, state: computedState }),
          leftIcon && 'pl-12',
          rightIcon && 'pr-12',
          leftAddon && 'rounded-l-none border-l-0',
          rightAddon && 'rounded-r-none border-r-0',
          className
        )}
        aria-describedby={describedBy}
        aria-invalid={error ? 'true' : undefined}
        {...props}
      />
    );

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-ds-text-primary mb-2"
          >
            {label}
            {props.required && <span className="text-ds-error-500 ml-1">*</span>}
          </label>
        )}
        
        {description && (
          <p
            id={descriptionId}
            className="text-sm text-ds-text-secondary mb-2"
          >
            {description}
          </p>
        )}

        <div className="relative">
          {leftAddon && (
            <div className="absolute left-0 inset-y-0 flex items-center">
              <div className="h-full px-3 py-2 bg-ds-bg-secondary border border-r-0 border-ds-border-primary rounded-l-xl flex items-center text-sm text-ds-text-secondary">
                {leftAddon}
              </div>
            </div>
          )}

          {leftIcon && (
            <div className="absolute left-4 inset-y-0 flex items-center pointer-events-none">
              <div className="w-4 h-4 text-ds-text-tertiary">
                {leftIcon}
              </div>
            </div>
          )}

          {inputElement}

          {rightIcon && (
            <div className="absolute right-4 inset-y-0 flex items-center pointer-events-none">
              <div className="w-4 h-4 text-ds-text-tertiary">
                {rightIcon}
              </div>
            </div>
          )}

          {rightAddon && (
            <div className="absolute right-0 inset-y-0 flex items-center">
              <div className="h-full px-3 py-2 bg-ds-bg-secondary border border-l-0 border-ds-border-primary rounded-r-xl flex items-center text-sm text-ds-text-secondary">
                {rightAddon}
              </div>
            </div>
          )}
        </div>

        {success && (
          <p
            id={successId}
            className="mt-2 text-sm text-ds-success-600 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            className="mt-2 text-sm text-ds-error-600 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// ========================================
// TEXTAREA COMPONENT
// ========================================

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    Omit<VariantProps<typeof inputVariants>, 'size'> {
  label?: string;
  description?: string;
  error?: string;
  success?: string;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
  autoResize?: boolean;
  minRows?: number;
  maxRows?: number;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({
    className,
    variant,
    state,
    label,
    description,
    error,
    success,
    resize = 'vertical',
    autoResize = false,
    minRows = 3,
    maxRows = 10,
    id: propId,
    'aria-describedby': ariaDescribedBy,
    ...props
  }, ref) => {
    const [textareaRef, setTextareaRef] = useState<HTMLTextAreaElement | null>(null);
    const generatedId = useId();
    const id = propId || generatedId;
    const descriptionId = description ? `${id}-description` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const successId = success ? `${id}-success` : undefined;

    // Determine state based on props
    const computedState = error ? 'error' : success ? 'success' : state;

    const describedBy = [
      ariaDescribedBy,
      descriptionId,
      errorId,
      successId,
    ].filter(Boolean).join(' ') || undefined;

    // Auto-resize functionality
    useEffect(() => {
      if (autoResize && textareaRef) {
        const adjustHeight = () => {
          const textarea = textareaRef;
          const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
          const minHeight = lineHeight * minRows;
          const maxHeight = lineHeight * maxRows;

          textarea.style.height = 'auto';
          const scrollHeight = textarea.scrollHeight;
          const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
          textarea.style.height = `${newHeight}px`;
        };

        adjustHeight();
        textareaRef.addEventListener('input', adjustHeight);
        return () => textareaRef.removeEventListener('input', adjustHeight);
      }
    }, [autoResize, textareaRef, minRows, maxRows]);

    const resizeClasses = {
      none: 'resize-none',
      vertical: 'resize-y',
      horizontal: 'resize-x',
      both: 'resize',
    };

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-ds-text-primary mb-2"
          >
            {label}
            {props.required && <span className="text-ds-error-500 ml-1">*</span>}
          </label>
        )}
        
        {description && (
          <p
            id={descriptionId}
            className="text-sm text-ds-text-secondary mb-2"
          >
            {description}
          </p>
        )}

        <textarea
          id={id}
          ref={(node) => {
            setTextareaRef(node);
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          rows={autoResize ? minRows : props.rows || minRows}
          className={cn(
            inputVariants({ variant, size: 'md', state: computedState }),
            resizeClasses[resize],
            autoResize && 'overflow-hidden',
            'min-h-[80px]',
            className
          )}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          {...props}
        />

        {success && (
          <p
            id={successId}
            className="mt-2 text-sm text-ds-success-600 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            className="mt-2 text-sm text-ds-error-600 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// ========================================
// SELECT COMPONENT
// ========================================

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement>,
    VariantProps<typeof inputVariants> {
  label?: string;
  description?: string;
  error?: string;
  success?: string;
  placeholder?: string;
  options?: Array<{
    value: string;
    label: string;
    disabled?: boolean;
  }>;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({
    className,
    variant,
    size,
    state,
    label,
    description,
    error,
    success,
    placeholder,
    options = [],
    children,
    id: propId,
    'aria-describedby': ariaDescribedBy,
    ...props
  }, ref) => {
    const generatedId = useId();
    const id = propId || generatedId;
    const descriptionId = description ? `${id}-description` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const successId = success ? `${id}-success` : undefined;

    // Determine state based on props
    const computedState = error ? 'error' : success ? 'success' : state;

    const describedBy = [
      ariaDescribedBy,
      descriptionId,
      errorId,
      successId,
    ].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-ds-text-primary mb-2"
          >
            {label}
            {props.required && <span className="text-ds-error-500 ml-1">*</span>}
          </label>
        )}
        
        {description && (
          <p
            id={descriptionId}
            className="text-sm text-ds-text-secondary mb-2"
          >
            {description}
          </p>
        )}

        <div className="relative">
          <select
            id={id}
            ref={ref}
            className={cn(
              inputVariants({ variant, size, state: computedState }),
              'appearance-none cursor-pointer pr-12',
              'bg-no-repeat bg-right-4 bg-center',
              className
            )}
            aria-describedby={describedBy}
            aria-invalid={error ? 'true' : undefined}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
            {children}
          </select>

          {/* Custom dropdown arrow */}
          <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
            <svg
              className="w-4 h-4 text-ds-text-tertiary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {success && (
          <p
            id={successId}
            className="mt-2 text-sm text-ds-success-600 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            className="mt-2 text-sm text-ds-error-600 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

// ========================================
// CHECKBOX COMPONENT
// ========================================

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
  description?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'filled' | 'outline';
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({
    className,
    label,
    description,
    error,
    size = 'md',
    variant = 'default',
    id: propId,
    'aria-describedby': ariaDescribedBy,
    ...props
  }, ref) => {
    const generatedId = useId();
    const id = propId || generatedId;
    const descriptionId = description ? `${id}-description` : undefined;
    const errorId = error ? `${id}-error` : undefined;

    const describedBy = [
      ariaDescribedBy,
      descriptionId,
      errorId,
    ].filter(Boolean).join(' ') || undefined;

    const sizeClasses = {
      sm: 'w-4 h-4',
      md: 'w-5 h-5',
      lg: 'w-6 h-6',
    };

    const variantClasses = {
      default: [
        'border-ds-border-primary bg-ds-bg-primary',
        'checked:bg-ds-primary-500 checked:border-ds-primary-500',
        'focus:ring-ds-primary-500',
      ],
      filled: [
        'border-ds-primary-200 bg-ds-primary-50',
        'checked:bg-ds-primary-500 checked:border-ds-primary-500',
        'focus:ring-ds-primary-500',
      ],
      outline: [
        'border-2 border-ds-primary-500 bg-transparent',
        'checked:bg-ds-primary-500 checked:border-ds-primary-500',
        'focus:ring-ds-primary-500',
      ],
    };

    return (
      <div className="w-full">
        <div className="flex items-start gap-3">
          <div className="flex items-center h-5">
            <input
              id={id}
              ref={ref}
              type="checkbox"
              className={cn(
                'rounded-md border transition-all duration-200',
                'focus:ring-2 focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'text-ds-primary-500',
                sizeClasses[size],
                variantClasses[variant],
                error && 'border-ds-error-500 focus:ring-ds-error-500',
                className
              )}
              aria-describedby={describedBy}
              aria-invalid={error ? 'true' : undefined}
              {...props}
            />
          </div>

          {(label || description || error) && (
            <div className="flex-1 min-w-0">
              {label && (
                <label
                  htmlFor={id}
                  className="block text-sm font-medium text-ds-text-primary cursor-pointer"
                >
                  {label}
                  {props.required && <span className="text-ds-error-500 ml-1">*</span>}
                </label>
              )}

              {description && (
                <p
                  id={descriptionId}
                  className="mt-1 text-sm text-ds-text-secondary"
                >
                  {description}
                </p>
              )}

              {error && (
                <p
                  id={errorId}
                  className="mt-1 text-sm text-ds-error-600 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

// ========================================
// RADIO COMPONENT
// ========================================

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'filled' | 'outline';
}

const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({
    className,
    label,
    description,
    size = 'md',
    variant = 'default',
    id: propId,
    'aria-describedby': ariaDescribedBy,
    ...props
  }, ref) => {
    const generatedId = useId();
    const id = propId || generatedId;
    const descriptionId = description ? `${id}-description` : undefined;

    const describedBy = [
      ariaDescribedBy,
      descriptionId,
    ].filter(Boolean).join(' ') || undefined;

    const sizeClasses = {
      sm: 'w-4 h-4',
      md: 'w-5 h-5',
      lg: 'w-6 h-6',
    };

    const variantClasses = {
      default: [
        'border-ds-border-primary bg-ds-bg-primary',
        'checked:bg-ds-primary-500 checked:border-ds-primary-500',
        'focus:ring-ds-primary-500',
      ],
      filled: [
        'border-ds-primary-200 bg-ds-primary-50',
        'checked:bg-ds-primary-500 checked:border-ds-primary-500',
        'focus:ring-ds-primary-500',
      ],
      outline: [
        'border-2 border-ds-primary-500 bg-transparent',
        'checked:bg-ds-primary-500 checked:border-ds-primary-500',
        'focus:ring-ds-primary-500',
      ],
    };

    return (
      <div className="flex items-start gap-3">
        <div className="flex items-center h-5">
          <input
            id={id}
            ref={ref}
            type="radio"
            className={cn(
              'border transition-all duration-200',
              'focus:ring-2 focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'text-ds-primary-500',
              sizeClasses[size],
              variantClasses[variant],
              className
            )}
            aria-describedby={describedBy}
            {...props}
          />
        </div>

        {(label || description) && (
          <div className="flex-1 min-w-0">
            {label && (
              <label
                htmlFor={id}
                className="block text-sm font-medium text-ds-text-primary cursor-pointer"
              >
                {label}
                {props.required && <span className="text-ds-error-500 ml-1">*</span>}
              </label>
            )}

            {description && (
              <p
                id={descriptionId}
                className="mt-1 text-sm text-ds-text-secondary"
              >
                {description}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Radio.displayName = 'Radio';

// ========================================
// RADIO GROUP COMPONENT
// ========================================

export interface RadioGroupProps {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  options: Array<{
    value: string;
    label: ReactNode;
    description?: string;
    disabled?: boolean;
  }>;
  label?: string;
  description?: string;
  error?: string;
  orientation?: 'vertical' | 'horizontal';
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'filled' | 'outline';
  required?: boolean;
}

const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value,
  onChange,
  options,
  label,
  description,
  error,
  orientation = 'vertical',
  size = 'md',
  variant = 'default',
  required = false,
}) => {
  const generatedId = useId();
  const groupId = `${generatedId}-group`;
  const descriptionId = description ? `${groupId}-description` : undefined;
  const errorId = error ? `${groupId}-error` : undefined;

  const describedBy = [
    descriptionId,
    errorId,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className="w-full">
      {label && (
        <div className="block text-sm font-medium text-ds-text-primary mb-3">
          {label}
          {required && <span className="text-ds-error-500 ml-1">*</span>}
        </div>
      )}
      
      {description && (
        <p
          id={descriptionId}
          className="text-sm text-ds-text-secondary mb-3"
        >
          {description}
        </p>
      )}

      <div
        role="radiogroup"
        aria-describedby={describedBy}
        aria-invalid={error ? 'true' : undefined}
        className={cn(
          'space-y-3',
          orientation === 'horizontal' && 'flex flex-wrap gap-6 space-y-0'
        )}
      >
        {options.map((option) => (
          <Radio
            key={option.value}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={(e) => onChange?.(e.target.value)}
            label={option.label}
            description={option.description}
            disabled={option.disabled}
            size={size}
            variant={variant}
            required={required}
          />
        ))}
      </div>

      {error && (
        <p
          id={errorId}
          className="mt-2 text-sm text-ds-error-600 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
};

RadioGroup.displayName = 'RadioGroup';

// ========================================
// FORM GROUP COMPONENT
// ========================================

export interface FormGroupProps {
  children: ReactNode;
  className?: string;
  spacing?: 'sm' | 'md' | 'lg';
  orientation?: 'vertical' | 'horizontal';
}

const FormGroup: React.FC<FormGroupProps> = ({
  children,
  className,
  spacing = 'md',
  orientation = 'vertical',
}) => {
  const spacingClasses = {
    sm: orientation === 'vertical' ? 'space-y-3' : 'space-x-3',
    md: orientation === 'vertical' ? 'space-y-4' : 'space-x-4',
    lg: orientation === 'vertical' ? 'space-y-6' : 'space-x-6',
  };

  return (
    <div
      className={cn(
        'w-full',
        orientation === 'horizontal' ? 'flex flex-wrap items-start' : 'block',
        spacingClasses[spacing],
        className
      )}
    >
      {children}
    </div>
  );
};

FormGroup.displayName = 'FormGroup';

// ========================================
// EXPORTS
// ========================================

export {
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  RadioGroup,
  FormGroup,
  inputVariants,
};

export type {
  InputProps,
  TextareaProps,
  SelectProps,
  CheckboxProps,
  RadioProps,
  RadioGroupProps,
  FormGroupProps,
};