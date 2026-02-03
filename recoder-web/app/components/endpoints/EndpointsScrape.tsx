'use client';

import { useEffect, useRef, useCallback } from 'react';
import { classNames } from '~/utils/classNames';
import initCanvas from './init-canvas';

interface EndpointsScrapeProps {
  active?: boolean;
  disabledCells?: number[];
  alwaysHeat?: boolean;
  triggerOnHover?: boolean;
  size?: number;
  color?: string;
}

/**
 * EndpointsScrape - Animated canvas component visualizing web scraping
 * Displays a 4x4 grid with animated row-by-row highlighting to represent
 * data being scraped from a webpage.
 */
export default function EndpointsScrape({
  active,
  disabledCells,
  alwaysHeat = false,
  triggerOnHover = false,
  size = 20,
  color = '#FF4C00',
}: EndpointsScrapeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fnRefs = useRef<{
    activate: () => void;
    deactivate: () => void;
  }>({ activate: () => {}, deactivate: () => {} });

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = initCanvas(canvas);

    let isRunning = false;
    let isActive = false;
    let animationFrameId: number | null = null;

    let activeRow = 2;
    const rowAlphas = [0.2, 0.4, 1, 0.12];

    const scaler = size / 20;

    const render = () => {
      ctx.fillStyle = color;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 16; i++) {
        if (disabledCells && disabledCells.includes(i)) continue;

        ctx.globalAlpha = rowAlphas[Math.floor(i / 4)];

        ctx.fillRect(
          (3 + (i % 4) * 4) * scaler,
          (3 + Math.floor(i / 4) * 4) * scaler,
          2 * scaler,
          2 * scaler
        );
      }

      if (isRunning) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    const timeouts: number[] = [];

    let runCount = 0;

    // Simple animation helper that interpolates values
    const animateValue = (
      from: number,
      to: number,
      duration: number,
      onUpdate: (value: number) => void
    ) => {
      const startTime = performance.now();
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = from + (to - from) * progress;
        onUpdate(value);
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    };

    const cycle = () => {
      isRunning = true;
      activeRow = (activeRow + 1) % 5;

      rowAlphas.forEach((alpha, index) => {
        let targetAlpha = alpha;

        if (index === activeRow) targetAlpha = 1;
        else if (index === (activeRow + 1) % 4) targetAlpha = 0.12;
        else if (index === (activeRow + 2) % 4) targetAlpha = 0.2;
        else if (index === (activeRow + 3) % 4) targetAlpha = 0.4;

        animateValue(alpha, targetAlpha, 50, (value) => {
          rowAlphas[index] = value;
        });
      });

      timeouts.forEach((timeout) => {
        window.clearTimeout(timeout);
      });

      timeouts.push(
        window.setTimeout(() => {
          isRunning = false;
        }, 400)
      );

      if (activeRow === 3) runCount += 1;

      if ((runCount === 2 || !isActive) && activeRow === 2) return;

      timeouts.push(
        window.setTimeout(() => {
          cycle();
        }, 50)
      );
    };

    fnRefs.current = {
      activate: () => {
        if (isActive) return;

        isActive = true;

        runCount = 0;
        cycle();
        render();
      },
      deactivate: () => {
        if (!isActive) return;

        isActive = false;
      },
    };

    render();

    const handleResize = () => render();
    canvas.addEventListener('resize', handleResize);

    if (triggerOnHover) {
      const group = canvasRef.current?.closest('.group');

      if (group) {
        const activateHandler = () => fnRefs.current.activate();
        const deactivateHandler = () => fnRefs.current.deactivate();

        group.addEventListener('mouseenter', activateHandler);
        group.addEventListener('mouseleave', deactivateHandler);

        return () => {
          group.removeEventListener('mouseenter', activateHandler);
          group.removeEventListener('mouseleave', deactivateHandler);
          canvas.removeEventListener('resize', handleResize);
          timeouts.forEach((timeout) => window.clearTimeout(timeout));
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
      }
    }

    return () => {
      canvas.removeEventListener('resize', handleResize);
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [disabledCells, size, triggerOnHover, color]);

  useEffect(() => {
    if (triggerOnHover) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && active) {
          fnRefs.current.activate();
        } else {
          fnRefs.current.deactivate();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, [active, triggerOnHover]);

  return (
    <canvas
      className={classNames(
        alwaysHeat
          ? ''
          : [
              '[&.grayscale]:opacity-60 transition-[filter,opacity]',
              !active && 'grayscale',
            ]
      )}
      ref={canvasRef}
      style={{ width: size, height: size }}
    />
  );
}
