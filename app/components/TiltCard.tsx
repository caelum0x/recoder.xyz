'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * TiltCard — a restrained, cube-adjacent 3D depth wrapper.
 *
 * Design intent: the Recoder brand is a precise geometric cube. This gives a
 * feature card a *little 3D* — it reads as a physical plane that tips subtly
 * toward the cursor with a soft specular highlight, reinforcing the engineered
 * aesthetic without becoming a spinning demo.
 *
 * Performance + a11y contract:
 * - Pure CSS transforms (GPU-composited transform/opacity only). No three.js,
 *   no rAF loop — pointermove writes CSS custom properties directly to the ref
 *   (browser-coalesced), so there is no per-frame React re-render and no layout
 *   thrash.
 * - Zero layout shift: the wrapper reserves the child's exact box; transforms
 *   never affect layout.
 * - `prefers-reduced-motion: reduce` fully disables the tilt (no listeners
 *   attached, no transform applied) — the card renders flat.
 * - `will-change: transform` is toggled on only while hovered.
 * - The specular sheen is decorative and marked `aria-hidden`.
 */
interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  /** Max tilt in degrees on each axis. Kept small for restraint. */
  maxTilt?: number;
  /** Rounded-corner class so the sheen clips to the card shape. */
  radiusClassName?: string;
}

export function TiltCard({
  children,
  className,
  maxTilt = 6,
  radiusClassName = 'rounded-2xl',
}: TiltCardProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [motionOk, setMotionOk] = useState(false);
  const activeRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMotionOk(!mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const reset = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    activeRef.current = false;
    el.style.setProperty('--tilt-rx', '0deg');
    el.style.setProperty('--tilt-ry', '0deg');
    el.style.setProperty('--tilt-mx', '50%');
    el.style.setProperty('--tilt-my', '50%');
    el.style.setProperty('--tilt-sheen', '0');
    el.style.willChange = 'auto';
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = innerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width; // 0..1
      const py = (e.clientY - rect.top) / rect.height; // 0..1
      // Center-relative, clamped to [-0.5, 0.5].
      const dx = Math.min(0.5, Math.max(-0.5, px - 0.5));
      const dy = Math.min(0.5, Math.max(-0.5, py - 0.5));
      // Tip toward the cursor: mouse-right → rotateY positive, mouse-up → rotateX positive.
      el.style.setProperty('--tilt-ry', `${dx * maxTilt * 2}deg`);
      el.style.setProperty('--tilt-rx', `${-dy * maxTilt * 2}deg`);
      el.style.setProperty('--tilt-mx', `${px * 100}%`);
      el.style.setProperty('--tilt-my', `${py * 100}%`);
      if (!activeRef.current) {
        activeRef.current = true;
        el.style.setProperty('--tilt-sheen', '1');
        el.style.willChange = 'transform';
      }
    },
    [maxTilt],
  );

  // Reduced-motion (or SSR/first paint): render a flat, listener-free card.
  if (!motionOk) {
    return <div className={cn('h-full', className)}>{children}</div>;
  }

  return (
    <div className={cn('tilt-3d h-full', className)}>
      <div
        ref={innerRef}
        className="tilt-3d-inner relative h-full"
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
      >
        {children}
        <span
          aria-hidden="true"
          className={cn('tilt-3d-sheen pointer-events-none absolute inset-0', radiusClassName)}
        />
      </div>
    </div>
  );
}
