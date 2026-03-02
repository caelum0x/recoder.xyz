import { memo } from 'react';
import { classNames } from '~/utils/classNames';

interface PanelHeaderButtonProps {
  className?: string;
  disabledClassName?: string;
  disabled?: boolean;
  children: string | React.JSX.Element | Array<React.JSX.Element | string>;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  title?: string;
}

export const PanelHeaderButton = memo(
  ({ className, disabledClassName, disabled = false, children, onClick, title }: PanelHeaderButtonProps) => {
    return (
      <button
        title={title}
        className={classNames(
          'flex items-center shrink-0 gap-1.5 px-1.5 rounded-md py-0.5 text-recoder-elements-item-contentDefault bg-transparent enabled:hover:text-recoder-elements-item-contentActive enabled:hover:bg-recoder-elements-item-backgroundActive disabled:cursor-not-allowed',
          {
            [classNames('opacity-30', disabledClassName)]: disabled,
          },
          className,
        )}
        disabled={disabled}
        onClick={(event) => {
          if (disabled) {
            return;
          }

          onClick?.(event);
        }}
      >
        {children}
      </button>
    );
  },
);
