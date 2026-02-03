import { memo, useCallback, type ReactNode } from 'react';
import { classNames } from '~/utils/classNames';
import { useCopyToClipboard, type CopyOptions } from '~/lib/hooks/useCopyToClipboard';

type CopyButtonSize = 'xs' | 'sm' | 'md' | 'lg';
type CopyButtonVariant = 'default' | 'ghost' | 'outline' | 'minimal';

interface BaseCopyButtonProps extends CopyOptions {
  /** Text to copy when clicked */
  text: string;
  /** Additional class names */
  className?: string;
  /** Button size variant */
  size?: CopyButtonSize;
  /** Visual style variant */
  variant?: CopyButtonVariant;
  /** Tooltip text (uses title attribute) */
  tooltip?: string;
  /** Whether to show text label */
  showLabel?: boolean;
  /** Custom label text when not copied */
  label?: string;
  /** Custom label text when copied */
  copiedLabel?: string;
  /** Callback when copy succeeds */
  onCopy?: () => void;
  /** Callback when copy fails */
  onError?: (error: Error) => void;
  /** Disable the button */
  disabled?: boolean;
  /** Accessible label for screen readers */
  'aria-label'?: string;
}

interface CopyButtonWithChildrenProps extends BaseCopyButtonProps {
  /** Custom content to render inside the button */
  children: ReactNode;
  /** Don't show the icon when children are provided */
  showIcon?: boolean;
}

interface CopyButtonWithoutChildrenProps extends BaseCopyButtonProps {
  children?: undefined;
  showIcon?: undefined;
}

export type CopyButtonProps = CopyButtonWithChildrenProps | CopyButtonWithoutChildrenProps;

const SIZE_CLASSES: Record<CopyButtonSize, { button: string; icon: string; text: string }> = {
  xs: {
    button: 'px-1.5 py-0.5 gap-1',
    icon: 'text-xs',
    text: 'text-[10px]',
  },
  sm: {
    button: 'px-2 py-1 gap-1',
    icon: 'text-sm',
    text: 'text-xs',
  },
  md: {
    button: 'px-2.5 py-1.5 gap-1.5',
    icon: 'text-base',
    text: 'text-sm',
  },
  lg: {
    button: 'px-3 py-2 gap-2',
    icon: 'text-lg',
    text: 'text-base',
  },
};

const VARIANT_CLASSES: Record<CopyButtonVariant, { base: string; copied: string; hover: string }> = {
  default: {
    base: 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary border border-bolt-elements-borderColor',
    copied: 'bg-green-500/20 text-green-400 border-green-500/30',
    hover: 'hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary',
  },
  ghost: {
    base: 'bg-transparent text-bolt-elements-textSecondary',
    copied: 'bg-green-500/20 text-green-400',
    hover: 'hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary',
  },
  outline: {
    base: 'bg-transparent text-bolt-elements-textSecondary border border-bolt-elements-borderColor',
    copied: 'bg-green-500/20 text-green-400 border-green-500/30',
    hover: 'hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary hover:border-bolt-elements-borderColorActive',
  },
  minimal: {
    base: 'bg-transparent text-bolt-elements-textTertiary',
    copied: 'text-green-400',
    hover: 'hover:text-bolt-elements-textSecondary',
  },
};

/**
 * A reusable copy-to-clipboard button with visual feedback.
 * Shows a copy icon that changes to a checkmark when content is copied.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <CopyButton text="Hello World" />
 *
 * // With label
 * <CopyButton text={code} showLabel label="Copy code" />
 *
 * // Custom styling
 * <CopyButton text={content} size="lg" variant="outline" />
 *
 * // Wrapping custom content
 * <CopyButton text={data}>
 *   <MyCustomContent />
 * </CopyButton>
 * ```
 */
export const CopyButton = memo(function CopyButton({
  text,
  className,
  size = 'sm',
  variant = 'ghost',
  tooltip,
  showLabel = false,
  label = 'Copy',
  copiedLabel = 'Copied!',
  onCopy,
  onError,
  disabled = false,
  resetTimeout,
  children,
  showIcon = true,
  'aria-label': ariaLabel,
}: CopyButtonProps) {
  const { copy, copied, error } = useCopyToClipboard({ resetTimeout });

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (disabled) return;

    const success = await copy(text);

    if (success) {
      onCopy?.();
    } else if (error && onError) {
      onError(error);
    }
  }, [copy, text, disabled, onCopy, onError, error]);

  const sizeClasses = SIZE_CLASSES[size];
  const variantClasses = VARIANT_CLASSES[variant];

  const buttonClasses = classNames(
    'flex items-center rounded-md transition-all duration-200 select-none',
    sizeClasses.button,
    copied ? variantClasses.copied : variantClasses.base,
    !copied && !disabled && variantClasses.hover,
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  const iconClass = classNames(
    sizeClasses.icon,
    'transition-all duration-200',
    copied ? 'i-ph:check-bold' : 'i-ph:copy'
  );

  const displayLabel = copied ? copiedLabel : label;
  const titleText = tooltip || (copied ? 'Copied to clipboard' : 'Copy to clipboard');

  return (
    <button
      type="button"
      onClick={handleClick}
      className={buttonClasses}
      title={titleText}
      disabled={disabled}
      aria-label={ariaLabel || titleText}
      aria-pressed={copied}
    >
      {children ? (
        <>
          {showIcon && <div className={iconClass} aria-hidden="true" />}
          {children}
        </>
      ) : (
        <>
          <div className={iconClass} aria-hidden="true" />
          {showLabel && (
            <span className={classNames(sizeClasses.text, 'font-medium')}>
              {displayLabel}
            </span>
          )}
        </>
      )}
    </button>
  );
});

/**
 * Inline copy button designed for use inside text or code blocks.
 * Minimal styling that blends in with surrounding content.
 */
export const InlineCopyButton = memo(function InlineCopyButton({
  text,
  className,
  tooltip = 'Copy',
  onCopy,
}: {
  text: string;
  className?: string;
  tooltip?: string;
  onCopy?: () => void;
}) {
  return (
    <CopyButton
      text={text}
      size="xs"
      variant="minimal"
      tooltip={tooltip}
      onCopy={onCopy}
      className={classNames('inline-flex align-middle', className)}
    />
  );
});

/**
 * Copy button that appears on hover of a parent element.
 * Wrap content in a group class and this button will appear on hover.
 */
export const HoverCopyButton = memo(function HoverCopyButton({
  text,
  className,
  position = 'top-right',
  ...props
}: Omit<CopyButtonWithoutChildrenProps, 'children'> & {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}) {
  const positionClasses: Record<string, string> = {
    'top-right': 'top-2 right-2',
    'top-left': 'top-2 left-2',
    'bottom-right': 'bottom-2 right-2',
    'bottom-left': 'bottom-2 left-2',
  };

  return (
    <CopyButton
      text={text}
      {...props}
      className={classNames(
        'absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200',
        positionClasses[position],
        className
      )}
    />
  );
});

export default CopyButton;
