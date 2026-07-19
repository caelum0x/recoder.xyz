'use client';

/**
 * HeroCube — a subtle, dependency-free CSS-3D brand accent for the marketing hero.
 *
 * The Recoder brand mark is a dark geometric cube with white negative space. This
 * renders that identity as a slowly-rotating, GPU-composited CSS 3D cube (no
 * three.js / r3f / WebGL — pure CSS transforms) that also drifts a little on
 * scroll for depth.
 *
 * It is purely decorative: `aria-hidden`, `pointer-events-none`, and meant to be
 * absolutely positioned by the consumer so it introduces **zero layout shift**.
 *
 * Accessibility / performance:
 *  - `prefers-reduced-motion: reduce` freezes the spin and disables parallax
 *    (handled in CSS + guarded in JS).
 *  - Parallax is written to a CSS custom property from a throttled, passive
 *    scroll handler that only runs while the cube is on screen (IntersectionObserver),
 *    so there is no always-on rAF loop and no layout thrash on the hero.
 */

import { useEffect, useRef } from 'react';
import styles from './HeroCube.module.css';

interface HeroCubeProps {
  /** Edge-box size in px (the stage is a fixed square). Defaults to 320. */
  size?: number;
  /** Extra classes for positioning/opacity from the consumer. */
  className?: string;
  /** Parallax strength; 0 disables drift. Kept small + calm by default. */
  parallaxStrength?: number;
}

export function HeroCube({
  size = 320,
  className = '',
  parallaxStrength = 0.06,
}: HeroCubeProps) {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Respect reduced-motion: no scroll wiring at all, CSS already froze the pose.
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches || parallaxStrength === 0) return;

    let ticking = false;
    let inView = false;

    const applyParallax = () => {
      ticking = false;
      // Single cheap read; clamp so the accent never drifts far from its box.
      const offset = Math.max(-64, Math.min(64, window.scrollY * parallaxStrength));
      scene.style.setProperty('--cube-parallax', `${offset.toFixed(2)}px`);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(applyParallax);
    };

    // Only pay for scroll work while the cube is actually visible.
    const io = new IntersectionObserver(
      (entries) => {
        const nextInView = entries[0]?.isIntersecting ?? false;
        if (nextInView === inView) return;
        inView = nextInView;
        if (inView) {
          window.addEventListener('scroll', onScroll, { passive: true });
          applyParallax();
        } else {
          window.removeEventListener('scroll', onScroll);
        }
      },
      { rootMargin: '10% 0px' },
    );
    io.observe(scene);

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [parallaxStrength]);

  return (
    <div
      ref={sceneRef}
      aria-hidden="true"
      className={`${styles.scene} ${className}`}
      style={{ ['--cube-size' as string]: `${size}px` }}
    >
      <div className={styles.cube}>
        <div className={`${styles.face} ${styles.front}`} />
        <div className={`${styles.face} ${styles.back}`} />
        <div className={`${styles.face} ${styles.right}`} />
        <div className={`${styles.face} ${styles.left}`} />
        <div className={`${styles.face} ${styles.top}`} />
        <div className={`${styles.face} ${styles.bottom}`} />
      </div>
    </div>
  );
}
