'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface TourStep {
  target: string; // CSS selector
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface FeatureTourProps {
  tourId: string;
  steps: TourStep[];
  onComplete?: () => void;
}

export function FeatureTour({ tourId, steps, onComplete }: FeatureTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Check if tour already completed
  useEffect(() => {
    const completed = localStorage.getItem(`tour-${tourId}-completed`);
    if (!completed) {
      // Small delay to let the page render
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, [tourId]);

  // Position the tooltip relative to the target element
  useEffect(() => {
    if (!isVisible || !steps[currentStep]) return;

    const step = steps[currentStep];
    const targetEl = document.querySelector(step.target);
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    setHighlightRect(rect);

    const pos = step.position || 'bottom';
    const gap = 12;
    let top = 0;
    let left = 0;

    switch (pos) {
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2;
        break;
      case 'top':
        top = rect.top - gap;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - gap;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + gap;
        break;
    }

    setTooltipPosition({ top, left });

    // Scroll target into view if needed
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentStep, isVisible, steps]);

  const handleComplete = useCallback(() => {
    setIsVisible(false);
    localStorage.setItem(`tour-${tourId}-completed`, 'true');
    onComplete?.();
  }, [tourId, onComplete]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, steps.length, handleComplete]);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  if (!isVisible || !steps[currentStep]) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  return (
    <>
      {/* Backdrop overlay */}
      <div className="fixed inset-0 z-[9998] bg-black/40 transition-opacity" onClick={handleSkip} />

      {/* Highlight cutout */}
      {highlightRect && (
        <div
          className="fixed z-[9999] rounded-lg ring-2 ring-primary ring-offset-2 pointer-events-none"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-[10000] w-72 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          transform: 'translateX(-50%)',
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-semibold text-sm">{step.title}</h4>
          <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-1" onClick={handleSkip}>
            <X className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{step.description}</p>
        <div className="flex items-center justify-between">
          {/* Step dots */}
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  i === currentStep ? 'bg-primary' : 'bg-muted'
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSkip}>
              <SkipForward className="h-3 w-3 mr-1" />
              Skip
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleNext}>
              {isLast ? 'Done' : 'Next'}
              {!isLast && <ChevronRight className="h-3 w-3 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
