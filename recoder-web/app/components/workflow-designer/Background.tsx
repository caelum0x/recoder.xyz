'use client';

import { useEffect, useRef } from 'react';

// Fixed grid and dot size in pixels
const GRID_SIZE = 20;
const DOT_SIZE = 2;
const DOT_COLOR = 'rgba(255, 255, 255, 0.15)';

export function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const { width, height } = container.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;

      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(pixelRatio, pixelRatio);
      render(width, height);
    };

    function render(width: number, height: number) {
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw grid dots
      ctx.fillStyle = DOT_COLOR;

      const horizontalDots = Math.ceil(width / GRID_SIZE) + 1;
      const verticalDots = Math.ceil(height / GRID_SIZE) + 1;

      for (let y = 0; y < verticalDots; y++) {
        for (let x = 0; x < horizontalDots; x++) {
          ctx.beginPath();
          ctx.arc(x * GRID_SIZE, y * GRID_SIZE, DOT_SIZE / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-bolt-elements-background-depth-1"
      style={{
        background: 'radial-gradient(ellipse at center, var(--bolt-elements-bg-depth-2) 0%, var(--bolt-elements-bg-depth-1) 50%, var(--bolt-elements-bg-depth-1) 100%)',
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* Radial overlay for depth effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 0%, rgba(0, 0, 0, 0.3) 100%)',
        }}
      />
    </div>
  );
}
