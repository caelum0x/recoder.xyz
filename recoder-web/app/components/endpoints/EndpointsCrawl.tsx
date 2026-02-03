'use client';

import { useEffect, useRef } from 'react';
import { classNames } from '~/utils/classNames';
import initCanvas from './init-canvas';

interface EndpointsCrawlProps {
  active?: boolean;
  alwaysHeat?: boolean;
  triggerOnHover?: boolean;
  size?: number;
  color?: string;
}

/**
 * EndpointsCrawl - Animated canvas component visualizing web crawling
 * Displays a diamond/tree pattern that animates outward from the center
 * to represent crawling from a starting URL to connected pages.
 */
export default function EndpointsCrawl({
  active,
  alwaysHeat = false,
  triggerOnHover = false,
  size = 20,
  color = '#FF4C00',
}: EndpointsCrawlProps) {
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

    let activeGroup = 0;
    const rowAlphas = [0.2, 0.4, 1, 0.04];

    // Diamond/tree pattern - center cell, then expanding rings
    const grid = [
      [24], // Center
      [16, 18, 30, 32], // First ring
      [8, 12, 36, 40], // Second ring
      [0, 3, 6, 21, 27, 42, 45, 48], // Outer ring
    ];

    const scaler = size / 20;

    const render = () => {
      ctx.fillStyle = color;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const group of grid.slice(0, 4)) {
        const groupIndex = grid.indexOf(group);
        ctx.globalAlpha = rowAlphas[groupIndex];

        for (const index of group) {
          ctx.fillRect(
            (3 + (index % 7) * 2) * scaler,
            (3 + Math.floor(index / 7) * 2) * scaler,
            2 * scaler,
            2 * scaler
          );
        }
      }

      if (isRunning) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    const timeouts: number[] = [];

    let runCount = 0;

    // Simple animation helper
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
      activeGroup = (activeGroup + 1) % 5;

      rowAlphas.forEach((alpha, index) => {
        let targetAlpha = alpha;

        if (index === activeGroup) targetAlpha = 1;
        else if (index === (activeGroup + 1) % 4) targetAlpha = 0.12;
        else if (index === (activeGroup + 2) % 4) targetAlpha = 0.2;
        else if (index === (activeGroup + 3) % 4) targetAlpha = 0.4;

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
        }, 300)
      );

      if (activeGroup === 3) runCount += 1;

      if ((runCount === 2 || !isActive) && activeGroup === 2) return;

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
  }, [triggerOnHover, size, color]);

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
