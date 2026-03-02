import * as React from "react"
import { classNames } from '~/utils/classNames';

export interface SimpleDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export interface DialogContentProps {
  className?: string;
  children: React.ReactNode;
}

export interface DialogHeaderProps {
  className?: string;
  children: React.ReactNode;
}

export interface DialogTitleProps {
  className?: string;
  children: React.ReactNode;
}

const Dialog = ({ open, onOpenChange, children }: SimpleDialogProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={() => onOpenChange?.(false)}
      />
      {/* Dialog content wrapper */}
      <div className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
        {children}
      </div>
    </div>
  );
};

const DialogContent = ({ className, children }: DialogContentProps) => {
  return (
    <div
      className={classNames(
        "w-full max-w-lg rounded-lg bg-recoder-elements-background-depth-2 p-6 shadow-xl border border-recoder-elements-borderColor",
        className
      )}
    >
      {children}
    </div>
  );
};

const DialogHeader = ({ className, children }: DialogHeaderProps) => {
  return (
    <div
      className={classNames(
        "flex flex-col space-y-1.5 text-center sm:text-left mb-4",
        className
      )}
    >
      {children}
    </div>
  );
};

const DialogTitle = ({ className, children }: DialogTitleProps) => {
  return (
    <h3
      className={classNames(
        "text-lg font-semibold leading-none tracking-tight text-recoder-elements-textPrimary",
        className
      )}
    >
      {children}
    </h3>
  );
};

export { Dialog, DialogContent, DialogHeader, DialogTitle }
