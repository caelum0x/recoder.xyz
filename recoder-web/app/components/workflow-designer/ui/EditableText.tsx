'use client';

import { useCallback, useEffect, useRef, useState, type HTMLAttributes } from 'react';
import classNames from 'classnames';

interface EditableTextProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onKeyDown'> {
  text?: string;
  onValueChange?: (value: string) => void;
  onClickToEditMode?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  inputClassName?: string;
  buttonClassName?: string;
  readonly?: boolean;
}

export function EditableText({
  className,
  text,
  onValueChange,
  onClickToEditMode,
  inputClassName,
  buttonClassName,
  readonly = false,
  ...props
}: EditableTextProps) {
  const [edit, setEdit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (edit) {
      inputRef.current?.select();
      inputRef.current?.focus();
    }
  }, [edit]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = text ?? '';
    }
  }, [text]);

  const updateText = useCallback(() => {
    setEdit(false);
    const newTextValue = inputRef.current?.value ?? '';
    onValueChange?.(newTextValue);
  }, [onValueChange]);

  return (
    <div className={className} {...props}>
      <input
        type="text"
        className={classNames(
          'rounded px-2 py-1 hidden data-[editing=true]:block w-full',
          'outline-none ring-1 ring-accent-500',
          'text-recoder-elements-textPrimary text-sm bg-recoder-elements-background-depth-2',
          inputClassName
        )}
        ref={inputRef}
        data-input
        data-editing={edit}
        onBlur={() => updateText()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            updateText();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setEdit(false);
            if (inputRef.current) {
              inputRef.current.value = text ?? '';
            }
          }
        }}
      />
      <button
        type="button"
        className={classNames(
          'rounded px-2 py-1 data-[editing=true]:hidden',
          'text-recoder-elements-textPrimary text-sm text-left truncate',
          'border-0 bg-transparent',
          !readonly && 'hover:bg-recoder-elements-background-depth-3 cursor-text',
          readonly && 'cursor-default',
          buttonClassName
        )}
        data-button
        data-editing={edit}
        data-readonly={readonly}
        onClick={(e) => {
          if (readonly) {
            return;
          }
          onClickToEditMode?.(e);
          if (e.isDefaultPrevented()) {
            return;
          }
          setEdit(true);
        }}
      >
        {text || 'Untitled'}
      </button>
    </div>
  );
}
