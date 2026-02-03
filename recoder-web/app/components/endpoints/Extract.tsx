'use client';

import { useEffect, useRef } from 'react';
import initCanvas from './init-canvas';

interface ExtractProps {
  size?: number;
  color?: string;
}

/**
 * Extract - Alternative animated canvas component for data extraction
 * Displays a grid with a central expanding bar animation to represent
 * data being extracted and processed.
 */
export default function Extract({ size = 20, color = '#FF4C00' }: ExtractProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = initCanvas(canvas);

    let isRunning = false;
    let isActive = false;
    let animationFrameId: number | null = null;

    let diff = 0;
    const defaultRowAlphas = [
      0.4, 0.04, 0.2, 0.4, 0.2, 0, 0, 0.04, 0.04, 0, 0, 0.2, 0.4, 0.2, 0.04,
      0.4,
    ];

    const differs = Array.from({ length: 16 }, () => 0.2 + Math.random() * 0.2);

    const scaler = size / 20;

    const render = () => {
      ctx.fillStyle = color;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 16; i++) {
        if ([5, 6, 9, 10].includes(i)) continue;

        ctx.globalAlpha = defaultRowAlphas[i] + diff * differs[i];
        ctx.globalAlpha =
          Math.min(ctx.globalAlpha, 0.4) - Math.max(ctx.globalAlpha - 0.4, 0);

        ctx.fillRect(
          (3 + (i % 4) * 4) * scaler,
          (3 + Math.floor(i / 4) * 4) * scaler,
          2 * scaler,
          2 * scaler
        );
      }

      // Draw center extraction indicator
      ctx.globalAlpha = 1;
      ctx.fillRect(7, 7, 6, 2);
      ctx.globalAlpha = 0.4;
      ctx.fillRect(7, 11, 2 + diff * 4, 2);

      if (isRunning) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    const timeouts: number[] = [];

    let runCount = 0;

    const duration = 300;

    // Simple animation helper
    const animateValue = (
      from: number,
      to: number,
      durationMs: number,
      onUpdate: (value: number) => void
    ) => {
      const startTime = performance.now();
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
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

      animateValue(diff, 1, duration, (value) => {
        diff = value < 0.5 ? value * 2 : 1 - (value - 0.5) * 2;
      });

      timeouts.forEach((timeout) => {
        window.clearTimeout(timeout);
      });

      timeouts.push(
        window.setTimeout(
          () => {
            isRunning = false;
          },
          Math.max(duration, 300)
        )
      );

      runCount += 1;

      if (runCount === 3 || !isActive) return;

      timeouts.push(
        window.setTimeout(() => {
          cycle();
        }, duration)
      );
    };

    const activate = () => {
      if (isActive) return;

      isActive = true;

      runCount = 0;
      cycle();
      render();
    };

    const deactivate = () => {
      if (!isActive) return;

      isActive = false;
    };

    render();

    const handleResize = () => render();
    canvas.addEventListener('resize', handleResize);

    const group = canvasRef.current?.closest('.group');

    if (group) {
      group.addEventListener('mouseenter', activate);
      group.addEventListener('mouseleave', deactivate);

      return () => {
        group.removeEventListener('mouseenter', activate);
        group.removeEventListener('mouseleave', deactivate);
        canvas.removeEventListener('resize', handleResize);
        timeouts.forEach((timeout) => window.clearTimeout(timeout));
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
      };
    }

    return () => {
      canvas.removeEventListener('resize', handleResize);
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [size, color]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
}
