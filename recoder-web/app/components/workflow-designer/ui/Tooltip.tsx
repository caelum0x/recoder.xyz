'use client';

import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from 'react';
import classNames from 'classnames';

interface TooltipProps {
  children: ReactNode;
  text: ReactNode;
  sideOffset?: number;
  delayDuration?: number;
  className?: string;
  variant?: 'light' | 'dark';
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

export function Tooltip({
  children,
  text,
  sideOffset = 8,
  delayDuration = 300,
  className,
  variant = 'dark',
  side = 'top',
  align = 'center',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let top = 0;
      let left = 0;

      // Calculate position based on side
      switch (side) {
        case 'top':
          top = -tooltipRect.height - sideOffset;
          break;
        case 'bottom':
          top = triggerRect.height + sideOffset;
          break;
        case 'left':
          left = -tooltipRect.width - sideOffset;
          top = (triggerRect.height - tooltipRect.height) / 2;
          break;
        case 'right':
          left = triggerRect.width + sideOffset;
          top = (triggerRect.height - tooltipRect.height) / 2;
          break;
      }

      // Calculate alignment
      if (side === 'top' || side === 'bottom') {
        switch (align) {
          case 'start':
            left = 0;
            break;
          case 'center':
            left = (triggerRect.width - tooltipRect.width) / 2;
            break;
          case 'end':
            left = triggerRect.width - tooltipRect.width;
            break;
        }
      }

      setPosition({ top, left });
    }
  }, [isVisible, side, align, sideOffset]);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayDuration);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={classNames(
            'absolute z-50 px-2 py-1 text-xs rounded shadow-md whitespace-nowrap',
            'animate-fade-in',
            variant === 'light' && 'bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary',
            variant === 'dark' && 'bg-recoder-elements-background-depth-2 text-recoder-elements-textPrimary',
            className
          )}
          style={position}
        >
          {text}
        </div>
      )}
    </span>
  );
}
