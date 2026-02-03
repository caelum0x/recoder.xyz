import * as RadixDialog from '@radix-ui/react-dialog';
import { motion, type Variants } from 'framer-motion';
import React, { memo, type ReactNode } from 'react';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { IconButton } from './IconButton';

export { Close as DialogClose, Root as DialogRoot } from '@radix-ui/react-dialog';

const transition = {
  duration: 0.15,
  ease: cubicEasingFn,
};

export const dialogBackdropVariants = {
  closed: {
    opacity: 0,
    transition,
  },
  open: {
    opacity: 1,
    transition,
  },
} satisfies Variants;

export const dialogVariants = {
  closed: {
    x: '-50%',
    y: '-40%',
    scale: 0.96,
    opacity: 0,
    transition,
  },
  open: {
    x: '-50%',
    y: '-50%',
    scale: 1,
    opacity: 1,
    transition,
  },
} satisfies Variants;

interface DialogButtonProps {
  type: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
  onClick?: (event: React.UIEvent) => void;
}

export const DialogButton = memo(({ type, children, onClick }: DialogButtonProps) => {
  const getButtonStyles = () => {
    switch (type) {
      case 'primary':
        return {
          backgroundColor: '#2563eb',
          color: '#ffffff',
        };
      case 'danger':
        return {
          backgroundColor: '#dc2626',
          color: '#ffffff',
        };
      case 'secondary':
      default:
        return {
          backgroundColor: 'var(--bolt-elements-bg-depth-3)',
          color: 'var(--bolt-elements-textSecondary)',
        };
    }
  };

  return (
    <button
      className="inline-flex h-[35px] items-center justify-center rounded-lg px-4 text-sm leading-none focus:outline-none transition-opacity hover:opacity-80"
      style={getButtonStyles()}
      onClick={onClick}
    >
      {children}
    </button>
  );
});

export const DialogTitle = memo(({ className, children, ...props }: RadixDialog.DialogTitleProps) => {
  return (
    <RadixDialog.Title
      className={classNames(
        'px-5 py-4 flex items-center justify-between text-lg font-semibold leading-6',
        className,
      )}
      style={{
        borderBottom: '1px solid var(--bolt-elements-borderColor)',
        color: 'var(--bolt-elements-textPrimary)',
      }}
      {...props}
    >
      {children}
    </RadixDialog.Title>
  );
});

export const DialogDescription = memo(({ className, children, ...props }: RadixDialog.DialogDescriptionProps) => {
  return (
    <RadixDialog.Description
      className={classNames('px-5 py-4 text-md', className)}
      style={{ color: 'var(--bolt-elements-textSecondary)' }}
      {...props}
    >
      {children}
    </RadixDialog.Description>
  );
});

interface DialogProps {
  children: ReactNode | ReactNode[];
  className?: string;
  onBackdrop?: (event: React.UIEvent) => void;
  onClose?: (event: React.UIEvent) => void;
  /** Accessible label for the dialog */
  'aria-label'?: string;
  /** ID of the element that labels the dialog */
  'aria-labelledby'?: string;
}

export const Dialog = memo(({ className, children, onBackdrop, onClose, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }: DialogProps) => {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay onClick={onBackdrop} asChild>
        <motion.div
          className="bg-black/50 fixed inset-0 z-max"
          initial="closed"
          animate="open"
          exit="closed"
          variants={dialogBackdropVariants}
          aria-hidden="true"
        />
      </RadixDialog.Overlay>
      <RadixDialog.Content
        asChild
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        <motion.div
          className={classNames(
            'fixed top-[50%] left-[50%] z-max max-h-[85vh] w-[90vw] max-w-[450px] translate-x-[-50%] translate-y-[-50%] rounded-lg shadow-lg focus:outline-none overflow-hidden',
            className,
          )}
          style={{
            backgroundColor: 'var(--bolt-elements-bg-depth-2)',
            border: '1px solid var(--bolt-elements-borderColor)',
          }}
          initial="closed"
          animate="open"
          exit="closed"
          variants={dialogVariants}
          role="dialog"
          aria-modal="true"
        >
          {children}
          <RadixDialog.Close asChild onClick={onClose}>
            <IconButton
              icon="i-ph:x"
              className="absolute top-[10px] right-[10px]"
              aria-label="Close dialog"
            />
          </RadixDialog.Close>
        </motion.div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
});
