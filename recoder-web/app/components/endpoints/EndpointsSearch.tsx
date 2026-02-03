'use client';

import { useEffect, useRef } from 'react';
import initCanvas from './init-canvas';

interface EndpointsSearchProps {
  alwaysHeat?: boolean;
  size?: number;
  color?: string;
}

/**
 * EndpointsSearch - Animated canvas component visualizing search functionality
 * Displays a grid pattern with a pulsing center area to represent search
 * radiating outward through content.
 */
export default function EndpointsSearch({
  alwaysHeat,
  size = 20,
  color = '#FF4C00',
}: EndpointsSearchProps) {
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
      0, 0.2, 0.4, 0, 0.4, 1, 0.4, 0.2, 0.2, 0.4, 1, 0.4, 0, 0.4, 0.2, 0,
    ];

    const differs = Array.from({ length: 16 }, () => 0.2 + Math.random() * 0.2);

    differs[5] = 0.6;
    differs[6] = 0.6;
    differs[9] = 0.6;
    differs[10] = 0.6;

    const scaler = size / 20;

    const render = () => {
      ctx.fillStyle = color;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 16; i++) {
        if ([0, 3, 12, 15].includes(i)) continue;

        const maxAlpha = [5, 6, 9, 10].includes(i) ? 1 : 0.4;

        const alpha = defaultRowAlphas[i] + diff * differs[i];
        ctx.globalAlpha = Math.min(
          Math.min(alpha, maxAlpha) - Math.max(alpha - maxAlpha, 0),
          1
        );

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
