import { memo } from 'react';
import { classNames } from '~/utils/classNames';

type IconSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

interface BaseIconButtonProps {
  size?: IconSize;
  className?: string;
  iconClassName?: string;
  disabledClassName?: string;
  title?: string;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  /** Accessible label for screen readers */
  'aria-label'?: string;
  /** Whether the button is pressed (for toggle buttons) */
  'aria-pressed'?: boolean;
  /** Whether the button controls an expanded element */
  'aria-expanded'?: boolean;
}

type IconButtonWithoutChildrenProps = {
  icon: string;
  children?: undefined;
} & BaseIconButtonProps;

type IconButtonWithChildrenProps = {
  icon?: undefined;
  children: string | JSX.Element | JSX.Element[];
} & BaseIconButtonProps;

type IconButtonProps = IconButtonWithoutChildrenProps | IconButtonWithChildrenProps;

export const IconButton = memo(
  ({
    icon,
    size = 'xl',
    className,
    iconClassName,
    disabledClassName,
    disabled = false,
    title,
    onClick,
    children,
    'aria-label': ariaLabel,
    'aria-pressed': ariaPressed,
    'aria-expanded': ariaExpanded,
  }: IconButtonProps) => {
    return (
      <button
        className={classNames(
          'flex items-center text-bolt-elements-textSecondary bg-transparent enabled:hover:text-bolt-elements-textPrimary rounded-md p-1 enabled:hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed',
          {
            [classNames('opacity-30', disabledClassName)]: disabled,
          },
          className,
        )}
        title={title}
        disabled={disabled}
        aria-label={ariaLabel || title}
        aria-pressed={ariaPressed}
        aria-expanded={ariaExpanded}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) {
            return;
          }

          onClick?.(event);
        }}
      >
        {children ? children : <div className={classNames(icon, getIconSize(size), iconClassName)} aria-hidden="true"></div>}
      </button>
    );
  },
);

function getIconSize(size: IconSize) {
  if (size === 'sm') {
    return 'text-sm';
  } else if (size === 'md') {
    return 'text-md';
  } else if (size === 'lg') {
    return 'text-lg';
  } else if (size === 'xl') {
    return 'text-xl';
  } else {
    return 'text-2xl';
  }
}
